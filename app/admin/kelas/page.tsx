'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { pesanGalat } from '@/lib/pengerjaan';
import { useProfil } from '@/lib/use-profil';
import { School, Plus, PencilLine, Trash2, Users, UserCheck, ArrowRight, Inbox, AlertTriangle, Hourglass } from 'lucide-react';

interface Kelas {
  id: string;
  nama: string;
  tingkat: string | null;
  tahun_ajaran: string | null;
  deskripsi: string | null;
}
type Form = Kelas & { baru: boolean };

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10';

export default function KelolaKelasPage() {
  const supabase = createClient();
  const profil = useProfil();
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [anggota, setAnggota] = useState<{ kelas_id: string; user_id: string; peran: string }[]>([]);
  const [nama, setNama] = useState<Record<string, string>>({});
  const [menunggu, setMenunggu] = useState<Record<string, number>>({});
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [hapus, setHapus] = useState<Kelas | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const muat = useCallback(async () => {
    const [k, a, u] = await Promise.all([
      supabase.from('kelas').select('id, nama, tingkat, tahun_ajaran, deskripsi').order('nama'),
      supabase.from('kelas_anggota').select('kelas_id, user_id, peran'),
      supabase.from('users').select('id, full_name, status_approval, kelas_diminta'),
    ]);
    setGalat(k.error ? pesanGalat(k.error) : null);
    setKelas((k.data ?? []) as Kelas[]);
    setAnggota((a.data ?? []) as typeof anggota);
    setNama(Object.fromEntries((u.data ?? []).map((x) => [x.id, x.full_name ?? '-'])));
    const m: Record<string, number> = {};
    (u.data ?? []).forEach((x) => x.status_approval === 'PENDING' && x.kelas_diminta && (m[x.kelas_diminta] = (m[x.kelas_diminta] ?? 0) + 1));
    setMenunggu(m);
    setMemuat(false);
  }, [supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  const simpan = async () => {
    if (!form) return;
    setGalatForm(null);
    if (!form.nama.trim()) return setGalatForm('Nama kelas belum diisi.');
    const muatan = { nama: form.nama.trim(), tingkat: form.tingkat?.trim() || null, tahun_ajaran: form.tahun_ajaran?.trim() || null, deskripsi: form.deskripsi?.trim() || null };
    setSibuk(true);
    const r = form.baru ? await supabase.from('kelas').insert(muatan).select('id') : await supabase.from('kelas').update(muatan).eq('id', form.id).select('id');
    setSibuk(false);
    if (r.error) return setGalatForm(pesanGalat(r.error));
    if (!r.data?.length) return setGalatForm('Kelas tidak tersimpan: akun Anda tidak memiliki izin.');
    setToast({ id: Date.now(), tone: 'success', text: form.baru ? `Kelas ${muatan.nama} dibuat. Masukkan guru dan siswa lewat "Kelola Anggota".` : 'Data kelas diperbarui.' });
    setForm(null);
    muat();
  };

  const hapusKelas = async () => {
    if (!hapus) return;
    setSibuk(true);
    const { data, error } = await supabase.from('kelas').delete().eq('id', hapus.id).select('id');
    setSibuk(false);
    const target = hapus;
    setHapus(null);
    if (error || !data?.length) return setToast({ id: Date.now(), tone: 'error', text: error ? pesanGalat(error) : 'Kelas gagal dihapus: tidak ada izin.' });
    setToast({ id: Date.now(), tone: 'success', text: `Kelas ${target.nama} dihapus.` });
    muat();
  };

  const siswaDi = (id: string) => anggota.filter((a) => a.kelas_id === id && a.peran === 'siswa').length;
  const guruDi = (id: string) => anggota.filter((a) => a.kelas_id === id && a.peran === 'guru').map((a) => nama[a.user_id]).filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Kelola Kelas" userRole="admin" userName={profil?.nama ?? '…'} />
      <StaffNav role="admin" />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2"><School className="w-6 h-6 text-[#2E7BC4]" /> Kelola Kelas</h1>
            <p className="text-xs text-[#66748C] mt-1">Buat kelas, lalu masukkan guru pengampu dan siswanya. Siswa hanya melihat jadwal, agenda, dan materi untuk kelasnya.</p>
          </div>
          <button type="button" onClick={() => { setGalatForm(null); setForm({ id: '', nama: '', tingkat: '', tahun_ajaran: '', deskripsi: '', baru: true }); }} className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)]">
            <Plus className="w-4 h-4" /> Tambah Kelas
          </button>
        </div>

        {galat && (
          <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {galat}</div>
        )}

        {memuat ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-3xl" />)}</div>
        ) : kelas.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#1B4E80]">Belum ada kelas.</p>
            <p className="text-xs text-[#66748C] mt-1">Mulai dengan membuat kelas, misalnya &ldquo;VII-A&rdquo;.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kelas.map((k, i) => {
              const guru = guruDi(k.id);
              return (
                <article key={k.id} className="glass-card card-hover p-5 flex flex-col anim-rise" style={{ ['--i' as string]: i }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-extrabold text-[#1B4E80]">{k.nama}</h2>
                      <p className="text-[11px] text-[#66748C]">{[k.tingkat && `Tingkat ${k.tingkat}`, k.tahun_ajaran].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" aria-label={`Ubah kelas ${k.nama}`} onClick={() => { setGalatForm(null); setForm({ ...k, baru: false }); }} className="btn-press w-8 h-8 rounded-lg flex items-center justify-center text-[#1B4E80] hover:bg-[#EAF6FF]"><PencilLine className="w-4 h-4" /></button>
                      <button type="button" aria-label={`Hapus kelas ${k.nama}`} onClick={() => setHapus(k)} className="btn-press w-8 h-8 rounded-lg flex items-center justify-center text-[#C2412E] hover:bg-[#FDEAE7]"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {k.deskripsi && <p className="text-xs text-[#4B5A70] mt-2 line-clamp-2">{k.deskripsi}</p>}
                  <div className="mt-3 space-y-1.5 text-xs flex-1">
                    <p className="flex items-center gap-1.5 text-[#1F2A37]"><Users className="w-3.5 h-3.5 text-[#94A3B8]" /> <strong className="tabular">{siswaDi(k.id)}</strong> siswa</p>
                    <p className={`flex items-start gap-1.5 ${guru.length ? 'text-[#1F2A37]' : 'text-[#C2412E] font-bold'}`}><UserCheck className="w-3.5 h-3.5 text-[#94A3B8] mt-px" /> {guru.length ? guru.join(', ') : 'Belum ada guru pengampu'}</p>
                    {menunggu[k.id] ? <p className="flex items-center gap-1.5 text-[#B45309] font-semibold"><Hourglass className="w-3.5 h-3.5" /> {menunggu[k.id]} pendaftar menunggu</p> : null}
                  </div>
                  <Link href={`/admin/kelas/${k.id}`} className="btn-press mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#EAF6FF] text-[#1B4E80] text-xs font-bold hover:bg-[#D3ECFF]">
                    Kelola Anggota <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={form !== null}
        busy={sibuk}
        onClose={() => setForm(null)}
        title={form?.baru ? 'Tambah Kelas' : 'Ubah Kelas'}
        actions={
          <>
            <button type="button" onClick={() => setForm(null)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">Batal</button>
            <button type="button" onClick={simpan} disabled={sibuk} className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">{sibuk && <Spinner />} Simpan</button>
          </>
        }
      >
        {form && (
          <div className="space-y-3 text-[#1F2A37]">
            <div>
              <label htmlFor="k-nama" className="block text-xs font-bold mb-1.5">Nama kelas</label>
              <input id="k-nama" data-autofocus value={form.nama} maxLength={40} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Contoh: VII-A" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="k-tingkat" className="block text-xs font-bold mb-1.5">Tingkat</label>
                <input id="k-tingkat" value={form.tingkat ?? ''} maxLength={10} onChange={(e) => setForm({ ...form, tingkat: e.target.value })} placeholder="VII" className={inputClass} />
              </div>
              <div>
                <label htmlFor="k-tahun" className="block text-xs font-bold mb-1.5">Tahun ajaran</label>
                <input id="k-tahun" value={form.tahun_ajaran ?? ''} maxLength={20} onChange={(e) => setForm({ ...form, tahun_ajaran: e.target.value })} placeholder="2026/2027" className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="k-desk" className="block text-xs font-bold mb-1.5">Keterangan <span className="font-normal text-[#94A3B8]">(opsional)</span></label>
              <textarea id="k-desk" rows={2} value={form.deskripsi ?? ''} maxLength={300} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} className={`${inputClass} resize-y`} />
            </div>
            {galatForm && (
              <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake"><AlertTriangle className="w-4 h-4 shrink-0" /> {galatForm}</div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={hapus !== null}
        busy={sibuk}
        onClose={() => setHapus(null)}
        title={`Hapus kelas ${hapus?.nama ?? ''}?`}
        icon={<div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center"><Trash2 className="w-6 h-6 text-[#C2412E]" /></div>}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">Batal</button>
            <button type="button" onClick={hapusKelas} disabled={sibuk} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">{sibuk && <Spinner />} Ya, Hapus</button>
          </>
        }
      >
        {hapus && (
          <p>
            {siswaDi(hapus.id)} siswa akan dilepas dari kelas ini (akunnya tetap ada), dan jadwal serta agenda kelas ini ikut terhapus. Nilai dan pengumpulan siswa tidak terhapus.
          </p>
        )}
      </Modal>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
