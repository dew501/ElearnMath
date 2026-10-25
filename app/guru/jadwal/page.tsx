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
import { jamPendek, labelHariRelatif, selisihHari, tanggalIni, tanggalPanjang } from '@/lib/waktu';
import { useProfil } from '@/lib/use-profil';
import { JENIS_AGENDA } from '@/components/agenda-jenis';
import { CalendarDays, Plus, PencilLine, Trash2, AlertTriangle, Inbox } from 'lucide-react';

interface Agenda {
  id: string;
  kelas_id: string;
  judul: string;
  deskripsi: string | null;
  tanggal: string;
  jam_mulai: string | null;
  jenis: string;
  id_materi: string | null;
  dibuat_oleh: string | null;
}
type Form = Omit<Agenda, 'id' | 'dibuat_oleh'> & { id: string | null };

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10';

export default function GuruJadwalPage() {
  const supabase = createClient();
  const profil = useProfil();
  const [jadwal, setJadwal] = useState<EntriJadwal[]>([]);
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [materi, setMateri] = useState<{ id: string; chapter_number: number | null; title: string | null }[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [hapus, setHapus] = useState<Agenda | null>(null);
  const [lihatLalu, setLihatLalu] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const kelasSaya = profil?.kelas ?? [];
  const namaKelas = useCallback((id: string) => kelasSaya.find((k) => k.id === id)?.nama ?? '-', [kelasSaya]);

  const muat = useCallback(async () => {
    if (!profil) return;
    const ids = profil.kelas.map((k) => k.id);
    const [j, a, m] = await Promise.all([
      supabase.from('jadwal').select('id, hari, jam_mulai, jam_selesai, mapel, ruang, kelas:kelas_id(nama)').eq('guru_id', profil.id),
      ids.length ? supabase.from('agenda').select('id, kelas_id, judul, deskripsi, tanggal, jam_mulai, jenis, id_materi, dibuat_oleh').in('kelas_id', ids).order('tanggal') : Promise.resolve({ data: [] }),
      supabase.from('materi').select('id, chapter_number, title').order('chapter_number'),
    ]);
    setJadwal(((j.data ?? []) as any[]).map((x) => ({ ...x, kelas_nama: x.kelas?.nama ?? null })));
    setAgenda((a.data ?? []) as Agenda[]);
    setMateri((m.data ?? []) as typeof materi);
    setMemuat(false);
  }, [supabase, profil]);

  useEffect(() => {
    muat();
  }, [muat]);

  const hariIniStr = tanggalIni();
  const mendatang = useMemo(() => agenda.filter((a) => a.tanggal >= hariIniStr), [agenda, hariIniStr]);
  const lalu = useMemo(() => agenda.filter((a) => a.tanggal < hariIniStr).reverse(), [agenda, hariIniStr]);

  const simpan = async () => {
    if (!form) return;
    setGalat(null);
    if (!form.kelas_id) return setGalat('Pilih kelas.');
    if (!form.judul.trim()) return setGalat('Judul agenda belum diisi.');
    if (!form.tanggal) return setGalat('Tanggal belum diisi.');
    const muatan = {
      kelas_id: form.kelas_id,
      judul: form.judul.trim(),
      deskripsi: form.deskripsi?.trim() || null,
      tanggal: form.tanggal,
      jam_mulai: form.jam_mulai || null,
      jenis: form.jenis,
      id_materi: form.id_materi || null,
    };
    setSibuk(true);
    const r = form.id ? await supabase.from('agenda').update(muatan).eq('id', form.id).select('id') : await supabase.from('agenda').insert(muatan).select('id');
    setSibuk(false);
    if (r.error) return setGalat(pesanGalat(r.error));
    if (!r.data?.length) return setGalat('Agenda tidak tersimpan: Anda hanya bisa mengubah agenda buatan sendiri.');
    setToast({ id: Date.now(), tone: 'success', text: form.id ? 'Agenda diperbarui.' : 'Agenda ditambahkan dan dikirim ke notifikasi siswa.' });
    setForm(null);
    muat();
  };

  const hapusAgenda = async () => {
    if (!hapus) return;
    const { data, error } = await supabase.from('agenda').delete().eq('id', hapus.id).select('id');
    setHapus(null);
    if (error || !data?.length) return setToast({ id: Date.now(), tone: 'error', text: error ? pesanGalat(error) : 'Hanya agenda buatan sendiri yang bisa dihapus.' });
    setToast({ id: Date.now(), tone: 'success', text: 'Agenda dihapus.' });
    muat();
  };

  const KartuAgenda = ({ a }: { a: Agenda }) => {
    const j = JENIS_AGENDA[a.jenis] ?? JENIS_AGENDA.lainnya;
    const Ikon = j.ikon;
    const dekat = selisihHari(a.tanggal) >= 0 && selisihHari(a.tanggal) <= 2;
    const milik = a.dibuat_oleh === profil?.id;
    return (
      <li className={`glass-card p-4 flex gap-4 items-start ${dekat ? 'ring-2 ring-[#FFB454]/50' : ''}`}>
        <span className="w-14 shrink-0 text-center rounded-2xl bg-white border border-[#DCEAF7] py-2">
          <span className="block text-[10px] font-bold text-[#2E7BC4] uppercase">{new Date(`${a.tanggal}T00:00:00+07:00`).toLocaleDateString('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' })}</span>
          <span className="block text-xl font-extrabold text-[#1B4E80] leading-none tabular">{Number(a.tanggal.slice(8, 10))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${j.warna}`}><Ikon className="w-3 h-3" /> {j.label}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D3ECFF] text-[#1B4E80]">Kelas {namaKelas(a.kelas_id)}</span>
            <span className={`text-[10px] font-semibold ${dekat ? 'text-[#B45309]' : 'text-[#94A3B8]'}`}>{labelHariRelatif(a.tanggal)}</span>
          </span>
          <span className="block text-sm font-extrabold text-[#1F2A37] mt-1">{a.judul}</span>
          {a.deskripsi && <span className="block text-xs text-[#4B5A70] mt-0.5 whitespace-pre-wrap">{a.deskripsi}</span>}
          <span className="block text-[11px] text-[#94A3B8] mt-1">
            {tanggalPanjang(a.tanggal)}{a.jam_mulai ? ` · ${jamPendek(a.jam_mulai)}` : ''}
            {a.id_materi && ` · Bab ${materi.find((m) => m.id === a.id_materi)?.chapter_number ?? '?'}`}
            {!milik && ' · dibuat guru lain'}
          </span>
        </span>
        {milik && (
          <span className="flex shrink-0">
            <button type="button" aria-label={`Ubah agenda ${a.judul}`} onClick={() => { setGalat(null); setForm({ ...a, jam_mulai: a.jam_mulai?.slice(0, 5) ?? '' }); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#1B4E80] hover:bg-[#EAF6FF]"><PencilLine className="w-4 h-4" /></button>
            <button type="button" aria-label={`Hapus agenda ${a.judul}`} onClick={() => setHapus(a)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#C2412E] hover:bg-[#FDEAE7]"><Trash2 className="w-4 h-4" /></button>
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Jadwal & Agenda" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil ? 'guru' : null} />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto space-y-6">
        <section className="anim-rise">
          <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2 mb-1"><CalendarDays className="w-6 h-6 text-[#2E7BC4]" /> Jadwal Mengajar Saya</h1>
          <p className="text-xs text-[#66748C] mb-4">Diatur oleh admin sekolah. Hubungi admin bila ada perubahan jam mengajar.</p>
          <div className="glass-card p-4 sm:p-5">
            {memuat ? <Skeleton className="h-40 rounded-2xl" /> : <JadwalMingguan entri={jadwal} tampil="guru" kosong="Belum ada jadwal mengajar untuk Anda." />}
          </div>
        </section>

        <section className="anim-rise" style={{ ['--i' as string]: 1 }}>
          <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-[#1B4E80]">Agenda Kelas</h2>
              <p className="text-xs text-[#66748C] mt-1">Kegiatan, tenggat tugas, dan ujian untuk siswa di kelas yang Anda ampu. Siswa menerimanya di lonceng notifikasi dan menu Jadwal.</p>
            </div>
            <button
              type="button"
              disabled={!kelasSaya.length}
              onClick={() => { setGalat(null); setForm({ id: null, kelas_id: kelasSaya[0]?.id ?? '', judul: '', deskripsi: '', tanggal: tanggalIni(new Date(Date.now() + 86400000)), jam_mulai: '', jenis: 'tenggat', id_materi: '' }); }}
              className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)] disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Tambah Agenda
            </button>
          </div>
          {!kelasSaya.length && profil && (
            <div className="mb-4 p-4 rounded-2xl bg-[#FFF8EC] border border-[#FBD38D] text-xs font-semibold text-[#92400E] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Anda belum mengampu kelas. Minta admin memasukkan Anda ke kelas agar bisa membuat agenda.
            </div>
          )}
          {memuat ? (
            <Skeleton className="h-32 rounded-3xl" />
          ) : mendatang.length === 0 ? (
            <div className="glass-card p-8 text-center"><Inbox className="w-10 h-10 text-[#BFDBFE] mx-auto mb-2" /><p className="text-sm font-semibold text-[#1B4E80]">Belum ada agenda mendatang.</p></div>
          ) : (
            <ul className="space-y-2">{mendatang.map((a) => <KartuAgenda key={a.id} a={a} />)}</ul>
          )}
          {lalu.length > 0 && (
            <div className="mt-4">
              <button type="button" onClick={() => setLihatLalu((v) => !v)} className="text-xs font-bold text-[#2E7BC4] hover:underline">{lihatLalu ? 'Sembunyikan' : `Lihat ${lalu.length} agenda yang sudah lewat`}</button>
              {lihatLalu && <ul className="space-y-2 mt-3 opacity-75">{lalu.map((a) => <KartuAgenda key={a.id} a={a} />)}</ul>}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={form !== null}
        busy={sibuk}
        lebar="lg"
        onClose={() => setForm(null)}
        title={form?.id ? 'Ubah Agenda' : 'Tambah Agenda'}
        actions={
          <>
            <button type="button" onClick={() => setForm(null)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">Batal</button>
            <button type="button" onClick={simpan} disabled={sibuk} className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">{sibuk && <Spinner />} Simpan</button>
          </>
        }
      >
        {form && (
          <div className="space-y-3 text-[#1F2A37]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="a-kelas" className="block text-xs font-bold mb-1.5">Kelas</label>
                <select id="a-kelas" value={form.kelas_id} onChange={(e) => setForm({ ...form, kelas_id: e.target.value })} className={inputClass}>
                  {kelasSaya.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="a-jenis" className="block text-xs font-bold mb-1.5">Jenis</label>
                <select id="a-jenis" value={form.jenis} onChange={(e) => setForm({ ...form, jenis: e.target.value })} className={inputClass}>
                  {Object.entries(JENIS_AGENDA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="a-judul" className="block text-xs font-bold mb-1.5">Judul</label>
              <input id="a-judul" data-autofocus value={form.judul} maxLength={150} onChange={(e) => setForm({ ...form, judul: e.target.value })} placeholder="Contoh: Tenggat LKPD Bab 2" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="a-tanggal" className="block text-xs font-bold mb-1.5">Tanggal</label>
                <input id="a-tanggal" type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="a-jam" className="block text-xs font-bold mb-1.5">Jam <span className="font-normal text-[#94A3B8]">(opsional)</span></label>
                <input id="a-jam" type="time" value={form.jam_mulai ?? ''} onChange={(e) => setForm({ ...form, jam_mulai: e.target.value })} className={inputClass} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="a-materi" className="block text-xs font-bold mb-1.5">Materi terkait</label>
                <select id="a-materi" value={form.id_materi ?? ''} onChange={(e) => setForm({ ...form, id_materi: e.target.value })} className={inputClass}>
                  <option value="">—</option>
                  {materi.map((m) => <option key={m.id} value={m.id}>Bab {m.chapter_number}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="a-desk" className="block text-xs font-bold mb-1.5">Keterangan <span className="font-normal text-[#94A3B8]">(opsional)</span></label>
              <textarea id="a-desk" rows={3} value={form.deskripsi ?? ''} maxLength={1000} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} className={`${inputClass} resize-y`} />
            </div>
            {galat && <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake"><AlertTriangle className="w-4 h-4 shrink-0" /> {galat}</div>}
          </div>
        )}
      </Modal>

      <Modal
        open={hapus !== null}
        onClose={() => setHapus(null)}
        title="Hapus agenda ini?"
        icon={<div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center"><Trash2 className="w-6 h-6 text-[#C2412E]" /></div>}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">Batal</button>
            <button type="button" onClick={hapusAgenda} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm">Ya, Hapus</button>
          </>
        }
      >
        &ldquo;{hapus?.judul}&rdquo; tidak akan tampil lagi di jadwal siswa.
      </Modal>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
