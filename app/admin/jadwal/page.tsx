'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { JadwalMingguan, type EntriJadwal } from '@/components/jadwal-mingguan';
import { pesanGalat } from '@/lib/pengerjaan';
import { HARI, jamPendek } from '@/lib/waktu';
import { useProfil } from '@/lib/use-profil';
import { CalendarDays, Plus, Trash2, AlertTriangle } from 'lucide-react';

interface Baris {
  id: string;
  kelas_id: string;
  guru_id: string | null;
  hari: number;
  jam_mulai: string;
  jam_selesai: string;
  mapel: string;
  ruang: string | null;
  catatan: string | null;
}
type Form = Omit<Baris, 'id'> & { id: string | null };

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10';
const menit = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

export default function AturJadwalPage() {
  const supabase = createClient();
  const profil = useProfil();
  const [jadwal, setJadwal] = useState<Baris[]>([]);
  const [kelas, setKelas] = useState<{ id: string; nama: string }[]>([]);
  const [guru, setGuru] = useState<{ id: string; full_name: string | null }[]>([]);
  const [anggota, setAnggota] = useState<{ kelas_id: string; user_id: string; peran: string }[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [mode, setMode] = useState<'kelas' | 'guru'>('kelas');
  const [pilih, setPilih] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const muat = useCallback(async () => {
    const [j, k, g, a] = await Promise.all([
      supabase.from('jadwal').select('id, kelas_id, guru_id, hari, jam_mulai, jam_selesai, mapel, ruang, catatan'),
      supabase.from('kelas').select('id, nama').order('nama'),
      supabase.from('users').select('id, full_name').eq('role', 'guru').eq('status_approval', 'APPROVED').order('full_name'),
      supabase.from('kelas_anggota').select('kelas_id, user_id, peran').eq('peran', 'guru'),
    ]);
    setJadwal((j.data ?? []) as Baris[]);
    setKelas((k.data ?? []) as { id: string; nama: string }[]);
    setGuru((g.data ?? []) as { id: string; full_name: string | null }[]);
    setAnggota((a.data ?? []) as typeof anggota);
    setMemuat(false);
    setPilih((p) => p || new URLSearchParams(window.location.search).get('kelas') || k.data?.[0]?.id || '');
  }, [supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaKelas = (id: string) => kelas.find((k) => k.id === id)?.nama ?? '-';
  const namaGuru = (id: string | null) => guru.find((g) => g.id === id)?.full_name ?? (id ? 'Guru' : 'Belum ditentukan');
  const entri: EntriJadwal[] = useMemo(
    () =>
      jadwal
        .filter((j) => (mode === 'kelas' ? j.kelas_id === pilih : j.guru_id === pilih))
        .map((j) => ({ ...j, kelas_nama: namaKelas(j.kelas_id), guru_nama: namaGuru(j.guru_id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jadwal, mode, pilih, kelas, guru]
  );

  const bukaBaru = () => {
    setGalat(null);
    const k = mode === 'kelas' ? pilih : kelas[0]?.id ?? '';
    const g = mode === 'guru' ? pilih : anggota.find((a) => a.kelas_id === k)?.user_id ?? '';
    setForm({ id: null, kelas_id: k, guru_id: g || null, hari: 1, jam_mulai: '07:00', jam_selesai: '08:20', mapel: 'Matematika', ruang: '', catatan: '' });
  };
  const bukaUbah = (e: EntriJadwal) => {
    const j = jadwal.find((x) => x.id === e.id);
    if (!j) return;
    setGalat(null);
    setForm({ ...j, jam_mulai: j.jam_mulai.slice(0, 5), jam_selesai: j.jam_selesai.slice(0, 5) });
  };

  const bentrok = (f: Form) =>
    jadwal.find(
      (j) =>
        j.id !== f.id &&
        j.hari === Number(f.hari) &&
        (j.kelas_id === f.kelas_id || (!!f.guru_id && j.guru_id === f.guru_id)) &&
        menit(f.jam_mulai) < menit(j.jam_selesai) &&
        menit(f.jam_selesai) > menit(j.jam_mulai)
    );

  const simpan = async () => {
    if (!form) return;
    setGalat(null);
    if (!form.kelas_id) return setGalat('Pilih kelas.');
    if (!form.jam_mulai || !form.jam_selesai || menit(form.jam_selesai) <= menit(form.jam_mulai)) return setGalat('Jam selesai harus setelah jam mulai.');
    const b = bentrok(form);
    if (b) {
      return setGalat(
        `Bentrok dengan jadwal ${b.kelas_id === form.kelas_id ? `kelas ${namaKelas(b.kelas_id)}` : `${namaGuru(b.guru_id)} di kelas ${namaKelas(b.kelas_id)}`} (${HARI[b.hari]} ${jamPendek(b.jam_mulai)}–${jamPendek(b.jam_selesai)}).`
      );
    }
    const muatan = {
      kelas_id: form.kelas_id,
      guru_id: form.guru_id || null,
      hari: Number(form.hari),
      jam_mulai: form.jam_mulai,
      jam_selesai: form.jam_selesai,
      mapel: form.mapel.trim() || 'Matematika',
      ruang: form.ruang?.trim() || null,
      catatan: form.catatan?.trim() || null,
    };
    setSibuk(true);
    const r = form.id ? await supabase.from('jadwal').update(muatan).eq('id', form.id).select('id') : await supabase.from('jadwal').insert(muatan).select('id');
    setSibuk(false);
    if (r.error) return setGalat(pesanGalat(r.error));
    if (!r.data?.length) return setGalat('Jadwal tidak tersimpan: akun Anda tidak memiliki izin.');
    setToast({ id: Date.now(), tone: 'success', text: form.id ? 'Jadwal diperbarui.' : 'Jadwal ditambahkan.' });
    setForm(null);
    muat();
  };

  const hapus = async () => {
    if (!form?.id) return;
    setSibuk(true);
    const { error } = await supabase.from('jadwal').delete().eq('id', form.id);
    setSibuk(false);
    if (error) return setGalat(pesanGalat(error));
    setToast({ id: Date.now(), tone: 'success', text: 'Jadwal dihapus.' });
    setForm(null);
    muat();
  };

  const guruUntukKelas = (k: string) => {
    const ids = anggota.filter((a) => a.kelas_id === k).map((a) => a.user_id);
    return [...guru.filter((g) => ids.includes(g.id)), ...guru.filter((g) => !ids.includes(g.id))];
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Atur Jadwal" userRole="admin" userName={profil?.nama ?? '…'} />
      <StaffNav role="admin" />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1200px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2"><CalendarDays className="w-6 h-6 text-[#2E7BC4]" /> Jadwal Mengajar</h1>
            <p className="text-xs text-[#66748C] mt-1">Atur jadwal pelajaran tiap kelas dan guru pengampunya. Siswa dan guru melihat jadwal ini di menu Jadwal.</p>
          </div>
          <button type="button" onClick={bukaBaru} disabled={!kelas.length} className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)] disabled:opacity-50">
            <Plus className="w-4 h-4" /> Tambah Jadwal
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm" role="tablist" aria-label="Tampilan jadwal">
            {(['kelas', 'guru'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setPilih(m === 'kelas' ? kelas[0]?.id ?? '' : guru[0]?.id ?? '');
                }}
                className={`btn-press px-4 py-2 rounded-xl text-xs font-bold ${mode === m ? 'bg-[#2E7BC4] text-white' : 'text-[#66748C] hover:text-[#1B4E80]'}`}
              >
                Per {m === 'kelas' ? 'Kelas' : 'Guru'}
              </button>
            ))}
          </div>
          <select value={pilih} onChange={(e) => setPilih(e.target.value)} aria-label={mode === 'kelas' ? 'Pilih kelas' : 'Pilih guru'} className="px-3 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80] min-w-[180px]">
            {(mode === 'kelas' ? kelas.map((k) => ({ id: k.id, label: `Kelas ${k.nama}` })) : guru.map((g) => ({ id: g.id, label: g.full_name ?? '-' }))).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-[#94A3B8]">Klik kartu jadwal untuk mengubah atau menghapus.</span>
        </div>

        <section className="glass-card p-4 sm:p-5 anim-rise">
          {memuat ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : !kelas.length ? (
            <p className="text-sm text-[#66748C] text-center py-8">Buat kelas terlebih dahulu di menu Kelas.</p>
          ) : (
            <JadwalMingguan entri={entri} tampil={mode === 'kelas' ? 'kelas' : 'guru'} onPilih={bukaUbah} kosong="Belum ada jadwal. Klik “Tambah Jadwal”." />
          )}
        </section>
      </div>

      <Modal
        open={form !== null}
        busy={sibuk}
        onClose={() => setForm(null)}
        title={form?.id ? 'Ubah Jadwal' : 'Tambah Jadwal'}
        actions={
          <>
            {form?.id && (
              <button type="button" onClick={hapus} disabled={sibuk} className="btn-press px-4 py-2.5 rounded-xl text-[#C2412E] font-bold text-sm hover:bg-[#FDEAE7] sm:mr-auto flex items-center justify-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Hapus
              </button>
            )}
            <button type="button" onClick={() => setForm(null)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">Batal</button>
            <button type="button" onClick={simpan} disabled={sibuk} className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">{sibuk && <Spinner />} Simpan</button>
          </>
        }
      >
        {form && (
          <div className="space-y-3 text-[#1F2A37]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="j-kelas" className="block text-xs font-bold mb-1.5">Kelas</label>
                <select id="j-kelas" value={form.kelas_id} onChange={(e) => setForm({ ...form, kelas_id: e.target.value })} className={inputClass}>
                  {kelas.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="j-guru" className="block text-xs font-bold mb-1.5">Guru</label>
                <select id="j-guru" value={form.guru_id ?? ''} onChange={(e) => setForm({ ...form, guru_id: e.target.value || null })} className={inputClass}>
                  <option value="">— Belum ditentukan —</option>
                  {guruUntukKelas(form.kelas_id).map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="j-hari" className="block text-xs font-bold mb-1.5">Hari</label>
                <select id="j-hari" value={form.hari} onChange={(e) => setForm({ ...form, hari: Number(e.target.value) })} className={inputClass}>
                  {[1, 2, 3, 4, 5, 6, 7].map((h) => <option key={h} value={h}>{HARI[h]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="j-mulai" className="block text-xs font-bold mb-1.5">Mulai</label>
                <input id="j-mulai" type="time" value={form.jam_mulai} onChange={(e) => setForm({ ...form, jam_mulai: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="j-selesai" className="block text-xs font-bold mb-1.5">Selesai</label>
                <input id="j-selesai" type="time" value={form.jam_selesai} onChange={(e) => setForm({ ...form, jam_selesai: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="j-mapel" className="block text-xs font-bold mb-1.5">Mata pelajaran</label>
                <input id="j-mapel" value={form.mapel} maxLength={60} onChange={(e) => setForm({ ...form, mapel: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="j-ruang" className="block text-xs font-bold mb-1.5">Ruang <span className="font-normal text-[#94A3B8]">(opsional)</span></label>
                <input id="j-ruang" value={form.ruang ?? ''} maxLength={40} onChange={(e) => setForm({ ...form, ruang: e.target.value })} className={inputClass} />
              </div>
            </div>
            {galat && (
              <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake"><AlertTriangle className="w-4 h-4 shrink-0" /> {galat}</div>
            )}
          </div>
        )}
      </Modal>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
