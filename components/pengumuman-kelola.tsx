'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { pesanGalat } from '@/lib/pengerjaan';
import { waktuRelatif } from '@/lib/waktu';
import type { ProfilRingkas } from '@/lib/use-profil';
import { Megaphone, Plus, PencilLine, Trash2, AlertTriangle, Inbox, Star, School, Globe2 } from 'lucide-react';

export interface Pengumuman {
  id: string;
  judul: string;
  isi: string;
  kelas_ids: string[] | null;
  penting: boolean;
  dibuat_oleh: string | null;
  peran_pembuat: string | null;
  nama_pembuat: string | null;
  created_at: string;
  updated_at: string;
}

interface FormData {
  id: string | null;
  judul: string;
  isi: string;
  sekolah: boolean;
  kelas: string[];
  penting: boolean;
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 transition-all';

/** Kartu pengumuman (dipakai juga di halaman siswa). */
export function KartuPengumuman({ p, namaKelas, aksi }: { p: Pengumuman; namaKelas: (id: string) => string; aksi?: React.ReactNode }) {
  const [lengkap, setLengkap] = useState(false);
  const panjang = p.isi.length > 260 || p.isi.split('\n').length > 4;
  const diubah = new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 60_000;
  return (
    <article className={`glass-card p-5 anim-rise ${p.penting ? 'ring-2 ring-[#F27E6B]/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {p.penting && (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FDEAE7] text-[#C2412E] uppercase tracking-wide">
                <Star className="w-3 h-3" /> Penting
              </span>
            )}
            {p.kelas_ids?.length ? (
              p.kelas_ids.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EAF6FF] text-[#1B4E80]">
                  <School className="w-3 h-3" /> {namaKelas(k)}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E4F8EE] text-[#15885A]">
                <Globe2 className="w-3 h-3" /> Seluruh sekolah
              </span>
            )}
          </div>
          <h3 className="text-base font-extrabold text-[#1B4E80] leading-snug">{p.judul}</h3>
        </div>
        {aksi && <div className="flex gap-1 shrink-0">{aksi}</div>}
      </div>
      <p className={`text-sm text-[#1F2A37] mt-2 leading-relaxed whitespace-pre-wrap ${!lengkap && panjang ? 'line-clamp-4' : ''}`}>{p.isi}</p>
      {panjang && (
        <button type="button" onClick={() => setLengkap((v) => !v)} className="text-xs font-bold text-[#2E7BC4] mt-1 hover:underline">
          {lengkap ? 'Tampilkan lebih sedikit' : 'Baca selengkapnya'}
        </button>
      )}
      <div className="mt-3 text-[11px] text-[#94A3B8] flex flex-wrap gap-x-2">
        <span>
          {p.nama_pembuat ?? 'Sekolah'}
          {p.peran_pembuat && <span className="uppercase font-bold ml-1">· {p.peran_pembuat}</span>}
        </span>
        <span>· {waktuRelatif(p.created_at)}</span>
        {diubah && <span>· diubah {waktuRelatif(p.updated_at)}</span>}
      </div>
    </article>
  );
}

/** Kelola pengumuman untuk guru (kelas yang diampu) dan admin (kelas mana pun / seluruh sekolah). */
export function PengumumanKelola({ profil }: { profil: ProfilRingkas }) {
  const supabase = createClient();
  const admin = profil.role === 'admin';
  const [daftar, setDaftar] = useState<Pengumuman[]>([]);
  const [semuaKelas, setSemuaKelas] = useState<{ id: string; nama: string }[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [filter, setFilter] = useState<'semua' | 'saya' | 'admin' | 'guru'>('semua');
  const [form, setForm] = useState<FormData | null>(null);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hapus, setHapus] = useState<Pengumuman | null>(null);
  const [menghapus, setMenghapus] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const pilihanKelas = admin ? semuaKelas : profil.kelas;
  const namaKelas = useCallback((id: string) => semuaKelas.find((k) => k.id === id)?.nama ?? 'Kelas terhapus', [semuaKelas]);

  const muat = useCallback(async () => {
    setMemuat(true);
    const [p, k] = await Promise.all([
      supabase.from('pengumuman').select('id, judul, isi, kelas_ids, penting, dibuat_oleh, peran_pembuat, nama_pembuat, created_at, updated_at').order('created_at', { ascending: false }),
      supabase.from('kelas').select('id, nama').order('nama'),
    ]);
    setGalat(p.error ? pesanGalat(p.error) : null);
    setDaftar((p.data ?? []) as Pengumuman[]);
    setSemuaKelas((k.data ?? []) as { id: string; nama: string }[]);
    setMemuat(false);
  }, [supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  const tersaring = useMemo(
    () =>
      daftar.filter((p) => {
        if (filter === 'saya') return p.dibuat_oleh === profil.id;
        if (filter === 'admin' || filter === 'guru') return p.peran_pembuat === filter;
        return true;
      }),
    [daftar, filter, profil.id]
  );

  const bukaBaru = () => {
    setGalatForm(null);
    setForm({ id: null, judul: '', isi: '', sekolah: admin, kelas: admin ? [] : profil.kelas.map((k) => k.id), penting: false });
  };
  const bukaUbah = (p: Pengumuman) => {
    setGalatForm(null);
    setForm({ id: p.id, judul: p.judul, isi: p.isi, sekolah: !p.kelas_ids?.length, kelas: p.kelas_ids ?? [], penting: p.penting });
  };

  const simpan = async () => {
    if (!form) return;
    setGalatForm(null);
    if (!form.judul.trim()) return setGalatForm('Judul pengumuman belum diisi.');
    if (!form.isi.trim()) return setGalatForm('Isi pengumuman belum diisi.');
    const kelas_ids = admin && form.sekolah ? null : form.kelas;
    if (kelas_ids && !kelas_ids.length) return setGalatForm('Pilih minimal satu kelas tujuan.');
    const muatan = { judul: form.judul.trim(), isi: form.isi.trim(), kelas_ids, penting: form.penting };
    setMenyimpan(true);
    const hasil = form.id
      ? await supabase.from('pengumuman').update(muatan).eq('id', form.id).select('id')
      : await supabase.from('pengumuman').insert(muatan).select('id');
    setMenyimpan(false);
    if (hasil.error) return setGalatForm(pesanGalat(hasil.error));
    if (!hasil.data?.length) return setGalatForm('Pengumuman tidak tersimpan: akun Anda tidak memiliki izin.');
    setToast({ id: Date.now(), tone: 'success', text: form.id ? 'Pengumuman diperbarui.' : 'Pengumuman terbit dan dikirim ke lonceng notifikasi siswa.' });
    setForm(null);
    muat();
  };

  const hapusPengumuman = async () => {
    if (!hapus) return;
    setMenghapus(true);
    const { data, error } = await supabase.from('pengumuman').delete().eq('id', hapus.id).select('id');
    setMenghapus(false);
    setHapus(null);
    if (error || !data?.length) return setToast({ id: Date.now(), tone: 'error', text: error ? pesanGalat(error) : 'Pengumuman gagal dihapus: tidak ada izin.' });
    setDaftar((d) => d.filter((x) => x.id !== hapus.id));
    setToast({ id: Date.now(), tone: 'success', text: 'Pengumuman dihapus.' });
  };

  const bolehUbah = (p: Pengumuman) => admin || p.dibuat_oleh === profil.id;
  const FILTER = admin
    ? ([['semua', 'Semua'], ['admin', 'Dari admin'], ['guru', 'Dari guru']] as const)
    : ([['semua', 'Semua'], ['saya', 'Buatan saya']] as const);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5 anim-rise">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-[#F0932B]" /> Pengumuman
          </h1>
          <p className="text-xs text-[#66748C] mt-1">
            {admin ? 'Buat pengumuman untuk seluruh sekolah atau kelas tertentu, dan pantau pengumuman yang dibuat guru.' : 'Pengumuman untuk kelas yang Anda ampu. Siswa menerimanya di lonceng notifikasi.'}
          </p>
        </div>
        <button
          type="button"
          onClick={bukaBaru}
          disabled={!admin && !profil.kelas.length}
          className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)] disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Buat Pengumuman
        </button>
      </div>

      {!admin && !profil.kelas.length && (
        <div className="mb-5 p-4 rounded-2xl bg-[#FFF8EC] border border-[#FBD38D] text-xs font-semibold text-[#92400E] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Anda belum mengampu kelas. Minta admin memasukkan Anda ke kelas agar bisa membuat pengumuman.
        </div>
      )}

      <div className="flex gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm w-fit mb-5" role="tablist" aria-label="Saring pengumuman">
        {FILTER.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`btn-press px-4 py-2 rounded-xl text-xs font-bold ${filter === k ? 'bg-[#2E7BC4] text-white shadow-[0_4px_12px_rgba(46,123,196,0.3)]' : 'text-[#66748C] hover:text-[#1B4E80]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {galat && (
        <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {galat}
        </div>
      )}

      {memuat ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="glass-card p-5 space-y-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      ) : tersaring.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#1B4E80]">Belum ada pengumuman.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tersaring.map((p) => (
            <KartuPengumuman
              key={p.id}
              p={p}
              namaKelas={namaKelas}
              aksi={
                bolehUbah(p) ? (
                  <>
                    <button type="button" onClick={() => bukaUbah(p)} className="btn-press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#1B4E80] hover:bg-[#EAF6FF]">
                      <PencilLine className="w-3.5 h-3.5" /> Ubah
                    </button>
                    <button type="button" onClick={() => setHapus(p)} aria-label={`Hapus pengumuman ${p.judul}`} className="btn-press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7]">
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <Modal
        open={form !== null}
        busy={menyimpan}
        lebar="lg"
        onClose={() => setForm(null)}
        title={form?.id ? 'Ubah Pengumuman' : 'Buat Pengumuman'}
        actions={
          <>
            <button type="button" onClick={() => setForm(null)} disabled={menyimpan} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50">
              Batal
            </button>
            <button type="button" onClick={simpan} disabled={menyimpan} className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {menyimpan && <Spinner />} {form?.id ? 'Simpan Perubahan' : 'Terbitkan'}
            </button>
          </>
        }
      >
        {form && (
          <div className="space-y-4 text-[#1F2A37]">
            <div>
              <label htmlFor="pg-judul" className="block text-xs font-bold mb-1.5">Judul</label>
              <input id="pg-judul" data-autofocus value={form.judul} maxLength={150} onChange={(e) => setForm({ ...form, judul: e.target.value })} placeholder="Contoh: Ulangan harian Bab 1" className={inputClass} />
            </div>
            <div>
              <label htmlFor="pg-isi" className="block text-xs font-bold mb-1.5">Isi pengumuman</label>
              <textarea id="pg-isi" rows={6} value={form.isi} maxLength={4000} onChange={(e) => setForm({ ...form, isi: e.target.value })} className={`${inputClass} resize-y`} placeholder="Tulis informasi untuk siswa..." />
            </div>
            <fieldset>
              <legend className="block text-xs font-bold mb-1.5">Ditujukan untuk</legend>
              {admin && (
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#F4F9FF] border border-[#DCEAF7] rounded-xl mb-2" role="radiogroup" aria-label="Sasaran">
                  {[
                    [true, 'Seluruh sekolah'],
                    [false, 'Kelas tertentu'],
                  ].map(([v, label]) => (
                    <button
                      key={String(v)}
                      type="button"
                      role="radio"
                      aria-checked={form.sekolah === v}
                      onClick={() => setForm({ ...form, sekolah: v as boolean })}
                      className={`py-2 rounded-lg text-xs font-bold ${form.sekolah === v ? 'bg-white text-[#1B4E80] shadow-sm' : 'text-[#66748C]'}`}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
              )}
              {(!admin || !form.sekolah) && (
                <div className="flex flex-wrap gap-2">
                  {pilihanKelas.length === 0 && <p className="text-xs text-[#66748C]">Belum ada kelas.</p>}
                  {pilihanKelas.map((k) => {
                    const dipilih = form.kelas.includes(k.id);
                    return (
                      <label key={k.id} className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${dipilih ? 'border-[#2E7BC4] bg-[#EAF6FF] text-[#1B4E80]' : 'border-[#DCEAF7] text-[#66748C]'}`}>
                        <input
                          type="checkbox"
                          checked={dipilih}
                          onChange={() => setForm({ ...form, kelas: dipilih ? form.kelas.filter((x) => x !== k.id) : [...form.kelas, k.id] })}
                          className="w-4 h-4 accent-[#2E7BC4]"
                        />
                        {k.nama}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold">
              <input type="checkbox" checked={form.penting} onChange={(e) => setForm({ ...form, penting: e.target.checked })} className="w-4 h-4 accent-[#E3543F]" />
              Tandai sebagai <span className="text-[#C2412E] font-extrabold">penting</span>
            </label>
            {galatForm && (
              <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {galatForm}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={hapus !== null}
        busy={menghapus}
        onClose={() => setHapus(null)}
        title="Hapus pengumuman ini?"
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-[#C2412E]" />
          </div>
        }
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} disabled={menghapus} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">
              Batal
            </button>
            <button type="button" onClick={hapusPengumuman} disabled={menghapus} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {menghapus && <Spinner />} Ya, Hapus
            </button>
          </>
        }
      >
        &ldquo;{hapus?.judul}&rdquo; akan dihapus dan tidak tampil lagi untuk siswa.
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
