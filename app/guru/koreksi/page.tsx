'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import {
  JENIS,
  bobotSoal,
  formatTanggal,
  pesanGalat,
  petaJawaban,
  teksOpsi,
  type JenisPengerjaan,
  type Soal,
} from '@/lib/pengerjaan';
import { Save, Award, Search, AlertTriangle, ChevronRight, X, Inbox, RotateCcw, Trash2 } from 'lucide-react';

interface Submission {
  id: string;
  id_materi: string | null;
  jawaban: Record<string, string>;
  status: string | null;
  score: number | null;
  feedback: string | null;
  allow_retake: boolean;
  waktu: string | null;
  siswa: { full_name?: string | null; class_name?: string | null; email?: string | null } | null;
  materi: { title?: string | null; chapter_number?: number | null } | null;
}

const TABEL: Record<JenisPengerjaan, string> = {
  lkpd: 'jawaban_lkpd',
  latihan: 'pengerjaan_latihan',
  evaluasi: 'pengerjaan_evaluasi',
};

const TAB: Record<JenisPengerjaan, { panjang: string; pendek: string }> = {
  lkpd: { panjang: 'Lembar LKPD Siswa', pendek: 'LKPD' },
  latihan: { panjang: 'Latihan Soal Siswa', pendek: 'Latihan' },
  evaluasi: { panjang: 'Evaluasi Siswa', pendek: 'Evaluasi' },
};

const SISWA = 'siswa:id_siswa(full_name, class_name, email)';
const MATERI = 'materi:id_materi(title, chapter_number)';

function normalisasi(row: any, jenis: JenisPengerjaan): Submission {
  return {
    id: row.id,
    id_materi: row.id_materi ?? null,
    jawaban: petaJawaban(jenis === 'lkpd' ? row.file_answers_json : row.answers_json),
    status: row.status ?? null,
    score: row.score ?? null,
    feedback: row.feedback ?? null,
    allow_retake: Boolean(row.allow_retake),
    waktu: row.created_at ?? row.completed_at ?? null,
    siswa: row.siswa ?? null,
    materi: row.materi ?? null,
  };
}

const namaSiswa = (s: Submission) => s.siswa?.full_name || s.siswa?.email || 'Siswa';

/** Sudah dinilai guru? (evaluasi tidak punya penanda, jadi selalu dianggap bisa dinilai) */
function sudahDinilai(s: Submission, tab: JenisPengerjaan): boolean {
  if (tab === 'lkpd') return s.status === 'graded' && !s.allow_retake;
  if (tab === 'latihan') return s.feedback !== null;
  return false;
}

const selectClass =
  'px-3 py-2 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10';

export default function GuruKoreksiPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profil, setProfil] = useState<{ nama: string; role: 'guru' | 'admin' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<JenisPengerjaan>('lkpd');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [soal, setSoal] = useState<Soal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [muatUlang, setMuatUlang] = useState(0);

  // Filter antrean
  const [cari, setCari] = useState('');
  const [kelas, setKelas] = useState('semua');
  const [statusFilter, setStatusFilter] = useState<'semua' | 'menunggu' | 'dinilai'>('semua');
  const [materiFilter, setMateriFilter] = useState('semua');

  // Form penilaian
  const [nilai, setNilai] = useState('');
  const [feedback, setFeedback] = useState('');
  const [allowRetake, setAllowRetake] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [aksiTertunda, setAksiTertunda] = useState<(() => void) | null>(null);
  const [hapusTarget, setHapusTarget] = useState<Submission | null>(null);
  const [menghapus, setMenghapus] = useState(false);

  const selectedSub = submissions.find((s) => s.id === selectedId) ?? null;

  const isiForm = (sub: Submission | null) => {
    setSelectedId(sub?.id ?? null);
    setNilai(sub?.score !== null && sub?.score !== undefined ? String(sub.score) : '');
    setFeedback(sub?.feedback ?? '');
    setAllowRetake(Boolean(sub?.allow_retake));
    setSaveError(null);
  };

  const berubah = Boolean(
    selectedSub &&
      (nilai !== (selectedSub.score !== null ? String(selectedSub.score) : '') ||
        feedback !== (selectedSub.feedback ?? '') ||
        allowRetake !== selectedSub.allow_retake)
  );

  /** Jalankan aksi; jika ada perubahan nilai yang belum disimpan, minta konfirmasi dulu. */
  const lindungi = (aksi: () => void) => {
    if (berubah) setAksiTertunda(() => aksi);
    else aksi();
  };

  // Peringatan peramban jika menutup tab saat ada nilai belum disimpan
  useEffect(() => {
    if (!berubah) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [berubah]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('full_name, role').eq('id', user.id).maybeSingle();
      setProfil({
        nama: data?.full_name || user.email?.split('@')[0] || 'Guru',
        role: data?.role === 'admin' ? 'admin' : 'guru',
      });
    })();
  }, [supabase]);

  useEffect(() => {
    let batal = false;
    async function loadSubmissions() {
      setLoading(true);
      setLoadError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const query =
        activeTab === 'lkpd'
          ? supabase
              .from('jawaban_lkpd')
              .select(`id, id_materi, file_answers_json, status, score, feedback, allow_retake, created_at, ${SISWA}, ${MATERI}`)
              .order('created_at', { ascending: false })
          : activeTab === 'latihan'
          ? supabase
              .from('pengerjaan_latihan')
              .select(`id, id_materi, answers_json, score, feedback, completed_at, ${SISWA}, ${MATERI}`)
              .order('completed_at', { ascending: false })
          : supabase
              .from('pengerjaan_evaluasi')
              .select(`id, id_materi, answers_json, score, completed_at, ${SISWA}, ${MATERI}`)
              .order('completed_at', { ascending: false });

      // Soal beserta kunci jawaban hanya bisa diambil guru/admin lewat fungsi database
      const [subRes, soalRes] = await Promise.all([query, supabase.rpc('soal_dengan_kunci', { p_jenis: activeTab })]);
      if (batal) return;

      if (subRes.error) {
        setLoadError(pesanGalat(subRes.error));
        setSubmissions([]);
        isiForm(null);
      } else {
        const list = ((subRes.data ?? []) as any[]).map((row) => normalisasi(row, activeTab));
        setSubmissions(list);
        isiForm(list.find((s) => !sudahDinilai(s, activeTab)) ?? list[0] ?? null);
      }
      if (soalRes.error) {
        setLoadError((prev) => prev ?? `Soal & kunci jawaban gagal dimuat. ${pesanGalat(soalRes.error)}`);
      }
      setSoal((soalRes.data ?? []) as Soal[]);
      setLoading(false);
    }

    loadSubmissions();
    return () => {
      batal = true;
    };
    // isiForm stabil secara perilaku (hanya setter state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, router, supabase, muatUlang]);

  const gantiTab = (tab: JenisPengerjaan) =>
    lindungi(() => {
      setActiveTab(tab);
      setCari('');
      setKelas('semua');
      setStatusFilter('semua');
      setMateriFilter('semua');
    });

  const daftarKelas = useMemo(
    () => Array.from(new Set(submissions.map((s) => s.siswa?.class_name || ''))).sort(),
    [submissions]
  );
  const daftarMateri = useMemo(
    () => Array.from(new Set(submissions.map((s) => s.materi?.title || '').filter(Boolean))).sort(),
    [submissions]
  );

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return submissions.filter((s) => {
      if (q && !`${namaSiswa(s)} ${s.siswa?.email ?? ''}`.toLowerCase().includes(q)) return false;
      if (kelas !== 'semua' && (s.siswa?.class_name || '') !== kelas) return false;
      if (materiFilter !== 'semua' && (s.materi?.title || '') !== materiFilter) return false;
      if (statusFilter === 'menunggu' && sudahDinilai(s, activeTab)) return false;
      if (statusFilter === 'dinilai' && !sudahDinilai(s, activeTab)) return false;
      return true;
    });
  }, [submissions, cari, kelas, materiFilter, statusFilter, activeTab]);
  const adaFilter = cari !== '' || kelas !== 'semua' || statusFilter !== 'semua' || materiFilter !== 'semua';

  // "Berikutnya": lembar berikut yang belum dinilai (berputar ke atas daftar), jika tidak ada ambil lembar berikutnya.
  const berikutnya = useMemo(() => {
    if (tersaring.length < 2) return null;
    const i = Math.max(tersaring.findIndex((s) => s.id === selectedId), 0);
    const urut = [...tersaring.slice(i + 1), ...tersaring.slice(0, i)];
    return urut.find((s) => !sudahDinilai(s, activeTab)) ?? urut[0] ?? null;
  }, [tersaring, selectedId, activeTab]);

  // Soal yang berlaku untuk lembar terpilih: soal umum + soal khusus bab lembar itu
  const soalTerpilih = useMemo(
    () => (selectedSub ? soal.filter((q) => !q.id_materi || !selectedSub.id_materi || q.id_materi === selectedSub.id_materi) : []),
    [selectedSub, soal]
  );

  // Skor pilihan ganda otomatis untuk lembar yang dipilih (dihitung dari kunci di database)
  const skorPg = useMemo(() => {
    if (!selectedSub) return null;
    let skor = 0;
    let maks = 0;
    soalTerpilih.filter((q) => q.tipe === 'pg').forEach((q) => {
      maks += bobotSoal(q);
      const jwb = selectedSub.jawaban[q.id];
      if (jwb && q.kunci_jawaban && jwb.trim().toUpperCase() === q.kunci_jawaban.trim().toUpperCase()) skor += bobotSoal(q);
    });
    const total = soalTerpilih.reduce((s, q) => s + bobotSoal(q), 0);
    return { skor, maks, uraian: total - maks };
  }, [selectedSub, soalTerpilih]);

  const jawabanTanpaSoal = selectedSub
    ? Object.entries(selectedSub.jawaban).filter(([key]) => !soalTerpilih.some((q) => q.id === key))
    : [];

  const handleSaveCorrection = async () => {
    if (!selectedSub) return;
    setSaveError(null);

    const angka = nilai.trim() === '' ? NaN : Number(nilai);
    if (!Number.isFinite(angka) || angka < 0 || angka > 100) {
      setSaveError('Isi nilai akhir antara 0 sampai 100.');
      return;
    }

    // feedback '' (bukan null) menandai latihan sudah dinilai walau tanpa catatan
    const perubahan: Record<string, unknown> =
      activeTab === 'lkpd'
        ? { score: angka, feedback: feedback.trim() || null, status: 'graded', allow_retake: allowRetake, graded_at: new Date().toISOString() }
        : activeTab === 'latihan'
        ? { score: angka, feedback: feedback.trim() }
        : { score: angka };

    setSaving(true);
    const { data, error } = await supabase.from(TABEL[activeTab]).update(perubahan).eq('id', selectedSub.id).select('id');
    setSaving(false);

    if (error) {
      setSaveError(`Nilai tidak tersimpan. ${pesanGalat(error)}`);
      return;
    }
    if (!data?.length) {
      setSaveError('Nilai tidak tersimpan: akun Anda tidak memiliki izin untuk mengubah data ini.');
      return;
    }

    const baru: Submission = {
      ...selectedSub,
      score: angka,
      feedback: 'feedback' in perubahan ? (perubahan.feedback as string | null) : selectedSub.feedback,
      status: activeTab === 'lkpd' ? 'graded' : selectedSub.status,
      allow_retake: activeTab === 'lkpd' ? allowRetake : selectedSub.allow_retake,
    };
    setSubmissions((prev) => prev.map((s) => (s.id === selectedSub.id ? baru : s)));
    isiForm(baru);
    setToast({
      id: Date.now(),
      tone: 'success',
      text:
        activeTab === 'lkpd' && allowRetake
          ? 'Nilai tersimpan. Siswa diizinkan mengerjakan ulang LKPD ini.'
          : 'Penilaian dan umpan balik berhasil diterbitkan ke siswa!',
    });
  };

  // Admin: hapus pengumpulan (mis. salah kirim) agar siswa bisa mengerjakan ulang
  const hapusPengumpulan = async () => {
    if (!hapusTarget) return;
    setMenghapus(true);
    const { data, error } = await supabase.from(TABEL[activeTab]).delete().eq('id', hapusTarget.id).select('id');
    setMenghapus(false);
    if (error || !data?.length) {
      setHapusTarget(null);
      setToast({ id: Date.now(), tone: 'error', text: error ? `Gagal menghapus. ${pesanGalat(error)}` : 'Gagal menghapus: akun Anda tidak memiliki izin.' });
      return;
    }
    const sisa = submissions.filter((s) => s.id !== hapusTarget.id);
    setSubmissions(sisa);
    isiForm(sisa.find((s) => !sudahDinilai(s, activeTab)) ?? sisa[0] ?? null);
    setToast({ id: Date.now(), tone: 'success', text: `Pengumpulan ${namaSiswa(hapusTarget)} dihapus. Siswa bisa mengerjakan ulang.` });
    setHapusTarget(null);
  };

  const statusItem = (sub: Submission) => {
    if (activeTab === 'lkpd') {
      if (sub.allow_retake) return { teks: 'Menunggu pengerjaan ulang', kelas: 'bg-[#FFF1DD] text-[#B45309]' };
      if (sub.status === 'graded') return { teks: `Nilai: ${sub.score ?? '-'}`, kelas: 'bg-[#E4F8EE] text-[#15885A]' };
      return { teks: 'Menunggu Koreksi', kelas: 'bg-[#FFF1DD] text-[#B45309]' };
    }
    if (activeTab === 'latihan' && sub.feedback !== null) return { teks: `Nilai: ${sub.score ?? '-'}`, kelas: 'bg-[#E4F8EE] text-[#15885A]' };
    return { teks: `Skor: ${sub.score ?? '-'}`, kelas: 'bg-[#EAF6FF] text-[#1B4E80]' };
  };

  const pilihSubmission = useCallback((sub: Submission) => lindungi(() => isiForm(sub)), [berubah]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Panel Koreksi & Penilaian Guru" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role ?? null} />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1200px] w-full mx-auto">
        {/* Header Tabs */}
        <div className="flex justify-between items-end mb-6 flex-wrap gap-4 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80]">Penilaian &amp; Koreksi Tugas Siswa</h1>
            <p className="text-xs text-[#66748C] mt-1">
              Tinjau jawaban mandiri siswa, berikan skor objektif 0-100, dan sertakan catatan evaluasi.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm w-full sm:w-auto" role="tablist">
            {(Object.keys(TAB) as JenisPengerjaan[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => activeTab !== tab && gantiTab(tab)}
                className={`btn-press px-3 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${
                  activeTab === tab ? 'bg-[#2E7BC4] text-white shadow-[0_4px_12px_rgba(46,123,196,0.3)]' : 'text-[#66748C] hover:text-[#1B4E80] hover:bg-[#F4F9FF]'
                }`}
              >
                <span className="sm:hidden">{TAB[tab].pendek}</span>
                <span className="hidden sm:inline">{TAB[tab].panjang}</span>
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <div role="alert" className="mb-6 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center justify-between gap-3 anim-rise">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {loadError}
            </span>
            <button onClick={() => setMuatUlang((n) => n + 1)} className="btn-press px-3 py-1.5 rounded-lg bg-white border border-[#FECACA] shrink-0">
              Muat ulang
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Kolom 1: Daftar Pengumpulan Siswa */}
          <div className="glass-card p-5 lg:col-span-1 lg:h-[720px] flex flex-col anim-rise" style={{ ['--i' as string]: 1 }}>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#DCEAF7]">
              <span className="text-xs font-bold text-[#1B4E80] uppercase tracking-wide">
                Antrean Submission ({loading ? '…' : tersaring.length})
                {!loading && adaFilter && <span className="normal-case font-semibold text-[#94A3B8]"> dari {submissions.length}</span>}
              </span>
              {adaFilter && (
                <button
                  onClick={() => {
                    setCari('');
                    setKelas('semua');
                    setStatusFilter('semua');
                    setMateriFilter('semua');
                  }}
                  className="text-[11px] font-bold text-[#2E7BC4] hover:underline flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Reset filter
                </button>
              )}
            </div>

            {/* Filter */}
            <div className="space-y-2 mb-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari nama siswa..."
                  aria-label="Cari nama siswa"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DCEAF7] bg-white text-xs focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={kelas} onChange={(e) => setKelas(e.target.value)} className={selectClass} aria-label="Filter kelas">
                  <option value="semua">Semua kelas</option>
                  {daftarKelas.map((k) => (
                    <option key={k || 'kosong'} value={k}>
                      {k || 'Tanpa kelas'}
                    </option>
                  ))}
                </select>
                {activeTab !== 'evaluasi' && (
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClass} aria-label="Filter status">
                    <option value="semua">Semua status</option>
                    <option value="menunggu">Menunggu koreksi</option>
                    <option value="dinilai">Sudah dinilai</option>
                  </select>
                )}
                {daftarMateri.length > 1 && (
                  <select value={materiFilter} onChange={(e) => setMateriFilter(e.target.value)} className={selectClass} aria-label="Filter materi">
                    <option value="semua">Semua materi</option>
                    {daftarMateri.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1 max-h-[420px] lg:max-h-none">
              {loading ? (
                [0, 1, 2].map((i) => (
                  <div key={i} className="p-3.5 rounded-xl border border-[#E6EEF7] bg-white/70 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))
              ) : tersaring.length === 0 ? (
                <div className="text-center px-3 py-10">
                  <Inbox className="w-9 h-9 text-[#BFDBFE] mx-auto mb-2" />
                  <p className="text-xs text-[#66748C] leading-relaxed">
                    {submissions.length === 0 ? `Belum ada pengumpulan ${JENIS[activeTab].singkat} dari siswa.` : 'Tidak ada yang cocok dengan filter.'}
                  </p>
                </div>
              ) : (
                tersaring.map((sub, i) => {
                  const isSelected = selectedSub?.id === sub.id;
                  const st = statusItem(sub);
                  return (
                    <button
                      type="button"
                      key={sub.id}
                      onClick={() => !isSelected && pilihSubmission(sub)}
                      aria-current={isSelected}
                      className={`anim-rise w-full p-3.5 rounded-xl border text-left transition-all duration-200 ${
                        isSelected ? 'bg-[#EAF6FF] border-[#2E7BC4] shadow-[0_6px_16px_rgba(46,123,196,0.15)]' : 'bg-white/80 border-[#DCEAF7] hover:bg-white hover:border-[#BFDBFE]'
                      }`}
                      style={{ ['--i' as string]: Math.min(i, 8) }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5FA8E8] to-[#2E7BC4] text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                          {namaSiswa(sub).charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-xs font-bold text-[#1F2A37] truncate">{namaSiswa(sub)}</span>
                            {sub.siswa?.class_name && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D3ECFF] text-[#1B4E80] shrink-0">{sub.siswa.class_name}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#66748C] truncate">
                            {(activeTab === 'evaluasi' ? 'Evaluasi · ' : '') + (sub.materi?.title || (activeTab === 'evaluasi' ? 'semua bab' : 'Materi tidak ditemukan'))}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] mt-2.5">
                        <span className={`font-bold px-2 py-0.5 rounded-full ${st.kelas}`}>{st.teks}</span>
                        <span className="text-[#94A3B8]">
                          {sub.waktu ? new Date(sub.waktu).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Kolom 2 & 3: Lembar Evaluasi & Form Nilai */}
          <div
            className={`glass-card p-6 md:p-8 lg:col-span-2 flex-col anim-rise ${!loading && submissions.length === 0 ? 'hidden lg:flex' : 'flex'}`}
            style={{ ['--i' as string]: 2 }}
          >
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-7 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : selectedSub ? (
              <div key={selectedSub.id} className="space-y-6 anim-fade">
                <div className="flex justify-between items-start gap-3 border-b border-[#DCEAF7] pb-4 flex-wrap">
                  <div>
                    <h2 className="text-xl font-extrabold text-[#1B4E80]">Lembar Jawaban: {namaSiswa(selectedSub)}</h2>
                    <p className="text-xs text-[#66748C] mt-1">
                      Kelas: <strong>{selectedSub.siswa?.class_name || '-'}</strong> &bull; Modul:{' '}
                      <strong>{selectedSub.materi?.title || (activeTab === 'evaluasi' ? 'Evaluasi (semua bab)' : '-')}</strong> &bull; Dikumpulkan{' '}
                      {formatTanggal(selectedSub.waktu)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                  {profil?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => setHapusTarget(selectedSub)}
                      className="btn-press flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-[#FECACA] text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7]"
                      title="Hapus pengumpulan ini agar siswa bisa mengerjakan ulang"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus Pengumpulan
                    </button>
                  )}
                  {activeTab === 'lkpd' && (
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-[#DCEAF7] text-xs font-bold text-[#1B4E80] has-[:checked]:border-[#FFB454] has-[:checked]:bg-[#FFF8EC] transition-colors">
                      <input type="checkbox" checked={allowRetake} onChange={(e) => setAllowRetake(e.target.checked)} className="w-4 h-4 accent-[#F0932B]" />
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Izin Pengerjaan Ulang (Retake)</span>
                    </label>
                  )}
                  </div>
                </div>

                {/* Rincian Jawaban Siswa */}
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {skorPg && skorPg.maks > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F4F9FF] border border-[#DCEAF7] text-xs text-[#1B4E80]">
                      <span className="font-extrabold text-base tabular">{skorPg.skor}/{skorPg.maks}</span>
                      <span>
                        Skor otomatis pilihan ganda: {skorPg.skor} / {skorPg.maks} poin
                        {skorPg.uraian > 0 && <> &bull; uraian {skorPg.uraian} poin dinilai Anda</>}
                      </span>
                    </div>
                  )}
                  {soalTerpilih.length === 0 && !loadError && <div className="text-xs text-[#66748C]">Belum ada soal untuk kategori ini.</div>}
                  {soalTerpilih.map((q, idx) => {
                    const jwb = selectedSub.jawaban[q.id];
                    const isPg = q.tipe === 'pg';
                    const benar = isPg && !!jwb && !!q.kunci_jawaban && jwb.trim().toUpperCase() === q.kunci_jawaban.trim().toUpperCase();
                    return (
                      <div key={q.id} className="p-4 bg-white/90 border border-[#DCEAF7] rounded-xl">
                        <div className="flex justify-between items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-[#2E7BC4]">
                            Butir Soal #{q.urutan || idx + 1} ({isPg ? 'Pilihan Ganda' : 'Uraian / Essay'}) &bull; Bobot {bobotSoal(q)}
                          </span>
                          {isPg && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                !jwb ? 'bg-gray-100 text-[#66748C]' : benar ? 'bg-[#E4F8EE] text-[#166534]' : 'bg-[#FDEAE7] text-[#991B1B]'
                              }`}
                            >
                              {!jwb ? 'Tidak dijawab' : benar ? 'Benar' : 'Salah'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#66748C] mb-2">{q.pertanyaan}</p>
                        {isPg ? (
                          <div className="text-xs font-semibold p-2.5 rounded-lg bg-[#EAF6FF] text-[#1B4E80] space-y-1">
                            <div>
                              Jawaban Siswa: <strong>{jwb ? `${jwb.toUpperCase()}. ${teksOpsi(q, jwb) ?? ''}` : '-'}</strong>
                            </div>
                            <div className="text-[#66748C]">
                              Kunci: {q.kunci_jawaban ? `${q.kunci_jawaban.toUpperCase()}. ${teksOpsi(q, q.kunci_jawaban) ?? ''}` : '-'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs p-3 rounded-lg bg-gray-50 border border-gray-100 text-[#1F2A37] leading-relaxed whitespace-pre-wrap">
                            {jwb || 'Siswa tidak menjawab soal ini.'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {jawabanTanpaSoal.length > 0 && (
                    <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-xs text-[#92400E]">
                      <div className="font-bold mb-1">Jawaban lain yang tersimpan (soalnya sudah tidak ada):</div>
                      {jawabanTanpaSoal.map(([key, val]) => (
                        <div key={key} className="whitespace-pre-wrap">&bull; {val}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form Input Nilai 0-100 & Feedback Guru */}
                <div className="p-5 bg-white border border-[#DCEAF7] rounded-2xl shadow-sm">
                  <h3 className="text-sm font-bold text-[#1B4E80] mb-3 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#F0932B]" /> Keputusan Nilai Akhir &amp; Umpan Balik Guru
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label htmlFor="nilai-akhir" className="text-xs font-bold text-[#1F2A37] block mb-1">
                        Nilai Akhir (0 - 100)
                      </label>
                      <input
                        id="nilai-akhir"
                        type="number"
                        min={0}
                        max={100}
                        inputMode="numeric"
                        value={nilai}
                        onChange={(e) => setNilai(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !saving && handleSaveCorrection()}
                        placeholder="Contoh: 85"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] text-sm font-bold text-[#1B4E80] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 tabular"
                      />
                    </div>

                    {activeTab !== 'evaluasi' ? (
                      <div className="md:col-span-3">
                        <label htmlFor="catatan-guru" className="text-xs font-bold text-[#1F2A37] block mb-1">
                          Catatan &amp; Umpan Balik Personal Siswa
                        </label>
                        <input
                          id="catatan-guru"
                          type="text"
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !saving && handleSaveCorrection()}
                          placeholder="Apresiasi & arahan perbaikan (Enter untuk simpan)"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10"
                        />
                      </div>
                    ) : (
                      <div className="md:col-span-3 text-xs text-[#66748C] self-end pb-2">
                        Evaluasi hanya menyimpan nilai akhir (tidak ada kolom catatan).
                      </div>
                    )}
                  </div>

                  {saveError && (
                    <div role="alert" className="mt-4 p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-medium flex gap-2 anim-shake">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {saveError}
                    </div>
                  )}

                  <div className="mt-4 flex justify-between items-center gap-3 flex-wrap">
                    <span className="text-[11px] text-[#94A3B8]">{berubah ? 'Ada perubahan yang belum disimpan.' : ' '}</span>
                    <div className="flex gap-2.5">
                      {berikutnya && berikutnya.id !== selectedSub.id && (
                        <button
                          onClick={() => pilihSubmission(berikutnya)}
                          className="btn-press px-4 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-[#4B5A70] text-xs font-bold hover:border-[#2E7BC4] hover:text-[#2E7BC4] flex items-center gap-1"
                        >
                          Berikutnya <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={handleSaveCorrection}
                        disabled={saving}
                        className="btn-press px-6 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-xs font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)] flex items-center gap-2 disabled:opacity-60"
                      >
                        {saving ? <Spinner /> : <Save className="w-4 h-4" />}
                        {saving ? 'Menerbitkan Nilai...' : 'Simpan & Terbitkan Nilai'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
                <Inbox className="w-12 h-12 text-[#BFDBFE] mb-3" />
                <p className="text-sm font-semibold text-[#1B4E80]">
                  {submissions.length === 0 ? 'Belum ada lembar jawaban untuk dikoreksi.' : 'Silakan pilih salah satu submission siswa di kolom sebelah kiri.'}
                </p>
                <p className="text-xs text-[#66748C] mt-1">Lembar baru akan muncul di sini setelah siswa mengumpulkan tugas.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={aksiTertunda !== null}
        onClose={() => setAksiTertunda(null)}
        title="Perubahan belum disimpan"
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#FFF1DD] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#E37A12]" />
          </div>
        }
        actions={
          <>
            <button
              type="button"
              data-autofocus
              onClick={() => setAksiTertunda(null)}
              className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF]"
            >
              Kembali ke Penilaian
            </button>
            <button
              type="button"
              onClick={() => {
                const aksi = aksiTertunda;
                setAksiTertunda(null);
                aksi?.();
              }}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm"
            >
              Buang Perubahan
            </button>
          </>
        }
      >
        Nilai atau catatan untuk <strong>{selectedSub ? namaSiswa(selectedSub) : 'siswa ini'}</strong> belum disimpan. Jika dilanjutkan, perubahan akan hilang.
      </Modal>

      <Modal
        open={hapusTarget !== null}
        busy={menghapus}
        onClose={() => setHapusTarget(null)}
        title="Hapus pengumpulan ini?"
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-[#C2412E]" />
          </div>
        }
        actions={
          <>
            <button
              type="button"
              data-autofocus
              onClick={() => setHapusTarget(null)}
              disabled={menghapus}
              className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={hapusPengumpulan}
              disabled={menghapus}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {menghapus && <Spinner />}
              {menghapus ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </>
        }
      >
        Jawaban {JENIS[activeTab].singkat} milik <strong>{hapusTarget ? namaSiswa(hapusTarget) : ''}</strong> beserta nilainya akan dihapus permanen.
        Siswa bisa mengerjakan tugas ini lagi dari awal.
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
