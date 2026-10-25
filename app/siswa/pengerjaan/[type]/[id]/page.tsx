'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { LockBanner } from '@/components/lock-banner';
import { Modal } from '@/components/ui/modal';
import { ScoreRing } from '@/components/ui/score-ring';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { UUID_RE } from '@/lib/akses';
import {
  JENIS,
  KOLOM_SOAL_SISWA,
  OPSI,
  bobotSoal,
  formatTanggal,
  isJenis,
  pesanGalat,
  petaJawaban,
  teksOpsi,
  type JenisPengerjaan,
  type Soal,
} from '@/lib/pengerjaan';
import { ArrowLeft, Clock, AlertTriangle, Send, RotateCcw, CheckCircle2, Check, CloudUpload, ArrowRight, MessageSquareQuote } from 'lucide-react';

interface PengerjaanProps {
  params: {
    type: string;
    id: string;
  };
}

type Fase = 'memuat' | 'galat' | 'tidak-ada' | 'terkunci' | 'form' | 'tinjau' | 'selesai';

interface KirimanLama {
  jawaban: Record<string, string>;
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
function bacaDraf(key: string): { answers: Record<string, string>; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d.answers === 'object' && d.answers ? d : null;
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
  const [namaSiswa, setNamaSiswa] = useState('Siswa');
  const [judulMateri, setJudulMateri] = useState('');
  const [muatUlang, setMuatUlang] = useState(0);
  const [draftKey, setDraftKey] = useState<string | null>(null);

  // Soal & Jawaban
  const [questions, setQuestions] = useState<Soal[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [jawabanAwal, setJawabanAwal] = useState<Record<string, string>>({});
  const [kirimanLama, setKirimanLama] = useState<KirimanLama | null>(null);
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
        if (r) lama = { jawaban: petaJawaban(r.file_answers_json), score: r.score, feedback: r.feedback, status: r.status, waktu: r.created_at, bolehUlang: Boolean(r.allow_retake) };
      } else if (jenis === 'latihan') {
        const { data, error } = await supabase
          .from('pengerjaan_latihan')
          .select('answers_json, score, feedback, completed_at')
          .eq('id_siswa', user.id)
          .eq('id_materi', id)
          .limit(1);
        if (error) return gagal(error);
        const r = data?.[0];
        if (r) lama = { jawaban: petaJawaban(r.answers_json), score: r.score, feedback: r.feedback, status: r.feedback !== null ? 'graded' : null, waktu: r.completed_at, bolehUlang: false };
      } else {
        const { data, error } = await supabase
          .from('pengerjaan_evaluasi')
          .select('answers_json, score, completed_at')
          .eq('id_siswa', user.id)
          .or(`id_materi.eq.${id},id_materi.is.null`)
          .limit(1);
        if (error) return gagal(error);
        const r = data?.[0];
        if (r) lama = { jawaban: petaJawaban(r.answers_json), score: r.score, feedback: null, status: null, waktu: r.completed_at, bolehUlang: false };
      }
      if (batal) return;

      // 3. Muat Bank Soal (tanpa kunci jawaban)
      const { data: soal, error: soalError } = await supabase
        .from('questions')
        .select(KOLOM_SOAL_SISWA)
        .eq('category', jenis)
        .or(`id_materi.is.null,id_materi.eq.${id}`)
        .order('id_materi', { ascending: true, nullsFirst: true })
        .order('urutan', { ascending: true });
      if (batal) return;
      if (soalError) return gagal(soalError);

      setQuestions((soal ?? []) as Soal[]);
      setKirimanLama(lama);

      if (lama && !lama.bolehUlang) {
        hapusDraf(key);
        setFase('tinjau');
        return;
      }
      if (!soal?.length) {
        setPesan('Soal untuk tugas ini belum tersedia. Silakan hubungi guru Anda.');
        setFase('tidak-ada');
        return;
      }

      // Jawaban awal: jawaban lama (jika boleh ulang) ditimpa draf yang tersimpan di peramban.
      const awal = lama?.bolehUlang ? lama.jawaban : {};
      const draf = bacaDraf(key);
      setMengulang(Boolean(lama?.bolehUlang));
      setJawabanAwal(awal);
      setAnswers(draf ? { ...awal, ...draf.answers } : awal);
      setDrafPulih(draf ? draf.savedAt : null);
      setTersimpanPada(draf ? draf.savedAt : null);
      setFase('form');
    }

    initCheckAndLoad().catch((err) => gagal(err));
    return () => {
      batal = true;
    };
  }, [jenis, id, router, supabase, muatUlang]);

  // Simpan draf otomatis di peramban (agar jawaban tidak hilang saat refresh / tab tertutup)
  useEffect(() => {
    if (fase !== 'form' || !draftKey) return;
    const t = setTimeout(() => {
      if (!Object.values(answers).some((v) => v.trim())) return;
      try {
        const now = Date.now();
        localStorage.setItem(draftKey, JSON.stringify({ answers, savedAt: now }));
        setTersimpanPada(now);
      } catch {
        /* penyimpanan peramban penuh / dinonaktifkan */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [answers, fase, draftKey]);

  // Simpan seketika saat halaman ditutup / ditinggal, agar ketikan terakhir (sebelum jeda 600 ms) tidak hilang.
  const jawabanRef = useRef(answers);
  jawabanRef.current = answers;
  const bolehSimpanDraf = useRef(false);
  useEffect(() => {
    bolehSimpanDraf.current = fase === 'form';
    if (fase !== 'form' || !draftKey) return;
    const simpanSekarang = () => {
      if (!bolehSimpanDraf.current || !Object.values(jawabanRef.current).some((v) => v.trim())) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({ answers: jawabanRef.current, savedAt: Date.now() }));
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
      const { error } = await supabase.from('tab_switch_logs').insert({
        id_siswa: user.id,
        category: jenis,
        switch_count: jumlah,
      });
      if (error) console.warn('Gagal mencatat perpindahan tab:', error.message);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fase, jenis, supabase]);

  const handleSelectAnswer = (questionId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const kosong = questions.filter((q) => !(answers[q.id] ?? '').trim());
  const terjawab = questions.length - kosong.length;
  const maksTotal = questions.reduce((s, q) => s + bobotSoal(q), 0) || 100;
  const maksPg = questions.filter((q) => q.tipe === 'pg').reduce((s, q) => s + bobotSoal(q), 0);
  const adaUraian = questions.some((q) => q.tipe !== 'pg');
  const lanjutan = jenis ? LANJUTAN[jenis] : undefined;
  const linkMateri = UUID_RE.test(id) ? `/siswa/materi/${id}` : '/siswa/materi';

  // Pesan validasi ikut berkurang saat soal dijawab dan hilang sendiri bila semua terisi.
  const pesanValidasi =
    tandaiKosong && kosong.length ? `Masih ada ${kosong.length} soal yang belum dijawab. Lengkapi dulu sebelum mengumpulkan.` : null;
  const pesanBar = submitError ?? pesanValidasi;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
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
      // Skor pilihan ganda dihitung di database (kunci jawaban tidak dikirim ke browser)
      const { data, error } = await supabase.rpc('kumpulkan_pengerjaan', {
        p_jenis: jenis,
        p_id_materi: id,
        p_jawaban: answers,
      });
      if (error) {
        setKonfirmasi(false);
        setSubmitError(pesanGalat(error));
        return;
      }
      bolehSimpanDraf.current = false;
      hapusDraf(draftKey);
      setHasil({ skor: Number(data?.skor_pg ?? 0), maks: Number(data?.maks_pg ?? 0) });
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
    hapusDraf(draftKey);
    setAnswers(jawabanAwal);
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

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={judul} userRole="siswa" userName={namaSiswa} />

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
              className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm"
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
            <Link href="/siswa/materi" className="btn-press inline-block px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm">
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
            <h2 className="text-2xl font-extrabold text-[#1B4E80] mb-2">Pengumpulan Berhasil!</h2>
            <p className="text-sm text-[#66748C] max-w-md mx-auto mb-7">
              Lembar jawaban Anda sudah tersimpan.{adaUraian ? ' Guru akan memeriksa jawaban uraian dan memberikan nilai akhir.' : ''}
            </p>
            {hasil && hasil.maks > 0 && (
              <div className="inline-flex flex-col items-center px-8 py-5 rounded-3xl bg-[#F4F9FF] border border-[#DCEAF7] mb-8">
                <ScoreRing value={hasil.skor} max={maksTotal} caption={adaUraian ? 'Skor sementara' : 'Skor akhir'} />
                <div className="text-xs text-[#4B5A70] mt-3 tabular">
                  Pilihan ganda: <strong>{hasil.skor} / {hasil.maks}</strong> poin
                  {adaUraian && <> &bull; Uraian ({maksTotal - hasil.maks} poin) dinilai guru</>}
                </div>
              </div>
            )}
            <div className="flex justify-center gap-3 flex-wrap">
              <Link
                href={linkMateri}
                className="btn-press px-6 py-3 rounded-xl bg-white border border-[#DCEAF7] text-[#1B4E80] font-bold text-sm shadow-sm hover:border-[#2E7BC4]"
              >
                Kembali ke Halaman Materi
              </Link>
              {lanjutan && (
                <Link
                  href={`/siswa/pengerjaan/${lanjutan.jenis}/${id}`}
                  className="btn-press group px-6 py-3 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm shadow-[0_8px_20px_rgba(46,123,196,0.3)] inline-flex items-center gap-1.5"
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
            <div className="glass-card p-6 md:p-8 anim-rise">
              <div className="flex items-center gap-2 text-[#15885A] text-xs font-bold uppercase tracking-wider mb-2">
                <CheckCircle2 className="w-4 h-4" /> Sudah Dikumpulkan
              </div>
              <h1 className="text-2xl font-extrabold text-[#1B4E80] mb-1">{judul}</h1>
              <p className="text-xs text-[#66748C]">
                {jenis === 'evaluasi' ? 'Evaluasi akhir' : judulMateri} &bull; Dikumpulkan {formatTanggal(kirimanLama.waktu)}
              </p>

              <div className="mt-6 grid sm:grid-cols-[auto,1fr] gap-6 items-center p-5 rounded-2xl bg-[#F4F9FF] border border-[#DCEAF7]">
                <ScoreRing
                  value={kirimanLama.score}
                  max={sudahDinilai ? 100 : maksTotal}
                  tone={sudahDinilai ? 'green' : 'orange'}
                  caption={sudahDinilai ? 'Nilai akhir dari guru' : jenis === 'evaluasi' ? 'Nilai evaluasi' : 'Skor sementara'}
                />
                <div>
                  {sudahDinilai ? (
                    <div className="text-sm font-extrabold text-[#15885A]">Sudah dinilai guru</div>
                  ) : jenis === 'evaluasi' ? (
                    <div className="text-sm font-extrabold text-[#1B4E80]">Evaluasi tersimpan</div>
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

            {questions.map((q, idx) => {
              const jwb = kirimanLama.jawaban[q.id];
              return (
                <div key={q.id} className="glass-card p-6 md:p-8 anim-rise" style={{ ['--i' as string]: idx + 1 }}>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EAF6FF] text-[#1B4E80]">
                    Soal #{q.urutan || idx + 1} &bull; {q.tipe === 'pg' ? 'Pilihan Ganda' : 'Uraian / Essay'}
                  </span>
                  <div className="text-sm md:text-[15px] font-semibold text-[#1F2A37] mt-3 mb-3 leading-relaxed">{q.pertanyaan}</div>
                  <div className="text-sm p-3.5 rounded-xl bg-white/90 border border-[#DCEAF7] text-[#1F2A37] whitespace-pre-wrap">
                    <span className="text-[11px] font-bold text-[#66748C] uppercase tracking-wide block mb-1">Jawaban Anda</span>
                    {jwb ? (q.tipe === 'pg' ? `${jwb.toUpperCase()}. ${teksOpsi(q, jwb) ?? ''}` : jwb) : 'Tidak dijawab'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FORM LEMBAR PENGERJAAN */}
        {fase === 'form' && (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="glass-card p-6 md:p-8 anim-rise">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-[#2E7BC4] uppercase tracking-wider">Lembar Penugasan Siswa</span>
                <span className="text-xs font-semibold text-[#66748C] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Bebas Waktu
                </span>
              </div>
              <h1 className="text-2xl font-extrabold text-[#1B4E80] mb-2">{judul}</h1>
              <p className="text-xs text-[#66748C] leading-relaxed">
                {jenis === 'evaluasi' ? 'Evaluasi akhir' : judulMateri} &bull; Bacalah setiap butir pertanyaan dengan seksama. Jawaban hanya bisa dikumpulkan satu kali, dan draf tersimpan otomatis di perangkat ini.
              </p>
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

            {/* List Soal */}
            {questions.map((q, idx) => {
              const dijawab = Boolean((answers[q.id] ?? '').trim());
              const sorot = tandaiKosong && !dijawab;
              return (
                <fieldset
                  key={q.id}
                  id={`soal-${q.id}`}
                  className={`glass-card p-6 md:p-8 anim-rise transition-shadow ${sorot ? 'ring-2 ring-[#FFB454] ring-offset-2 ring-offset-transparent' : ''}`}
                  style={{ ['--i' as string]: idx + 1 }}
                >
                  <legend className="sr-only">Soal nomor {q.urutan || idx + 1}</legend>
                  <div className="flex justify-between items-center gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white flex items-center justify-center font-extrabold text-sm shadow-sm tabular">
                        {q.urutan || idx + 1}
                      </span>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EAF6FF] text-[#1B4E80]">
                        Soal #{q.urutan || idx + 1} &bull; {q.tipe === 'pg' ? 'Pilihan Ganda' : 'Uraian / Essay'}
                      </span>
                    </div>
                    <span className="flex items-center gap-2">
                      {dijawab ? (
                        <span className="anim-chip inline-flex items-center gap-1 text-[11px] font-bold text-[#15885A] bg-[#E4F8EE] px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" strokeWidth={3} /> Terjawab
                        </span>
                      ) : sorot ? (
                        <span className="text-[11px] font-bold text-[#E37A12] bg-[#FFF1DD] px-2 py-0.5 rounded-full">Belum dijawab</span>
                      ) : null}
                      <span className="text-xs font-semibold text-[#66748C] hidden sm:inline">Bobot: {q.bobot || 50} Poin</span>
                    </span>
                  </div>

                  <div className="text-sm md:text-[15px] font-semibold text-[#1F2A37] mb-5 leading-relaxed">{q.pertanyaan}</div>

                  {/* Input Jawaban PG (radio asli: bisa dipilih dengan keyboard) */}
                  {q.tipe === 'pg' ? (
                    <div className="grid gap-2.5" role="radiogroup" aria-label={`Pilihan jawaban soal ${q.urutan || idx + 1}`}>
                      {OPSI.map((optKey) => {
                        const optText = teksOpsi(q, optKey);
                        if (!optText) return null;
                        const isSelected = answers[q.id] === optKey;
                        return (
                          <label
                            key={optKey}
                            className={`group flex items-center gap-3 p-3.5 rounded-xl border-2 text-sm cursor-pointer transition-all duration-200 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#2E7BC4]/20 ${
                              isSelected
                                ? 'bg-[#EAF6FF] border-[#2E7BC4] text-[#1B4E80] font-bold shadow-[0_6px_18px_rgba(46,123,196,0.15)]'
                                : 'bg-white/80 border-[#E6EEF7] text-[#1F2A37] hover:border-[#BFDBFE] hover:bg-white hover:-translate-y-px'
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
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0 transition-colors ${
                                isSelected ? 'bg-[#2E7BC4] text-white anim-chip' : 'bg-[#F1F5F9] text-[#66748C] group-hover:bg-[#D3ECFF] group-hover:text-[#1B4E80]'
                              }`}
                            >
                              {optKey}
                            </span>
                            <span className="flex-1">{optText}</span>
                            {isSelected && <Check className="w-4 h-4 text-[#2E7BC4] anim-chip shrink-0" strokeWidth={3} />}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    /* Input Jawaban Essay */
                    <div>
                      <textarea
                        rows={5}
                        aria-label={`Jawaban uraian soal ${q.urutan || idx + 1}`}
                        value={answers[q.id] || ''}
                        onChange={(e) => handleSelectAnswer(q.id, e.target.value)}
                        placeholder="Ketikkan uraian langkah perhitungan dan penjelasan Anda di sini..."
                        className="w-full p-4 rounded-xl border-2 border-[#E6EEF7] bg-white/90 text-sm text-[#1F2A37] leading-relaxed focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 transition-all resize-y"
                      />
                      <div className="text-[11px] text-[#94A3B8] text-right mt-1 tabular">{(answers[q.id] || '').length} karakter</div>
                    </div>
                  )}
                </fieldset>
              );
            })}

            {/* Bar kirim menempel di bawah: progres + status draf */}
            <div className="sticky bottom-3 z-20 pt-2">
              <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white shadow-[0_10px_40px_rgba(27,78,128,0.18)] p-4 space-y-3">
                {pesanBar && (
                  <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold leading-relaxed flex gap-2 anim-shake">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {pesanBar}
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center gap-2 text-xs font-semibold text-[#4B5A70]">
                      <span className="tabular">
                        {terjawab} dari {questions.length} soal terjawab
                      </span>
                      <span className="text-[11px] text-[#94A3B8] flex items-center gap-1" aria-live="polite">
                        {tersimpanPada && (
                          <>
                            <CloudUpload className="w-3.5 h-3.5" /> Draf tersimpan {jam(tersimpanPada)}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#E6EEF7] mt-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#5FA8E8] to-[#2E7BC4] transition-[width] duration-500 ease-out"
                        style={{ width: `${questions.length ? (terjawab / questions.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-press py-3 px-6 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2468A9] hover:from-[#1B4E80] hover:to-[#1B4E80] text-white font-bold text-sm shadow-[0_8px_20px_rgba(46,123,196,0.3)] flex items-center justify-center gap-2 disabled:opacity-60"
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
          <div className="w-12 h-12 rounded-2xl bg-[#FFF1DD] flex items-center justify-center">
            <Send className="w-6 h-6 text-[#E37A12]" />
          </div>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => setKonfirmasi(false)}
              disabled={submitting}
              className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50"
            >
              Periksa Lagi
            </button>
            <button
              type="button"
              data-autofocus
              onClick={kirimJawaban}
              disabled={submitting}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
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
