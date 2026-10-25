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

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[980px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80]">Kelola Materi</h1>
            <p className="text-xs text-[#66748C] mt-1">Tambah, ubah, atau hapus bab materi yang dipelajari siswa.</p>
          </div>
          <Link
            href="/guru/materi/baru"
            className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)]"
          >
            <Plus className="w-4 h-4" /> Tambah Bab
          </Link>
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
            <Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#1B4E80]">Belum ada materi.</p>
            <p className="text-xs text-[#66748C] mt-1 mb-5">Mulai dengan menambahkan Bab 1.</p>
            <Link href="/guru/materi/baru" className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] text-white text-sm font-bold">
              <Plus className="w-4 h-4" /> Tambah Bab
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {daftar.map((m, i) => {
              const media = kenaliMedia(m.youtube_url);
              const subbab = Array.isArray(m.subbab_json) ? m.subbab_json.length : 0;
              const lkpd = jumlahLkpd[m.id] ?? 0;
              return (
                <article key={m.id} className="glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise" style={{ ['--i' as string]: i }}>
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D3ECFF] to-[#EAF6FF] border border-white text-[#1B4E80] flex flex-col items-center justify-center shrink-0 shadow-sm">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#2E7BC4]">Bab</span>
                      <span className="text-xl font-extrabold leading-none tabular">{m.chapter_number ?? '?'}</span>
                    </div>
                    <div className="min-w-0">
                      <Link href={`/guru/materi/${m.id}`} className="font-extrabold text-[#1B4E80] hover:text-[#2E7BC4] line-clamp-2">
                        {m.title || 'Tanpa judul'}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] font-semibold text-[#66748C]">
                        {m.terbit === false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#4B5A70]"><EyeOff className="w-3 h-3" /> Draf</span>
                        ) : m.tanggal_buka && new Date(m.tanggal_buka) > new Date() ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF1DD] text-[#B45309]"><CalendarClock className="w-3 h-3" /> Dibuka {new Date(m.tanggal_buka).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E4F8EE] text-[#15885A]"><Eye className="w-3 h-3" /> Terbit</span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F4F9FF] text-[#1B4E80]">
                          <School className="w-3 h-3" /> {m.kelas_ids?.length ? m.kelas_ids.map((id) => namaKelas[id] ?? '?').join(', ') : 'Semua kelas'}
                        </span>
                        <span>{subbab} subbab</span>
                        {media?.jenis === 'youtube' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#DC2626]">
                            <PlayCircle className="w-3 h-3" /> Video
                          </span>
                        )}
                        {media?.jenis === 'pdf' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF1DD] text-[#B45309]">
                            <FileText className="w-3 h-3" /> PDF
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EAF6FF] text-[#1B4E80]">
                          <Users className="w-3 h-3" /> {lkpd} LKPD terkumpul
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link
                      href={`/guru/lkpd/${m.id}`}
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#B45309] hover:bg-[#FFF1DD]"
                    >
                      <ClipboardList className="w-3.5 h-3.5" /> LKPD
                    </Link>
                    <Link
                      href={`/guru/materi/${m.id}`}
                      className="btn-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#DCEAF7] text-xs font-bold text-[#1B4E80] hover:border-[#2E7BC4]"
                    >
                      <PencilLine className="w-3.5 h-3.5" /> Ubah
                    </Link>
                    <button
                      type="button"
                      onClick={() => setHapus(m)}
                      className="btn-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7]"
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
