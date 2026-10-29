'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { LockBanner } from '@/components/lock-banner';
import { PengantarLkpd, KepalaTahap } from '@/components/lkpd-pengantar';
import { RingkasanTinjau, KartuTinjau, type HasilTinjau } from '@/components/tinjau-soal';
import { InputLampiranEssay } from '@/components/input-lampiran-essay';
import { Modal } from '@/components/ui/modal';
import { ScoreRing } from '@/components/ui/score-ring';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { UUID_RE } from '@/lib/akses';
import type { LampiranJawaban } from '@/lib/lampiran/tipe';
import { hapusLampiranStorage } from '@/lib/lampiran/unggah-xhr';
import {
  JENIS,
  OPSI,
  apakahSoalTerjawab,
  bobotSoal,
  formatTanggal,
  isJenis,
  muatSoalSiswa,
  pesanGalat,
  petaJawaban,
  petaLampiran,
  tahapanDari,
  teksOpsi,
  urutkanSoal,
  type JenisPengerjaan,
  type Soal,
  type TahapLkpd,
} from '@/lib/pengerjaan';
import { ArrowLeft, Clock, AlertTriangle, Send, RotateCcw, CheckCircle2, Check, CloudUpload, ArrowRight, MessageSquareQuote, ChevronDown, ListChecks } from 'lucide-react';

interface MetaLkpd {
  judul: string | null;
  tujuan: string | null;
  petunjuk: string | null;
  tahapan: TahapLkpd[];
}
interface Kelompok {
  kunci: string;
  judul: string | null;
  instruksi: string | null;
  soal: Soal[];
}

interface PengerjaanProps {
  params: {
    type: string;
    id: string;
  };
}

type Fase = 'memuat' | 'galat' | 'tidak-ada' | 'terkunci' | 'form' | 'tinjau' | 'selesai';

interface KirimanLama {
  jawaban: Record<string, string>;
  lampiran: Record<string, LampiranJawaban[]>;
  score: number | null;
  feedback: string | null;
  status: string | null;
  waktu: string | null;
  bolehUlang: boolean;
}

const LANJUTAN: Partial<Record<JenisPengerjaan, { jenis: JenisPengerjaan; label: string }>> = {
  lkpd: { jenis: 'latihan', label: 'Lanjut ke Latihan Soal' },
  latihan: { jenis: 'evaluasi', label: 'Lanjut ke Evaluasi Akhir' },
};

const kunciDraf = (uid: string, jenis: string, id: string) => `elearnmath:draft:${uid}:${jenis}:${id}`;
function bacaDraf(key: string): { answers: Record<string, string>; attachments?: Record<string, LampiranJawaban[]>; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d.answers !== 'object' || !d.answers) return null;
    return {
      answers: d.answers,
      attachments: petaLampiran({ attachments: d.attachments }),
      savedAt: Number(d.savedAt || Date.now()),
    };
  } catch {
    return null;
  }
}
function hapusDraf(key: string | null) {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* penyimpanan peramban tidak tersedia */
  }
}
const jam = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export default function PengerjaanPage({ params }: PengerjaanProps) {
  const router = useRouter();
  const supabase = createClient();
  const { type, id } = params;
  const jenis = isJenis(type) ? type : null;
  const judul = jenis ? JENIS[jenis].judul : 'Pengerjaan Modul';

  const [fase, setFase] = useState<Fase>('memuat');
  const [pesan, setPesan] = useState('');
  const [lockReason, setLockReason] = useState<{ title: string; desc: string; link: string; btn: string } | null>(null);
  const [userId, setUserId] = useState('');
  const [namaSiswa, setNamaSiswa] = useState('Siswa');
  const [judulMateri, setJudulMateri] = useState('');
  const [muatUlang, setMuatUlang] = useState(0);
  const [draftKey, setDraftKey] = useState<string | null>(null);

  // Soal, Jawaban Teks & Lampiran Berkas Essay
  const [questions, setQuestions] = useState<Soal[]>([]);
  const [metaLkpd, setMetaLkpd] = useState<MetaLkpd | null>(null);
  const bagianAktif = useRef('Awal lembar');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [jawabanAwal, setJawabanAwal] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, LampiranJawaban[]>>({});
  const [lampiranAwal, setLampiranAwal] = useState<Record<string, LampiranJawaban[]>>({});
  const [sibukLampiran, setSibukLampiran] = useState<Record<string, boolean>>({});
  const [kirimanLama, setKirimanLama] = useState<KirimanLama | null>(null);
  const [tinjau, setTinjau] = useState<{ dinilai: boolean; soal: Record<string, HasilTinjau> } | null>(null);
  const [tinjauGagal, setTinjauGagal] = useState(false);
  const [mengulang, setMengulang] = useState(false);
  const [drafPulih, setDrafPulih] = useState<number | null>(null);
  const [tersimpanPada, setTersimpanPada] = useState<number | null>(null);
  const [tandaiKosong, setTandaiKosong] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ skor: number; maks: number } | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const tabCount = useRef(0);

  useEffect(() => {
    let batal = false;
    const gagal = (err: { message?: string; code?: string } | null) => {
      if (batal) return;
      setPesan(pesanGalat(err));
      setFase('galat');
    };

    async function initCheckAndLoad() {
      setFase('memuat');
      const { data: { user } } = await supabase.auth.getUser();
      if (batal) return;
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);

      if (!jenis || !UUID_RE.test(id)) {
        setPesan(!jenis ? 'Jenis pengerjaan tidak dikenal.' : 'Materi untuk tugas ini tidak ditemukan.');
        setFase('tidak-ada');
        return;
      }
      const key = kunciDraf(user.id, jenis, id);
      setDraftKey(key);

      const [profilRes, materiRes] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('materi').select('id, title, chapter_number').eq('id', id).maybeSingle(),
      ]);
      if (batal) return;
      setNamaSiswa(profilRes.data?.full_name || user.email?.split('@')[0] || 'Siswa');
      if (materiRes.error) return gagal(materiRes.error);
      if (!materiRes.data) {
        setPesan('Materi untuk tugas ini tidak ditemukan.');
        setFase('tidak-ada');
        return;
      }
      setJudulMateri(`Bab ${materiRes.data.chapter_number}: ${materiRes.data.title}`);

      // 1. Verifikasi Prasyarat Penguncian (LKPD -> Latihan -> Evaluasi, per materi)
      if (jenis === 'latihan' || jenis === 'evaluasi') {
        const tabelSyarat = jenis === 'latihan' ? 'jawaban_lkpd' : 'pengerjaan_latihan';
        const { data: syarat, error } = await supabase
          .from(tabelSyarat)
          .select('id')
          .eq('id_siswa', user.id)
          .eq('id_materi', id)
          .limit(1);
        if (batal) return;
        if (error) return gagal(error);
        if (!syarat?.length) {
          setLockReason(
            jenis === 'latihan'
              ? {
                  title: 'Modul Latihan Masih Terkunci',
                  desc: 'Anda wajib mengumpulkan Lembar Kerja Peserta Didik (LKPD) materi ini terlebih dahulu sebelum dapat membuka dan mengerjakan latihan soal.',
                  link: `/siswa/pengerjaan/lkpd/${id}`,
                  btn: 'Buka Modul LKPD Sekarang',
                }
              : {
                  title: 'Modul Evaluasi Akhir Masih Terkunci',
                  desc: 'Anda wajib menyelesaikan lembar Latihan Soal terlebih dahulu sebelum membuka dan mengerjakan lembar Evaluasi Akhir Bab.',
                  link: `/siswa/pengerjaan/latihan/${id}`,
                  btn: 'Buka Modul Latihan Sekarang',
                }
          );
          setFase('terkunci');
          return;
        }
      }

      // 2. Pengumpulan sebelumnya (evaluasi tercatat sekali per siswa)
      let lama: KirimanLama | null = null;
      if (jenis === 'lkpd') {
        const { data, error } = await supabase
          .from('jawaban_lkpd')
          .select('file_answers_json, status, score, feedback, allow_retake, created_at')
          .eq('id_siswa', user.id)
          .eq('id_materi', id)
          .limit(1);
        if (error) return gagal(error);
        const r = data?.[0];
        if (r) lama = { jawaban: petaJawaban(r.file_answers_json), lampiran: petaLampiran(r.file_answers_json), score: r.score, feedback: r.feedback, status: r.status, waktu: r.created_at, bolehUlang: Boolean(r.allow_retake) };
      } else if (jenis === 'latihan') {
        const { data, error } = await supabase
          .from('pengerjaan_latihan')
          .select('answers_json, score, feedback, completed_at')
          .eq('id_siswa', user.id)
          .eq('id_materi', id)
          .limit(1);
        if (error) return gagal(error);
        const r = data?.[0];
        if (r) lama = { jawaban: petaJawaban(r.answers_json), lampiran: petaLampiran(r.answers_json), score: r.score, feedback: r.feedback, status: r.feedback !== null ? 'graded' : null, waktu: r.completed_at, bolehUlang: false };
      } else {
        const { data, error } = await supabase
          .from('pengerjaan_evaluasi')
          .select('answers_json, score, feedback, dinilai_at, completed_at')
          .eq('id_siswa', user.id)
          .or(`id_materi.eq.${id},id_materi.is.null`)
          .limit(1);
        if (error) return gagal(error);
        const r = data?.[0];
        if (r) lama = { jawaban: petaJawaban(r.answers_json), lampiran: petaLampiran(r.answers_json), score: r.score, feedback: r.dinilai_at ? r.feedback : null, status: r.dinilai_at ? 'graded' : null, waktu: r.completed_at, bolehUlang: false };
      }
      if (batal) return;

      // 3. Muat Bank Soal (tanpa kunci jawaban) + struktur LKPD bertahap
      const [{ data: soal, error: soalError }, metaRes] = await Promise.all([
        muatSoalSiswa(supabase, jenis, id),
        jenis === 'lkpd' ? supabase.from('lkpd').select('judul, tujuan, petunjuk, tahapan').eq('id_materi', id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (batal) return;
      if (soalError) return gagal(soalError);
      const meta = metaRes.data ? { ...(metaRes.data as any), tahapan: tahapanDari((metaRes.data as any).tahapan) } : null;
      setMetaLkpd(meta);

      setQuestions(urutkanSoal((soal ?? []) as unknown as Soal[], meta?.tahapan));
      setKirimanLama(lama);

      if (lama && !lama.bolehUlang) {
        hapusDraf(key);
        // Benar/salah per soal (kunci & contoh jawaban baru dibuka setelah guru menilai)
        const { data: t, error: tErr } = await supabase.rpc('tinjau_pengerjaan', { p_jenis: jenis, p_id_materi: id });
        if (batal) return;
        const daftar: ({ id: string } & Partial<HasilTinjau>)[] = Array.isArray(t?.soal) ? t.soal : [];
        setTinjau(
          tErr
            ? null
            : { dinilai: Boolean(t?.dinilai), soal: Object.fromEntries(daftar.map((x) => [x.id, { benar: x.benar ?? null, kunci: x.kunci ?? null, pembahasan: x.pembahasan ?? null }])) }
        );
        setTinjauGagal(Boolean(tErr));
        setFase('tinjau');
        return;
      }
      if (!soal?.length) {
        setPesan('Soal untuk tugas ini belum tersedia. Silakan hubungi guru Anda.');
        setFase('tidak-ada');
        return;
      }

      // Jawaban & lampiran awal: jawaban lama (jika boleh ulang) ditimpa draf yang tersimpan di peramban.
      const awal = lama?.bolehUlang ? lama.jawaban : {};
      const awalLampiran = lama?.bolehUlang ? lama.lampiran : {};
      const draf = bacaDraf(key);
      setMengulang(Boolean(lama?.bolehUlang));
      setJawabanAwal(awal);
      setLampiranAwal(awalLampiran);
      setAnswers(draf ? { ...awal, ...draf.answers } : awal);
      setAttachments(draf?.attachments ? { ...awalLampiran, ...draf.attachments } : awalLampiran);
      setDrafPulih(draf ? draf.savedAt : null);
      setTersimpanPada(draf ? draf.savedAt : null);
      setFase('form');
    }

    initCheckAndLoad().catch((err) => gagal(err));
    return () => {
      batal = true;
    };
  }, [jenis, id, router, supabase, muatUlang]);

  // Simpan draf otomatis di peramban (termasuk metadata lampiran yang sudah terunggah)
  useEffect(() => {
    if (fase !== 'form' || !draftKey) return;
    const t = setTimeout(() => {
      const adaIsiTeks = Object.values(answers).some((v) => v.trim());
      const adaIsiLampiran = Object.values(attachments).some((arr) => arr.length > 0);
      if (!adaIsiTeks && !adaIsiLampiran) return;
      try {
        const now = Date.now();
        localStorage.setItem(draftKey, JSON.stringify({ answers, attachments, savedAt: now }));
        setTersimpanPada(now);
      } catch {
        /* penyimpanan peramban penuh / dinonaktifkan */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [answers, attachments, fase, draftKey]);

  // Simpan seketika saat halaman ditutup / ditinggal, agar ketikan & lampiran terakhir tidak hilang.
  const jawabanRef = useRef(answers);
  jawabanRef.current = answers;
  const lampiranRef = useRef(attachments);
  lampiranRef.current = attachments;
  const bolehSimpanDraf = useRef(false);
  useEffect(() => {
    bolehSimpanDraf.current = fase === 'form';
    if (fase !== 'form' || !draftKey) return;
    const simpanSekarang = () => {
      if (!bolehSimpanDraf.current) return;
      const adaTeks = Object.values(jawabanRef.current).some((v) => v.trim());
      const adaLampiran = Object.values(lampiranRef.current).some((arr) => arr.length > 0);
      if (!adaTeks && !adaLampiran) return;
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ answers: jawabanRef.current, attachments: lampiranRef.current, savedAt: Date.now() })
        );
      } catch {
        /* penyimpanan peramban tidak tersedia */
      }
    };
    window.addEventListener('pagehide', simpanSekarang);
    return () => {
      window.removeEventListener('pagehide', simpanSekarang);
      simpanSekarang();
    };
  }, [fase, draftKey]);

  // Anti-Cheat: Deteksi Perpindahan Tab (hanya saat lembar jawaban terbuka)
  useEffect(() => {
    if (fase !== 'form' || !jenis) return;
    const handleVisibilityChange = async () => {
      if (!document.hidden) return;
      tabCount.current += 1;
      const jumlah = tabCount.current;
      setTabSwitches(jumlah);
      setShowWarning(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Catat juga bab & bagian yang sedang dikerjakan (tahap/soal terakhir yang disentuh)
      const { error } = await supabase.from('tab_switch_logs').insert({
        id_siswa: user.id,
        category: jenis,
        switch_count: jumlah,
        id_materi: UUID_RE.test(id) ? id : null,
        bagian: bagianAktif.current.slice(0, 120),
      });
      if (error) console.warn('Gagal mencatat perpindahan tab:', error.message);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fase, jenis, id, supabase]);

  // Catat mulai mengerjakan (sekali saat lembar terbuka)
  const sudahCatat = useRef(false);
  useEffect(() => {
    if (fase !== 'form' || !jenis || sudahCatat.current) return;
    sudahCatat.current = true;
    supabase.rpc('catat_aktivitas', { p_jenis: 'mulai_tugas', p_id_materi: id, p_detail: { jenis } }).then(() => {}, () => {});
  }, [fase, jenis, id, supabase]);

  const handleSelectAnswer = (questionId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleChangeLampiran = (questionId: string, daftar: LampiranJawaban[]) => {
    setAttachments((prev) => ({ ...prev, [questionId]: daftar }));
  };

  const handleSibukLampiran = (questionId: string, sibuk: boolean) => {
    setSibukLampiran((prev) => (prev[questionId] === sibuk ? prev : { ...prev, [questionId]: sibuk }));
  };

  const pathAwalSet = React.useMemo(() => {
    const s = new Set<string>();
    Object.values(lampiranAwal).forEach((arr) => arr.forEach((l) => s.add(l.path)));
    return s;
  }, [lampiranAwal]);

  const adaLampiranSibuk = Object.values(sibukLampiran).some(Boolean);
  const kosong = questions.filter((q) => !apakahSoalTerjawab(q, answers[q.id], attachments[q.id]));
  const terjawab = questions.length - kosong.length;
  const maksTotal = questions.reduce((s, q) => s + bobotSoal(q), 0) || 100;
  const maksPg = questions.filter((q) => q.tipe === 'pg').reduce((s, q) => s + bobotSoal(q), 0);
  const adaUraian = questions.some((q) => q.tipe !== 'pg');
  const lanjutan = jenis ? LANJUTAN[jenis] : undefined;
  const linkMateri = UUID_RE.test(id) ? `/siswa/materi/${id}` : '/siswa/materi';

  // Penomoran soal berurutan & pengelompokan per tahap LKPD
  const nomorSoal = new Map(questions.map((q, i) => [q.id, i + 1]));
  const tahapAsli = jenis === 'lkpd' && metaLkpd ? metaLkpd.tahapan.filter((t) => questions.some((q) => q.id_materi && q.tahap === t.kunci)) : [];
  const kelompok: Kelompok[] = (() => {
    if (!tahapAsli.length || !metaLkpd) return [{ kunci: '_semua', judul: null, instruksi: null, soal: questions }];
    const out: Kelompok[] = [];
    const umum = questions.filter((q) => !q.id_materi);
    if (umum.length) out.push({ kunci: '_umum', judul: 'Soal Pembuka', instruksi: null, soal: umum });
    tahapAsli.forEach((t) => out.push({ kunci: t.kunci, judul: t.judul, instruksi: t.instruksi, soal: questions.filter((q) => q.id_materi && q.tahap === t.kunci) }));
    const lain = questions.filter((q) => q.id_materi && !metaLkpd.tahapan.some((t) => t.kunci === q.tahap));
    if (lain.length) out.push({ kunci: '_lain', judul: 'Soal Lainnya', instruksi: null, soal: lain });
    return out;
  })();
  const bertahap = kelompok.length > 1 || !!kelompok[0]?.judul;

  // Pesan validasi ikut berkurang saat soal dijawab dan hilang sendiri bila semua terisi.
  const pesanValidasi =
    tandaiKosong && kosong.length ? `Masih ada ${kosong.length} soal yang belum dijawab. Lengkapi dulu sebelum mengumpulkan.` : null;
  const pesanBar = submitError ?? pesanValidasi;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (adaLampiranSibuk) {
      setSubmitError('Tunggu hingga proses auto-kompresi dan unggah berkas selesai (100%) sebelum mengumpulkan jawaban.');
      return;
    }
    if (kosong.length) {
      setTandaiKosong(true);
      const el = document.getElementById(`soal-${kosong[0].id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
      return;
    }
    setKonfirmasi(true);
  };

  const kirimJawaban = async () => {
    if (!jenis) return;
    setSubmitting(true);
    try {
      const lampiranBersih = Object.fromEntries(
        Object.entries(attachments).filter(([, daftar]) => Array.isArray(daftar) && daftar.length > 0)
      );
      const adaLampiran = Object.keys(lampiranBersih).length > 0;

      // Skor pilihan ganda dihitung di database (kunci jawaban tidak dikirim ke browser)
      let res = await supabase.rpc('kumpulkan_pengerjaan', {
        p_jenis: jenis,
        p_id_materi: id,
        p_jawaban: answers,
        p_lampiran: lampiranBersih,
      });

      // Fallback kompatibilitas bila migrasi 20261029 belum dijalankan dan siswa hanya mengirim jawaban teks/PG
      if (
        res.error &&
        (res.error.code === 'PGRST202' || /could not find the function/i.test(res.error.message || '')) &&
        !adaLampiran
      ) {
        res = await supabase.rpc('kumpulkan_pengerjaan', {
          p_jenis: jenis,
          p_id_materi: id,
          p_jawaban: answers,
        });
      }

      if (res.error) {
        setKonfirmasi(false);
        if (
          adaLampiran &&
          (res.error.code === 'PGRST202' || /could not find the function/i.test(res.error.message || ''))
        ) {
          setSubmitError(
            'Penyimpanan lampiran essay belum diaktifkan di database: jalankan migrasi 20261029_lampiran_essay_dan_deteksi_ai.sql terlebih dahulu.'
          );
        } else {
          setSubmitError(pesanGalat(res.error));
        }
        return;
      }

      // Saat pengerjaan ulang selesai, bersihkan berkas lama yang sudah diganti/dihapus siswa agar hemat storage
      const pathTerkumpul = new Set<string>();
      Object.values(lampiranBersih).forEach((arr) => arr.forEach((l) => pathTerkumpul.add(l.path)));
      const pathUsang = Array.from(pathAwalSet).filter((p) => !pathTerkumpul.has(p));
      if (pathUsang.length) {
        hapusLampiranStorage(supabase, pathUsang).catch(() => {});
      }

      bolehSimpanDraf.current = false;
      hapusDraf(draftKey);
      setHasil({ skor: Number(res.data?.skor_pg ?? 0), maks: Number(res.data?.maks_pg ?? 0) });
      setKonfirmasi(false);
      setFase('selesai');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setKonfirmasi(false);
      setSubmitError(pesanGalat(err));
    } finally {
      setSubmitting(false);
    }
  };

  const mulaiDariAwal = () => {
    const pathBaruSesi = Object.values(attachments)
      .flat()
      .map((l) => l.path)
      .filter((p) => !pathAwalSet.has(p));
    if (pathBaruSesi.length) {
      hapusLampiranStorage(supabase, pathBaruSesi).catch(() => {});
    }
    hapusDraf(draftKey);
    setAnswers(jawabanAwal);
    setAttachments(lampiranAwal);
    setDrafPulih(null);
    setTersimpanPada(null);
  };

  if (fase === 'memuat') {
    return (
      <div className="min-h-screen flex flex-col" role="status" aria-live="polite">
        <span className="sr-only">Memuat lembar pengerjaan...</span>
        <div className="h-16 bg-white/60 backdrop-blur-md border-b border-white/70 px-4 sm:px-6 flex items-center justify-between">
          <Skeleton className="w-36 h-8" />
          <Skeleton className="w-28 h-8 rounded-full" />
        </div>
        <div className="flex-1 p-6 md:p-8 max-w-[860px] w-full mx-auto space-y-5">
          <Skeleton className="w-36 h-8" />
          <div className="glass-card p-6 md:p-8 space-y-3">
            <Skeleton className="w-32 h-4" />
            <Skeleton className="w-2/3 h-8" />
            <Skeleton className="w-full h-4" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="glass-card p-6 md:p-8 space-y-3">
              <Skeleton className="w-40 h-5" />
              <Skeleton className="w-full h-5" />
              <Skeleton className="w-full h-12" />
              <Skeleton className="w-full h-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sudahDinilai = kirimanLama?.status === 'graded';
  const dinilaiTinjau = tinjau ? tinjau.dinilai : sudahDinilai;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={judul} userRole="siswa" userName={namaSiswa} />
      {jenis && <SiswaNav aktif={`/siswa/${jenis}`} />}

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[860px] w-full mx-auto">
        <div className="mb-5 flex justify-between items-center gap-3 flex-wrap">
          <Link
            href={linkMateri}
            className="btn-press inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] hover:bg-white shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Materi
          </Link>

          {/* Tab Switch Counter Warning */}
          {tabSwitches > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FDEAE7] border border-[#FECACA] rounded-full text-xs font-bold text-[#E3543F] anim-pop">
              <AlertTriangle className="w-3.5 h-3.5" />
              Keluar Tab: {tabSwitches}x
            </div>
          )}
        </div>

        {/* Peringatan Tab Switch */}
        {showWarning && fase === 'form' && (
          <div role="alert" className="mb-5 p-4 rounded-2xl bg-[#FFF1DD] border-2 border-[#FFB454] flex items-center justify-between gap-3 text-xs font-bold text-[#92400E] anim-rise">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#F0932B] shrink-0" />
              <span>Peringatan: Sistem mendeteksi perpindahan tab peramban. Aktivitas dicatat demi integritas pengerjaan.</span>
            </div>
            <button
              onClick={() => setShowWarning(false)}
              className="btn-press px-2.5 py-1 bg-white rounded-lg border border-[#F0932B] text-[#92400E] shrink-0"
            >
              Saya Mengerti
            </button>
          </div>
        )}

        {fase === 'galat' && (
          <div className="glass-card p-8 text-center anim-rise">
            <div className="w-14 h-14 rounded-2xl bg-[#FDEAE7] text-[#E3543F] flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-extrabold text-[#991B1B] mb-2">Lembar pengerjaan gagal dimuat</h2>
            <p className="text-sm text-[#66748C] mb-6">{pesan}</p>
            <button
              onClick={() => setMuatUlang((n) => n + 1)}
              className="btn-primary px-5 py-2.5 rounded-xl font-bold text-sm"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {fase === 'tidak-ada' && (
          <div className="glass-card p-8 text-center anim-rise">
            <div className="text-5xl font-extrabold text-[#2E7BC4]/25 mb-3" aria-hidden="true">∅</div>
            <h2 className="text-lg font-extrabold text-[#1B4E80] mb-2">Tugas tidak tersedia</h2>
            <p className="text-sm text-[#66748C] mb-6">{pesan}</p>
            <Link href="/siswa/materi" className="btn-primary inline-block px-5 py-2.5 rounded-xl font-bold text-sm">
              Lihat Daftar Modul
            </Link>
          </div>
        )}

        {/* JIKA MODUL TERKUNCI OLEH PRASYARAT (LKPD -> LATIHAN / LATIHAN -> EVALUASI) */}
        {fase === 'terkunci' && lockReason && (
          <div className="glass-card p-6 md:p-8">
            <LockBanner
              title={lockReason.title}
              description={<p>{lockReason.desc}</p>}
              actionText={lockReason.btn}
              actionHref={lockReason.link}
            />
          </div>
        )}

        {/* TAMPILAN SELESAI */}
        {fase === 'selesai' && (
          <div className="glass-card p-8 md:p-12 text-center anim-pop">
            <svg viewBox="0 0 64 64" className="w-20 h-20 mx-auto mb-4" aria-hidden="true">
              <circle cx="32" cy="32" r="30" fill="#E4F8EE" />
              <path d="M19 33 l9 9 l17 -19" fill="none" stroke="#15885A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="anim-draw" />
            </svg>
            <h2 className="text-2xl font-extrabold text-[#113355] mb-2">Pengumpulan Berhasil!</h2>
            <p className="text-sm text-[#66748C] max-w-md mx-auto mb-7">
              Lembar jawaban Anda sudah tersimpan. Guru akan memeriksa{adaUraian ? ' jawaban uraian' : ''} dan memvalidasi nilai akhirnya; kabarnya muncul di lonceng notifikasi.
            </p>
            {hasil && hasil.maks > 0 && (
              <div className="inline-flex flex-col items-center px-8 py-5 rounded-3xl bg-[#F4F9FF] border border-[#DCEAF7] mb-8">
                <ScoreRing value={hasil.skor} max={maksTotal} caption="Skor sementara" />
                <div className="text-xs text-[#4B5A70] mt-3 tabular">
                  Pilihan ganda: <strong>{hasil.skor} / {hasil.maks}</strong> poin
                  {adaUraian && <> &bull; Uraian ({maksTotal - hasil.maks} poin) dinilai guru</>}
                </div>
              </div>
            )}
            <div className="flex justify-center gap-3 flex-wrap">
              <Link
                href={linkMateri}
                className="btn-secondary px-6 py-3 rounded-xl font-bold text-sm"
              >
                Kembali ke Halaman Materi
              </Link>
              <button
                type="button"
                onClick={() => {
                  setHasil(null);
                  setMuatUlang((n) => n + 1);
                }}
                className="btn-secondary px-6 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-1.5"
              >
                <ListChecks className="w-4 h-4" /> Lihat Hasil per Soal
              </button>
              {lanjutan && (
                <Link
                  href={`/siswa/pengerjaan/${lanjutan.jenis}/${id}`}
                  className="btn-primary group px-6 py-3 rounded-xl font-bold text-sm inline-flex items-center gap-1.5"
                >
                  {lanjutan.label}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* TINJAU: SUDAH DIKUMPULKAN */}
        {fase === 'tinjau' && kirimanLama && (
          <div className="space-y-5">
            <div className="hero-card p-6 md:p-8 anim-rise">
              <div className="flex items-center gap-2 text-[#15885A] text-xs font-bold uppercase tracking-wider mb-2">
                <CheckCircle2 className="w-4 h-4" /> Sudah Dikumpulkan
              </div>
              <h1 className="text-2xl font-extrabold tracking-[-0.015em] text-[#1B4E80] mb-1">{judul}</h1>
              <p className="text-xs text-[#66748C]">
                {judulMateri} &bull; Dikumpulkan {formatTanggal(kirimanLama.waktu)}
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-6 items-center p-5 rounded-2xl bg-[#F4F9FF] border border-[#DCEAF7]">
                <ScoreRing
                  value={kirimanLama.score}
                  max={sudahDinilai ? 100 : maksTotal}
                  tone={sudahDinilai ? 'green' : 'orange'}
                  caption={sudahDinilai ? 'Nilai akhir dari guru' : 'Skor sementara'}
                />
                <div>
                  {sudahDinilai ? (
                    <div className="text-sm font-extrabold text-[#15885A]">Sudah dinilai guru</div>
                  ) : jenis === 'evaluasi' ? (
                    <div className="text-sm font-extrabold text-[#E37A12]">Menunggu validasi guru</div>
                  ) : (
                    <div className="text-sm font-extrabold text-[#E37A12]">Menunggu koreksi guru</div>
                  )}
                  <p className="text-xs text-[#66748C] mt-1 leading-relaxed">
                    {sudahDinilai
                      ? 'Nilai akhir (0–100) sudah mencakup jawaban pilihan ganda dan uraian.'
                      : `Skor sementara hanya dari pilihan ganda (maks ${maksPg} poin). ${adaUraian ? 'Nilai bisa berubah setelah guru memeriksa uraian.' : ''}`}
                  </p>
                  {kirimanLama.feedback && (
                    <blockquote className="mt-3 p-3 rounded-xl bg-white border border-[#DCEAF7] text-sm text-[#1F2A37] flex gap-2">
                      <MessageSquareQuote className="w-4 h-4 text-[#2E7BC4] shrink-0 mt-0.5" />
                      <span>
                        <span className="font-bold text-[#1B4E80]">Catatan guru:</span> {kirimanLama.feedback}
                      </span>
                    </blockquote>
                  )}
                </div>
              </div>
              {jenis === 'lkpd' && (
                <p className="text-xs text-[#66748C] mt-4">Pengerjaan ulang hanya bisa dilakukan jika guru memberikan izin.</p>
              )}
            </div>

            <RingkasanTinjau soal={questions} jawaban={kirimanLama.jawaban} lampiran={kirimanLama.lampiran} hasil={tinjau?.soal ?? {}} dinilai={dinilaiTinjau} gagal={tinjauGagal} />

            {kelompok.map((g) => (
              <section key={g.kunci} className="space-y-5" aria-label={g.judul ?? 'Soal'}>
                {bertahap && g.judul && (
                  <h2 className="text-sm font-extrabold text-[#1B4E80] px-1 pt-1 flex items-center gap-2">
                    <span className="w-1.5 h-4 rounded-full bg-[#F0932B]" aria-hidden="true" />
                    {g.judul}
                  </h2>
                )}
                {g.soal.map((q) => (
                  <KartuTinjau key={q.id} q={q} nomor={nomorSoal.get(q.id) ?? 1} jawaban={kirimanLama.jawaban[q.id]} lampiranSoal={kirimanLama.lampiran[q.id]} hasil={tinjau?.soal[q.id]} dinilai={dinilaiTinjau} />
                ))}
              </section>
            ))}
          </div>
        )}

        {/* FORM LEMBAR PENGERJAAN */}
        {fase === 'form' && (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="hero-card p-6 md:p-8 anim-rise">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-[#2E7BC4] uppercase tracking-wider">Lembar Penugasan Siswa</span>
                <span className="text-xs font-semibold text-[#66748C] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Bebas Waktu
                </span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-[-0.015em] text-[#1B4E80] mb-2">{judul}</h1>
              <p className="text-xs text-[#66748C] leading-relaxed">
                {judulMateri} &bull; Bacalah setiap butir pertanyaan dengan seksama. Jawaban hanya bisa dikumpulkan satu kali, dan draf tersimpan otomatis di perangkat ini.
              </p>
              {jenis === 'lkpd' && metaLkpd && (
                <PengantarLkpd judul={metaLkpd.judul} tujuan={metaLkpd.tujuan} petunjuk={metaLkpd.petunjuk} jumlahTahap={tahapAsli.length} />
              )}
              {bertahap && (
                <nav aria-label="Tahapan kegiatan" className="mt-5 flex flex-wrap gap-2">
                  {kelompok.map((g, gi) => {
                    const lengkap = g.soal.every((q) => apakahSoalTerjawab(q, answers[q.id], attachments[q.id]));
                    return (
                      <a key={g.kunci} href={`#tahap-${g.kunci}`} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${lengkap ? 'bg-[#E4F8EE] border-[#BBF7D0] text-[#15885A]' : 'bg-white border-[#DCEAF7] text-[#1B4E80] hover:border-[#2E7BC4]'}`}>
                        {lengkap ? <Check className="w-3 h-3" strokeWidth={3} /> : <span className="tabular">{gi + 1}.</span>} {g.judul}
                      </a>
                    );
                  })}
                </nav>
              )}
              {mengulang && (
                <div className="mt-4 p-3 rounded-xl bg-[#FFF8EC] border border-[#FBD38D] text-xs font-semibold text-[#92400E] flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  Guru mengizinkan pengerjaan ulang. Jawaban sebelumnya sudah diisikan; perbaiki lalu kumpulkan kembali.
                </div>
              )}
              {drafPulih && (
                <div className="mt-4 p-3 rounded-xl bg-[#EAF6FF] border border-[#BFDBFE] text-xs font-semibold text-[#1B4E80] flex items-center justify-between gap-3 flex-wrap anim-rise">
                  <span className="flex items-center gap-2">
                    <CloudUpload className="w-4 h-4 shrink-0" /> Draf jawaban dari pukul {jam(drafPulih)} dipulihkan.
                  </span>
                  <button type="button" onClick={mulaiDariAwal} className="underline underline-offset-2 hover:text-[#2E7BC4]">
                    Mulai dari awal
                  </button>
                </div>
              )}
            </div>

            {/* List Soal (dikelompokkan per tahap untuk LKPD bertahap) */}
            {kelompok.map((g, gi) => (
              <section key={g.kunci} id={`tahap-${g.kunci}`} className="space-y-5 scroll-mt-32" aria-label={g.judul ?? 'Soal'}>
                {bertahap && g.judul && (
                  <div className="glass-card p-5 md:p-6 border-l-4 border-[#F0932B] anim-rise">
                    {g.kunci.startsWith('_') ? (
                      <h2 className="text-lg font-extrabold text-[#1B4E80]">{g.judul}</h2>
                    ) : (
                      <KepalaTahap nomor={tahapAsli.findIndex((t) => t.kunci === g.kunci) + 1} total={tahapAsli.length} judul={g.judul} instruksi={g.instruksi} selesai={g.soal.every((q) => apakahSoalTerjawab(q, answers[q.id], attachments[q.id]))} />
                    )}
                  </div>
                )}
            {g.soal.map((q) => {
              const idx = (nomorSoal.get(q.id) ?? 1) - 1;
              const dijawab = apakahSoalTerjawab(q, answers[q.id], attachments[q.id]);
              const sorot = tandaiKosong && !dijawab;
              const tandaiBagian = () => (bagianAktif.current = `${g.judul && !g.kunci.startsWith('_') ? `Tahap ${g.judul} · ` : ''}Soal ${idx + 1}`);
              return (
                <fieldset
                  key={q.id}
                  onFocusCapture={tandaiBagian}
                  onClickCapture={tandaiBagian}
                  id={`soal-${q.id}`}
                  className={`glass-card p-6 md:p-8 anim-rise transition-shadow ${sorot ? 'ring-2 ring-[#FFB454] ring-offset-2 ring-offset-transparent' : ''}`}
                  style={{ ['--i' as string]: idx + 1 }}
                >
                  <legend className="sr-only">Soal nomor {idx + 1}</legend>
                  <div className="flex justify-between items-center gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#194B7C] to-[#0E2A48] text-white flex items-center justify-center font-extrabold text-sm shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_6px_14px_-3px_rgba(14,42,72,0.35)] tabular">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EAF5FF] border border-[#BFDBFE] text-[#113355]">
                        Soal #{idx + 1} &bull; {q.tipe === 'pg' ? 'Pilihan Ganda' : 'Uraian / Essay'}
                      </span>
                    </div>
                    <span className="flex items-center gap-2">
                      {dijawab ? (
                        <span className="anim-chip inline-flex items-center gap-1 text-xs font-bold text-[#15885A] bg-[#E4F8EE] border border-[#B5EBD0] px-2.5 py-0.5 rounded-full">
                          <Check className="w-3 h-3" strokeWidth={3} /> Terjawab
                        </span>
                      ) : sorot ? (
                        <span className="text-xs font-bold text-[#E37A12] bg-[#FFF1DD] border border-[#FBD38D] px-2.5 py-0.5 rounded-full">Belum dijawab</span>
                      ) : null}
                      <span className="text-xs font-semibold text-[#5B6B82] hidden sm:inline tabular">Bobot: {q.bobot || 50} Poin</span>
                    </span>
                  </div>

                  <div className="text-sm md:text-[15px] font-semibold text-[#1F2A37] mb-5 leading-relaxed">{q.pertanyaan}</div>

                  {/* Input Jawaban PG (radio asli: bisa dipilih dengan keyboard) */}
                  {q.tipe === 'pg' ? (
                    <div className="grid gap-2.5" role="radiogroup" aria-label={`Pilihan jawaban soal ${idx + 1}`}>
                      {OPSI.map((optKey) => {
                        const optText = teksOpsi(q, optKey);
                        if (!optText) return null;
                        const isSelected = answers[q.id] === optKey;
                        return (
                          <label
                            key={optKey}
                            className={`group flex items-center gap-3 p-3.5 rounded-xl border-2 text-sm cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.99] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#2E7BC4]/20 ${
                              isSelected
                                ? 'bg-[#E8F4FF] border-[#256FB8] text-[#113355] font-bold shadow-[0_1px_0_#ffffff_inset,0_8px_20px_-4px_rgba(37,111,184,0.22)]'
                                : 'bg-white/90 border-[#DCEAF7] text-[#1F2A37] sm:hover:border-[#8BBCE8] sm:hover:bg-white sm:hover:-translate-y-px'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`question_${q.id}`}
                              value={optKey}
                              checked={isSelected}
                              onChange={() => handleSelectAnswer(q.id, optKey)}
                              className="sr-only"
                            />
                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0 transition-colors duration-150 ${
                                isSelected ? 'bg-gradient-to-br from-[#2E7ECF] to-[#174A7E] text-white shadow-sm anim-chip' : 'bg-[#F0F6FC] text-[#5B6B82] sm:group-hover:bg-[#D3ECFF] sm:group-hover:text-[#113355]'
                              }`}
                            >
                              {optKey}
                            </span>
                            <span className="flex-1">{optText}</span>
                            {isSelected && <Check className="w-4 h-4 text-[#256FB8] anim-chip shrink-0" strokeWidth={3} />}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    /* Input Jawaban Essay (Teks dan/atau Foto Kamera / Berkas Terkompresi) */
                    <div>
                      <textarea
                        rows={5}
                        aria-label={`Jawaban uraian soal ${idx + 1}`}
                        value={answers[q.id] || ''}
                        onChange={(e) => handleSelectAnswer(q.id, e.target.value)}
                        placeholder="Ketikkan uraian langkah perhitungan di sini, atau lampirkan foto/berkas jawaban di bawah (cukup salah satu atau keduanya)..."
                        className="input-field w-full p-4 rounded-xl border-2 border-[#E2EEF9] bg-white/95 text-sm text-[#1F2A37] leading-relaxed resize-y"
                      />
                      <div className="text-xs text-[#94A3B8] text-right mt-1 tabular">{(answers[q.id] || '').length} karakter</div>
                      {jenis && userId && (
                        <InputLampiranEssay
                          supabase={supabase}
                          uid={userId}
                          jenis={jenis}
                          idMateri={id}
                          idSoal={q.id}
                          nomorSoal={idx + 1}
                          formatFile={q.format_file}
                          lampiran={attachments[q.id] || []}
                          pathAwalLama={pathAwalSet}
                          onChange={(daftar) => handleChangeLampiran(q.id, daftar)}
                          onSibukChange={(sibuk) => handleSibukLampiran(q.id, sibuk)}
                        />
                      )}
                    </div>
                  )}
                </fieldset>
              );
            })}
                {bertahap && gi < kelompok.length - 1 && (
                  <div className="flex justify-end">
                    <a href={`#tahap-${kelompok[gi + 1].kunci}`} className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold">
                      Lanjut ke {kelompok[gi + 1].judul} <ChevronDown className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </section>
            ))}

            {/* Bar kirim menempel di bawah: progres + status draf */}
            <div className="sticky bottom-3 z-20 pt-2">
              <div className="relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl border border-[#BFD8F0] shadow-[0_1px_0_#ffffff_inset,0_18px_46px_-8px_rgba(14,42,72,0.24)] p-4 space-y-3">
                {pesanBar && (
                  <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold leading-relaxed flex gap-2 anim-shake">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {pesanBar}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center gap-2 text-xs font-bold text-[#113355]">
                      <span className="tabular">
                        {terjawab} dari {questions.length} soal terjawab
                      </span>
                      <span className="text-xs font-semibold text-[#66748C] flex items-center gap-1" aria-live="polite">
                        {tersimpanPada && (
                          <>
                            <CloudUpload className="w-3.5 h-3.5 text-[#2E7BC4]" /> Draf tersimpan {jam(tersimpanPada)}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#E6EEF7] mt-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#5FA8E8] to-[#1D5A96] transition-[width] duration-300 ease-[var(--ease-out)]"
                        style={{ width: `${questions.length ? (terjawab / questions.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary py-3 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  >
                    Kumpulkan Jawaban Sekarang
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>

      <Modal
        open={konfirmasi}
        busy={submitting}
        onClose={() => setKonfirmasi(false)}
        title={mengulang ? 'Kumpulkan ulang jawaban?' : 'Kumpulkan jawaban sekarang?'}
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#FFF1DD] border border-[#FBD38D] flex items-center justify-center">
            <Send className="w-6 h-6 text-[#E37A12]" />
          </div>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => setKonfirmasi(false)}
              disabled={submitting}
              className="btn-secondary px-5 py-2.5 rounded-xl font-bold text-sm"
            >
              Periksa Lagi
            </button>
            <button
              type="button"
              data-autofocus
              onClick={kirimJawaban}
              disabled={submitting}
              className="btn-primary px-5 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
            >
              {submitting && <Spinner />}
              {submitting ? 'Mengirim...' : 'Ya, Kumpulkan'}
            </button>
          </>
        }
      >
        <p>
          Semua <strong>{questions.length} soal</strong> sudah terjawab.{' '}
          {mengulang
            ? 'Jawaban ini akan menggantikan jawaban sebelumnya dan izin pengerjaan ulang akan habis.'
            : 'Setelah dikumpulkan, jawaban tidak bisa diubah lagi kecuali guru memberi izin pengerjaan ulang.'}
        </p>
      </Modal>
    </div>
  );
}
