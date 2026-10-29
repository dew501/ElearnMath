'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { EditorHtml } from '@/components/editor-html';
import { MediaMateri } from '@/components/media-materi';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { pesanGalat } from '@/lib/pengerjaan';
import { kenaliMedia } from '@/lib/url';
import { unggahBerkas } from '@/lib/unggah';
import { bersihkanHtmlKlien } from '@/lib/sanitasi-klien';
import {
  ArrowLeft, Save, Plus, Trash2, ChevronUp, ChevronDown, Eye, PencilLine, FileUp, Youtube, AlertTriangle, BookOpen, CheckCircle2,
  ChevronRight, ChevronLeft, EyeOff, CalendarClock, School,
} from 'lucide-react';

interface Bagian {
  kunci: string;
  judul: string;
  konten: string;
}
interface DataMateri {
  bab: string;
  judul: string;
  bagian: Bagian[];
  media: string;
  terbit: boolean;
  tanggalBuka: string;
  kelasIds: string[];
}

const kunciBaru = () => Math.random().toString(36).slice(2, 9);
const KOSONG: DataMateri = { bab: '', judul: '', bagian: [{ kunci: 'b1', judul: '', konten: '' }], media: '', terbit: true, tanggalBuka: '', kelasIds: [] };

const inputClass =
  'input-field w-full px-3.5 py-2.5 rounded-xl text-sm text-[#1F2A37]';

const tanpaKunci = (d: DataMateri) => JSON.stringify({ ...d, bagian: d.bagian.map(({ judul, konten }) => ({ judul, konten })) });
const adaIsi = (html: string) => !!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || html.includes('<img');
/** ISO → nilai input datetime-local (zona perangkat). */
const keLokal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Bagian lama: subbab_json + content_html satu blok → isi lama masuk bagian pertama. */
function bagianDari(m: any): Bagian[] {
  if (Array.isArray(m.bagian_json) && m.bagian_json.length) {
    return m.bagian_json.map((b: any) => ({ kunci: kunciBaru(), judul: String(b?.judul ?? ''), konten: String(b?.konten ?? '') }));
  }
  const judul: string[] = Array.isArray(m.subbab_json) && m.subbab_json.length ? m.subbab_json.map(String) : [m.title ?? 'Materi'];
  return judul.map((j, i) => ({ kunci: kunciBaru(), judul: j, konten: i === 0 ? m.content_html ?? '' : '' }));
}

/** Form tambah / ubah materi untuk guru: isi per bagian (subbab), media, dan ketersediaan bagi siswa. */
export function FormMateri({ idMateri }: { idMateri: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  const [profil, setProfil] = useState<{ nama: string; role: 'guru' | 'admin' } | null>(null);
  const [kelas, setKelas] = useState<{ id: string; nama: string }[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [tidakAda, setTidakAda] = useState(false);
  const [data, setData] = useState<DataMateri>(KOSONG);
  const [awal, setAwal] = useState('');
  const [terbuka, setTerbuka] = useState<string>('b1');
  const [tab, setTab] = useState<'tulis' | 'pratinjau'>('tulis');
  const [lihatBagian, setLihatBagian] = useState(0);
  const [menyimpan, setMenyimpan] = useState(false);
  const [mengunggahPdf, setMengunggahPdf] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [konfirmKeluar, setKonfirmKeluar] = useState(false);
  const [idAktif, setIdAktif] = useState<string | null>(idMateri);

  const berubah = !memuat && tanpaKunci(data) !== awal;
  const media = kenaliMedia(data.media);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const [p, k] = await Promise.all([
        supabase.from('users').select('full_name, role').eq('id', user.id).maybeSingle(),
        supabase.from('kelas').select('id, nama').order('nama'),
      ]);
      setProfil({ nama: p.data?.full_name || user.email?.split('@')[0] || 'Guru', role: p.data?.role === 'admin' ? 'admin' : 'guru' });
      setKelas((k.data ?? []) as { id: string; nama: string }[]);

      let isi: DataMateri;
      if (idMateri) {
        const { data: m, error } = await supabase.from('materi').select('*').eq('id', idMateri).maybeSingle();
        if (error || !m) {
          setTidakAda(true);
          setMemuat(false);
          return;
        }
        isi = {
          bab: String(m.chapter_number ?? ''),
          judul: m.title ?? '',
          bagian: bagianDari(m),
          media: m.youtube_url ?? '',
          terbit: m.terbit !== false,
          tanggalBuka: keLokal(m.tanggal_buka ?? null),
          kelasIds: Array.isArray(m.kelas_ids) ? m.kelas_ids : [],
        };
      } else {
        const { data: terakhir } = await supabase.from('materi').select('chapter_number').order('chapter_number', { ascending: false }).limit(1);
        isi = { ...KOSONG, bab: String((terakhir?.[0]?.chapter_number ?? 0) + 1), terbit: false, bagian: [{ kunci: kunciBaru(), judul: '', konten: '' }] };
      }
      setData(isi);
      setAwal(tanpaKunci(isi));
      setTerbuka(isi.bagian[0]?.kunci ?? '');
      setMemuat(false);
    })();
  }, [idMateri, router, supabase]);

  useEffect(() => {
    if (!berubah) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [berubah]);

  const ubah = (patch: Partial<DataMateri>) => setData((d) => ({ ...d, ...patch }));
  const ubahBagian = (kunci: string, patch: Partial<Bagian>) => setData((d) => ({ ...d, bagian: d.bagian.map((b) => (b.kunci === kunci ? { ...b, ...patch } : b)) }));
  const geserBagian = (i: number, arah: -1 | 1) => {
    const baru = [...data.bagian];
    const j = i + arah;
    if (j < 0 || j >= baru.length) return;
    [baru[i], baru[j]] = [baru[j], baru[i]];
    ubah({ bagian: baru });
  };
  const tambahBagian = () => {
    const b = { kunci: kunciBaru(), judul: '', konten: '' };
    ubah({ bagian: [...data.bagian, b] });
    setTerbuka(b.kunci);
  };

  const unggahGambar = (file: File) => unggahBerkas(supabase, file, 'gambar');
  const unggahPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMengunggahPdf(true);
    const { url, error } = await unggahBerkas(supabase, file, 'pdf');
    setMengunggahPdf(false);
    if (error || !url) return setToast({ id: Date.now(), tone: 'error', text: error || 'PDF gagal diunggah.' });
    ubah({ media: url });
    setToast({ id: Date.now(), tone: 'success', text: 'PDF terunggah dan dipasang sebagai media pendukung.' });
  };

  const simpan = async () => {
    setGalat(null);
    const bab = Number(data.bab);
    if (!Number.isInteger(bab) || bab < 1) return setGalat('Nomor bab harus bilangan bulat mulai dari 1.');
    if (!data.judul.trim()) return setGalat('Judul materi belum diisi.');
    if (data.media.trim() && !media) return setGalat('Link media harus diawali http:// atau https://');
    const bagian = data.bagian.filter((b) => b.judul.trim() || adaIsi(b.konten));
    if (!bagian.some((b) => adaIsi(b.konten))) return setGalat('Isi materi masih kosong. Tulis isi minimal pada satu subbab.');
    const tanpaJudul = bagian.findIndex((b) => !b.judul.trim());
    if (tanpaJudul !== -1) return setGalat(`Subbab ${tanpaJudul + 1} belum diberi judul.`);

    setMenyimpan(true);
    const { data: bentrok } = await supabase.from('materi').select('id').eq('chapter_number', bab).limit(2);
    if ((bentrok ?? []).some((m) => m.id !== idAktif)) {
      setMenyimpan(false);
      return setGalat(`Bab ${bab} sudah dipakai materi lain. Pilih nomor bab yang berbeda.`);
    }
    const bersih = bagian.map((b) => ({ judul: b.judul.trim(), konten: bersihkanHtmlKlien(b.konten) }));
    const payload = {
      chapter_number: bab,
      title: data.judul.trim(),
      bagian_json: bersih,
      subbab_json: bersih.map((b) => b.judul),
      content_html: bersih.map((b) => `<h2>${b.judul.replace(/</g, '&lt;')}</h2>${b.konten}`).join(''),
      youtube_url: data.media.trim() || null,
      terbit: data.terbit,
      tanggal_buka: data.tanggalBuka ? new Date(data.tanggalBuka).toISOString() : null,
      kelas_ids: data.kelasIds.length ? data.kelasIds : null,
    };
    const hasil = idAktif ? await supabase.from('materi').update(payload).eq('id', idAktif).select('id') : await supabase.from('materi').insert(payload).select('id');
    setMenyimpan(false);

    if (hasil.error) return setGalat(`Materi gagal disimpan. ${pesanGalat(hasil.error)}`);
    if (!hasil.data?.length) return setGalat('Materi gagal disimpan: akun Anda tidak memiliki izin.');

    const tersimpan: DataMateri = { ...data, judul: payload.title, bagian: bersih.map((b, i) => ({ kunci: data.bagian[i]?.kunci ?? kunciBaru(), ...b })) };
    setData(tersimpan);
    setAwal(tanpaKunci(tersimpan));
    const status = !data.terbit ? 'disimpan sebagai draf (belum terlihat siswa)' : data.tanggalBuka && new Date(data.tanggalBuka) > new Date() ? 'dijadwalkan terbit' : 'terbit untuk siswa';
    setToast({ id: Date.now(), tone: 'success', text: `Materi ${status}.` });
    if (!idAktif) {
      setIdAktif(hasil.data[0].id);
      window.history.replaceState(null, '', `/guru/materi/${hasil.data[0].id}`);
    }
  };

  const kembali = () => (berubah ? setKonfirmKeluar(true) : router.push('/guru/materi'));
  const bagianTampil = useMemo(() => data.bagian.filter((b) => adaIsi(b.konten)), [data.bagian]);
  const idxPratinjau = Math.min(lihatBagian, Math.max(0, bagianTampil.length - 1));
  const kontenPratinjau = useMemo(
    () => (tab === 'pratinjau' && bagianTampil[idxPratinjau] ? bersihkanHtmlKlien(bagianTampil[idxPratinjau].konten) : ''),
    [tab, bagianTampil, idxPratinjau]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={idAktif ? 'Ubah Materi' : 'Tambah Materi'} userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role ?? null} />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[980px] w-full mx-auto">
        <button type="button" onClick={kembali} className="btn-press inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] hover:bg-white shadow-sm mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar Materi
        </button>

        {memuat ? (
          <div className="glass-card p-6 md:p-8 space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : tidakAda ? (
          <div className="glass-card p-8 text-center anim-rise">
            <div className="text-5xl font-extrabold text-[#2E7BC4]/25 mb-3" aria-hidden="true">∅</div>
            <h1 className="text-xl font-extrabold text-[#1B4E80] mb-2">Materi tidak ditemukan</h1>
            <p className="text-sm text-[#66748C] mb-6">Materi ini mungkin sudah dihapus.</p>
            <Link href="/guru/materi" className="btn-press inline-block px-5 py-2.5 rounded-xl bg-[#2E7BC4] text-white font-bold text-sm">Lihat Daftar Materi</Link>
          </div>
        ) : (
          <div className="space-y-5 anim-rise">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-extrabold text-[#1B4E80] tracking-[-0.015em]">{idAktif ? 'Ubah Materi' : 'Tambah Materi Baru'}</h1>
                <p className="text-xs text-[#66748C] mt-1">Atur isi per subbab dan kapan materi terlihat oleh siswa.</p>
              </div>
              <div className="surface-inset grid grid-cols-2 gap-1 p-1.5 rounded-2xl" role="tablist">
                {([['tulis', 'Tulis', PencilLine], ['pratinjau', 'Pratinjau', Eye]] as const).map(([k, label, Icon]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn-press flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${tab === k ? 'bg-[#2E7BC4] text-white shadow-[0_4px_12px_rgba(46,123,196,0.28)]' : 'text-[#66748C] hover:text-[#1B4E80] hover:bg-white/70'}`}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'tulis' ? (
              <>
                <section className="glass-card p-6 md:p-7 grid sm:grid-cols-[120px,1fr] gap-4">
                  <div>
                    <label htmlFor="bab" className="block text-xs font-bold text-[#1F2A37] mb-1.5">Nomor Bab</label>
                    <input id="bab" type="number" min={1} inputMode="numeric" value={data.bab} onChange={(e) => ubah({ bab: e.target.value })} className={`${inputClass} font-bold tabular`} />
                  </div>
                  <div>
                    <label htmlFor="judul" className="block text-xs font-bold text-[#1F2A37] mb-1.5">Judul Materi</label>
                    <input id="judul" type="text" value={data.judul} onChange={(e) => ubah({ judul: e.target.value })} placeholder="Contoh: Mengenal Statistika & Ukuran Pemusatan Data" className={inputClass} />
                  </div>
                </section>

                <section className="glass-card p-6 md:p-7" aria-labelledby="judul-ketersediaan">
                  <h2 id="judul-ketersediaan" className="text-sm font-bold text-[#1B4E80] mb-3">Ketersediaan untuk siswa</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="block text-xs font-bold text-[#1F2A37] mb-1.5">Status</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={data.terbit}
                        aria-label="Terbitkan untuk siswa"
                        onClick={() => ubah({ terbit: !data.terbit })}
                        className={`btn-press w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 text-sm font-bold ${data.terbit ? 'border-[#22B573] bg-[#F0FBF6] text-[#15885A]' : 'border-[#DCEAF7] bg-white text-[#66748C]'}`}
                      >
                        <span className={`relative w-10 h-6 rounded-full transition-colors duration-150 ${data.terbit ? 'bg-[#22B573]' : 'bg-[#CBD5E1]'}`}>
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150 ease-[var(--ease-out)] ${data.terbit ? 'translate-x-4' : 'translate-x-0'}`} />
                        </span>
                        {data.terbit ? <><Eye className="w-4 h-4" /> Terbit</> : <><EyeOff className="w-4 h-4" /> Draf</>}
                      </button>
                    </div>
                    <div>
                      <label htmlFor="tanggal-buka" className="text-xs font-bold text-[#1F2A37] mb-1.5 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Dibuka mulai <span className="font-normal text-[#94A3B8]">(opsional)</span></label>
                      <div className="flex gap-1.5">
                        <input id="tanggal-buka" type="datetime-local" value={data.tanggalBuka} onChange={(e) => ubah({ tanggalBuka: e.target.value })} className={inputClass} />
                        {data.tanggalBuka && <button type="button" onClick={() => ubah({ tanggalBuka: '' })} aria-label="Hapus tanggal buka" className="px-2 rounded-xl text-[#E3543F] hover:bg-[#FDEAE7]"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    <fieldset>
                      <legend className="text-xs font-bold text-[#1F2A37] mb-1.5 flex items-center gap-1"><School className="w-3.5 h-3.5" /> Kelas tujuan</legend>
                      <div className="flex flex-wrap gap-1.5">
                        {kelas.length === 0 && <span className="text-xs text-[#66748C]">Semua siswa</span>}
                        {kelas.map((k) => {
                          const dipilih = data.kelasIds.includes(k.id);
                          return (
                            <label key={k.id} className={`cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold ${dipilih ? 'border-[#2E7BC4] bg-[#EAF6FF] text-[#1B4E80]' : 'border-[#DCEAF7] text-[#66748C]'}`}>
                              <input type="checkbox" checked={dipilih} onChange={() => ubah({ kelasIds: dipilih ? data.kelasIds.filter((x) => x !== k.id) : [...data.kelasIds, k.id] })} className="w-3.5 h-3.5 accent-[#2E7BC4]" />
                              {k.nama}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  </div>
                  <p className="text-xs text-[#66748C] mt-3">
                    {!data.terbit
                      ? 'Draf: siswa belum bisa melihat materi ini.'
                      : `Terlihat oleh ${data.kelasIds.length ? `kelas ${kelas.filter((k) => data.kelasIds.includes(k.id)).map((k) => k.nama).join(', ')}` : 'semua kelas'}${data.tanggalBuka ? ` mulai ${new Date(data.tanggalBuka).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` : ' sekarang juga'}.`}
                  </p>
                </section>

                <section className="glass-card p-6 md:p-7">
                  <h2 className="text-sm font-bold text-[#1B4E80] mb-1">Media Pendukung (opsional)</h2>
                  <p className="text-xs text-[#66748C] mb-3">Tempel link video YouTube, atau unggah/tempel link berkas PDF. Media tampil di subbab pertama.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Youtube className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="url" aria-label="Link media" value={data.media} onChange={(e) => ubah({ media: e.target.value })} placeholder="https://www.youtube.com/watch?v=... atau https://.../berkas.pdf" className={`${inputClass} pl-10`} />
                    </div>
                    <label className={`btn-press flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-xs font-bold text-[#1B4E80] cursor-pointer hover:border-[#2E7BC4] ${mengunggahPdf ? 'opacity-60 pointer-events-none' : ''}`}>
                      {mengunggahPdf ? <Spinner /> : <FileUp className="w-4 h-4" />}
                      {mengunggahPdf ? 'Mengunggah...' : 'Unggah PDF'}
                      <input type="file" accept="application/pdf" className="hidden" onChange={unggahPdf} />
                    </label>
                    {data.media && <button type="button" onClick={() => ubah({ media: '' })} className="btn-press px-3 py-2.5 rounded-xl text-xs font-bold text-[#E3543F] hover:bg-[#FDEAE7]">Hapus</button>}
                  </div>
                  {data.media.trim() && (
                    <p className={`text-xs font-semibold mt-2 flex items-center gap-1.5 ${media?.jenis === 'lain' || !media ? 'text-[#B45309]' : 'text-[#15885A]'}`}>
                      {media?.jenis === 'youtube' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Video YouTube terdeteksi.</>
                        : media?.jenis === 'pdf' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Berkas PDF terdeteksi.</>
                        : <><AlertTriangle className="w-3.5 h-3.5" /> Link ini bukan video YouTube atau PDF, sehingga tidak akan ditampilkan ke siswa.</>}
                    </p>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#1B4E80] flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> Isi per Subbab ({data.bagian.length})</h2>
                    <button type="button" onClick={tambahBagian} className="btn-press text-xs font-bold text-[#2E7BC4] flex items-center gap-1 hover:text-[#1B4E80]"><Plus className="w-3.5 h-3.5" /> Tambah subbab</button>
                  </div>
                  {data.bagian.map((b, i) => {
                    const buka = terbuka === b.kunci;
                    return (
                      <div key={b.kunci} className={`glass-card overflow-hidden transition-shadow ${buka ? 'ring-2 ring-[#2E7BC4]/25' : ''}`}>
                        <div className="flex items-center gap-2 p-3 sm:p-4">
                          <span className="w-7 h-7 rounded-lg bg-[#2E7BC4] text-white text-xs font-extrabold flex items-center justify-center shrink-0 tabular">{i + 1}</span>
                          <input aria-label={`Subbab ${i + 1}`} value={b.judul} onChange={(e) => ubahBagian(b.kunci, { judul: e.target.value })} placeholder="Judul subbab, mis. Menghitung Mean" className={`${inputClass} font-semibold`} />
                          <div className="flex shrink-0">
                            <button type="button" aria-label="Naikkan" disabled={i === 0} onClick={() => geserBagian(i, -1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#66748C] hover:bg-[#EAF6FF] disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                            <button type="button" aria-label="Turunkan" disabled={i === data.bagian.length - 1} onClick={() => geserBagian(i, 1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#66748C] hover:bg-[#EAF6FF] disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                            <button type="button" aria-label="Hapus subbab" onClick={() => ubah({ bagian: data.bagian.length > 1 ? data.bagian.filter((x) => x.kunci !== b.kunci) : [{ kunci: kunciBaru(), judul: '', konten: '' }] })} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#E3543F] hover:bg-[#FDEAE7]"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <button type="button" onClick={() => setTerbuka(buka ? '' : b.kunci)} aria-expanded={buka} className="btn-press shrink-0 px-3 py-2 rounded-lg text-xs font-bold text-[#2E7BC4] hover:bg-[#EAF6FF]">
                            {buka ? 'Tutup' : adaIsi(b.konten) ? 'Ubah isi' : 'Tulis isi'}
                          </button>
                        </div>
                        {buka ? (
                          <div className="px-3 sm:px-4 pb-4">
                            <EditorHtml key={b.kunci} initialValue={b.konten} onChange={(html) => ubahBagian(b.kunci, { konten: html })} onUploadImage={unggahGambar} />
                            <p className="text-xs text-[#94A3B8] mt-2">Teks yang di-paste dari Word atau web otomatis dirapikan. Gambar maksimal 10 MB.</p>
                          </div>
                        ) : (
                          <p className="px-4 pb-3 -mt-1 text-xs text-[#94A3B8] truncate">{adaIsi(b.konten) ? b.konten.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 140) : 'Belum ada isi.'}</p>
                        )}
                      </div>
                    );
                  })}
                </section>
              </>
            ) : (
              <section className="glass-card p-6 md:p-8">
                <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-[#D3ECFF] text-[#1B4E80] mb-3">Materi Belajar Mandiri #{data.bab || '?'}</span>
                <h2 className="text-2xl md:text-[28px] font-extrabold text-[#1B4E80] mb-4 leading-tight">{data.judul || 'Judul materi'}</h2>
                {bagianTampil.length === 0 ? (
                  <p className="text-sm text-[#66748C] italic">Isi materi masih kosong.</p>
                ) : (
                  <>
                    <ol className="flex flex-wrap gap-2 mb-5" aria-label="Daftar subbab">
                      {bagianTampil.map((b, i) => (
                        <li key={b.kunci}>
                          <button type="button" onClick={() => setLihatBagian(i)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${i === idxPratinjau ? 'bg-[#2E7BC4] border-[#2E7BC4] text-white' : 'bg-white border-[#DCEAF7] text-[#1B4E80]'}`}>
                            {i + 1}. {b.judul || 'Tanpa judul'}
                          </button>
                        </li>
                      ))}
                    </ol>
                    {idxPratinjau === 0 && <MediaMateri url={data.media} judul={data.judul || 'Materi'} />}
                    <div className="materi-content text-[15px] leading-[1.85] text-[#1F2A37]" dangerouslySetInnerHTML={{ __html: kontenPratinjau }} />
                    <div className="mt-6 pt-4 border-t border-[#DCEAF7] flex justify-between gap-2">
                      <button type="button" disabled={idxPratinjau === 0} onClick={() => setLihatBagian(idxPratinjau - 1)} className="btn-press inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[#DCEAF7] text-xs font-bold text-[#1B4E80] disabled:opacity-30"><ChevronLeft className="w-4 h-4" /> Sebelumnya</button>
                      <button type="button" disabled={idxPratinjau >= bagianTampil.length - 1} onClick={() => setLihatBagian(idxPratinjau + 1)} className="btn-press inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#2E7BC4] text-white text-xs font-bold disabled:opacity-30">Berikutnya <ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </>
                )}
              </section>
            )}

            <div className="sticky bottom-3 z-20">
              <div className="rounded-2xl bg-white/92 backdrop-blur-xl border border-white/95 shadow-[0_1px_0_#fff_inset,0_0_0_1px_rgba(27,78,128,0.08),0_16px_36px_-8px_rgba(27,78,128,0.18)] p-4 space-y-3">
                {galat && (
                  <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake"><AlertTriangle className="w-4 h-4 shrink-0" /> {galat}</div>
                )}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-[#66748C]">{berubah ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan tersimpan.'}</span>
                  <button type="button" onClick={simpan} disabled={menyimpan || mengunggahPdf} className="btn-press px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2468A9] hover:from-[#1B4E80] hover:to-[#1B4E80] text-white text-sm font-bold shadow-[0_8px_20px_rgba(46,123,196,0.3)] flex items-center gap-2 disabled:opacity-60">
                    {menyimpan ? <Spinner /> : <Save className="w-4 h-4" />}
                    {menyimpan ? 'Menyimpan...' : 'Simpan Materi'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={konfirmKeluar}
        onClose={() => setKonfirmKeluar(false)}
        title="Perubahan belum disimpan"
        icon={<div className="w-12 h-12 rounded-2xl bg-[#FFF1DD] flex items-center justify-center"><AlertTriangle className="w-6 h-6 text-[#E37A12]" /></div>}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setKonfirmKeluar(false)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF]">Lanjut Mengedit</button>
            <button type="button" onClick={() => router.push('/guru/materi')} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm">Buang Perubahan</button>
          </>
        }
      >
        Perubahan pada materi ini belum disimpan dan akan hilang jika Anda keluar.
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
