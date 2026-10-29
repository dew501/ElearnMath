'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { pesanGalat } from '@/lib/pengerjaan';
import { kenaliMedia } from '@/lib/url';
import { Plus, PencilLine, Trash2, PlayCircle, FileText, Inbox, AlertTriangle, Users, Eye, EyeOff, CalendarClock, School, ClipboardList } from 'lucide-react';

interface Materi {
  id: string;
  chapter_number: number | null;
  title: string | null;
  subbab_json: unknown;
  youtube_url: string | null;
  terbit: boolean | null;
  tanggal_buka: string | null;
  kelas_ids: string[] | null;
}

export default function KelolaMateriPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profil, setProfil] = useState<{ nama: string; role: 'guru' | 'admin' } | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [daftar, setDaftar] = useState<Materi[]>([]);
  const [jumlahLkpd, setJumlahLkpd] = useState<Record<string, number>>({});
  const [namaKelas, setNamaKelas] = useState<Record<string, string>>({});
  const [hapus, setHapus] = useState<Materi | null>(null);
  const [menghapus, setMenghapus] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const [p, m, l, k] = await Promise.all([
        supabase.from('users').select('full_name, role').eq('id', user.id).maybeSingle(),
        supabase.from('materi').select('id, chapter_number, title, subbab_json, youtube_url, terbit, tanggal_buka, kelas_ids').order('chapter_number', { ascending: true }),
        supabase.from('jawaban_lkpd').select('id_materi'),
        supabase.from('kelas').select('id, nama'),
      ]);
      setNamaKelas(Object.fromEntries((k.data ?? []).map((x) => [x.id, x.nama])));
      setProfil({ nama: p.data?.full_name || user.email?.split('@')[0] || 'Guru', role: p.data?.role === 'admin' ? 'admin' : 'guru' });
      if (m.error) setGalat(pesanGalat(m.error));
      setDaftar((m.data ?? []) as Materi[]);
      const hitung: Record<string, number> = {};
      (l.data ?? []).forEach((r) => {
        if (r.id_materi) hitung[r.id_materi] = (hitung[r.id_materi] ?? 0) + 1;
      });
      setJumlahLkpd(hitung);
      setMemuat(false);
    })();
  }, [router, supabase]);

  const hapusMateri = async () => {
    if (!hapus) return;
    setMenghapus(true);
    const { data, error } = await supabase.from('materi').delete().eq('id', hapus.id).select('id');
    setMenghapus(false);
    const target = hapus;
    setHapus(null);
    if (error || !data?.length) {
      setToast({ id: Date.now(), tone: 'error', text: error ? `Materi gagal dihapus. ${pesanGalat(error)}` : 'Materi gagal dihapus: akun Anda tidak memiliki izin.' });
      return;
    }
    setDaftar((d) => d.filter((x) => x.id !== target.id));
    setToast({ id: Date.now(), tone: 'success', text: `Bab ${target.chapter_number} dihapus.` });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Kelola Materi" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role ?? null} />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1040px] w-full mx-auto">
        <div className="hero-navy p-6 sm:p-7 mb-6 anim-rise">
          <div className="relative z-10 flex items-start sm:items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-xs font-bold text-[#FFCA80] mb-3">
                Kurikulum Matematika · {memuat ? '…' : `${daftar.length} bab terdaftar`}
              </div>
              <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-[-0.02em]">Kelola Materi Pembelajaran</h1>
              <p className="text-xs sm:text-[13px] text-[#C8E1FA] mt-1.5">Tambah, susun subbab, atur jadwal terbit, dan kelola media pembelajaran siswa.</p>
            </div>
            <Link
              href="/guru/materi/baru"
              className="btn-amber inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-extrabold"
            >
              <Plus className="w-4 h-4" /> Tambah Bab
            </Link>
          </div>
        </div>

        {galat && (
          <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {galat}
          </div>
        )}

        {memuat ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card p-5 flex gap-4">
                <Skeleton className="w-14 h-14 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : daftar.length === 0 ? (
          <div className="glass-card p-10 text-center anim-rise">
            <Inbox className="w-12 h-12 text-[#9CC5EC] mx-auto mb-3" />
            <p className="text-sm font-bold text-[#0E2A48]">Belum ada materi.</p>
            <p className="text-xs text-[#5A6B82] mt-1 mb-5">Mulai dengan menambahkan Bab 1.</p>
            <Link href="/guru/materi/baru" className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold">
              <Plus className="w-4 h-4" /> Tambah Bab
            </Link>
          </div>
        ) : (
          <div className="space-y-3.5">
            {daftar.map((m, i) => {
              const media = kenaliMedia(m.youtube_url);
              const subbab = Array.isArray(m.subbab_json) ? m.subbab_json.length : 0;
              const lkpd = jumlahLkpd[m.id] ?? 0;
              return (
                <article key={m.id} className="glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise" style={{ ['--i' as string]: i }}>
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#194B7E] to-[#0D2847] border border-[#2C68A6]/60 text-white flex flex-col items-center justify-center shrink-0 shadow-[0_8px_16px_-4px_rgba(13,40,71,0.38)]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFCA80]">Bab</span>
                      <span className="text-xl font-extrabold leading-none tabular mt-0.5">{m.chapter_number ?? '?'}</span>
                    </div>
                    <div className="min-w-0">
                      <Link href={`/guru/materi/${m.id}`} className="text-base font-extrabold text-[#0E2A48] hover:text-[#256DB3] line-clamp-2">
                        {m.title || 'Tanpa judul'}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs font-semibold text-[#5A6B82]">
                        {m.terbit === false ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F1F5F9] border border-[#DCE5F0] text-[#4B5A70]"><EyeOff className="w-3 h-3" /> Draf</span>
                        ) : m.tanggal_buka && new Date(m.tanggal_buka) > new Date() ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFF1DD] border border-[#F6D29B] text-[#B45309]"><CalendarClock className="w-3 h-3" /> Dibuka {new Date(m.tanggal_buka).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E3F7EE] border border-[#B4E7CE] text-[#127A4D]"><Eye className="w-3 h-3" /> Terbit</span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EDF5FD] border border-[#CDE1F6] text-[#133B63]">
                          <School className="w-3 h-3" /> {m.kelas_ids?.length ? m.kelas_ids.map((id) => namaKelas[id] ?? '?').join(', ') : 'Semua kelas'}
                        </span>
                        <span className="tabular font-bold text-[#133B63]">{subbab} subbab</span>
                        {media?.jenis === 'youtube' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FEE2E2] border border-[#FECACA] text-[#DC2626]">
                            <PlayCircle className="w-3 h-3" /> Video
                          </span>
                        )}
                        {media?.jenis === 'pdf' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFF1DD] border border-[#F6D29B] text-[#B45309]">
                            <FileText className="w-3 h-3" /> PDF
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E8F3FF] border border-[#C6DFF9] text-[#133B63] tabular">
                          <Users className="w-3 h-3" /> {lkpd} LKPD terkumpul
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link
                      href={`/guru/lkpd/${m.id}`}
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFF6E9] border border-[#F5D39E] text-xs font-bold text-[#A54F05] hover:bg-[#FFEAD0]"
                    >
                      <ClipboardList className="w-3.5 h-3.5" /> LKPD
                    </Link>
                    <Link
                      href={`/guru/materi/${m.id}`}
                      className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                    >
                      <PencilLine className="w-3.5 h-3.5" /> Ubah
                    </Link>
                    <button
                      type="button"
                      onClick={() => setHapus(m)}
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#F4C7C1] bg-[#FFF7F6] text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7]"
                      aria-label={`Hapus Bab ${m.chapter_number}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={hapus !== null}
        busy={menghapus}
        onClose={() => setHapus(null)}
        title={`Hapus Bab ${hapus?.chapter_number ?? ''}?`}
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-[#C2412E]" />
          </div>
        }
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} disabled={menghapus} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50">
              Batal
            </button>
            <button type="button" onClick={hapusMateri} disabled={menghapus} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {menghapus && <Spinner />}
              {menghapus ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </>
        }
      >
        <p>
          Materi <strong>{hapus?.title}</strong> akan dihapus permanen, termasuk soal khusus bab ini.
        </p>
        {hapus && (jumlahLkpd[hapus.id] ?? 0) > 0 && (
          <p className="mt-2 text-[#B45309] font-semibold">
            Bab ini sudah punya {jumlahLkpd[hapus.id]} pengumpulan LKPD. Penghapusan bisa ditolak database agar nilai siswa tidak hilang.
          </p>
        )}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
