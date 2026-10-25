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
} from 'lucide-react';

interface DataMateri {
  bab: string;
  judul: string;
  subbab: string[];
  media: string;
  konten: string;
}

const KOSONG: DataMateri = { bab: '', judul: '', subbab: [''], media: '', konten: '' };

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 transition-all';

const sama = (a: DataMateri, b: DataMateri) => JSON.stringify(a) === JSON.stringify(b);

/** Form tambah / ubah materi untuk guru & admin. */
export function FormMateri({ idMateri }: { idMateri: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  const [profil, setProfil] = useState<{ nama: string; role: 'guru' | 'admin' } | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [tidakAda, setTidakAda] = useState(false);
  const [data, setData] = useState<DataMateri>(KOSONG);
  const [awal, setAwal] = useState<DataMateri>(KOSONG);
  const [kunciEditor, setKunciEditor] = useState(0);
  const [tab, setTab] = useState<'tulis' | 'pratinjau'>('tulis');
  const [menyimpan, setMenyimpan] = useState(false);
  const [mengunggahPdf, setMengunggahPdf] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [konfirmKeluar, setKonfirmKeluar] = useState(false);
  // Setelah materi baru tersimpan, form lanjut dalam mode ubah tanpa memuat ulang halaman
  const [idAktif, setIdAktif] = useState<string | null>(idMateri);

  const berubah = !sama(data, awal);
  const media = kenaliMedia(data.media);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const { data: p } = await supabase.from('users').select('full_name, role').eq('id', user.id).maybeSingle();
      setProfil({ nama: p?.full_name || user.email?.split('@')[0] || 'Guru', role: p?.role === 'admin' ? 'admin' : 'guru' });

      if (idMateri) {
        const { data: m, error } = await supabase.from('materi').select('*').eq('id', idMateri).maybeSingle();
        if (error || !m) {
          setTidakAda(true);
          setMemuat(false);
          return;
        }
        const isi: DataMateri = {
          bab: String(m.chapter_number ?? ''),
          judul: m.title ?? '',
          subbab: Array.isArray(m.subbab_json) && m.subbab_json.length ? m.subbab_json.map(String) : [''],
          media: m.youtube_url ?? '',
          konten: m.content_html ?? '',
        };
        setData(isi);
        setAwal(isi);
      } else {
        // Usulkan nomor bab berikutnya
        const { data: terakhir } = await supabase.from('materi').select('chapter_number').order('chapter_number', { ascending: false }).limit(1);
        const isi = { ...KOSONG, bab: String((terakhir?.[0]?.chapter_number ?? 0) + 1) };
        setData(isi);
        setAwal(isi);
      }
      setKunciEditor((k) => k + 1);
      setMemuat(false);
    })();
  }, [idMateri, router, supabase]);

  // Peringatan peramban bila menutup halaman dengan perubahan belum disimpan
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
  const ubahSubbab = (i: number, nilai: string) => ubah({ subbab: data.subbab.map((s, j) => (j === i ? nilai : s)) });
  const geserSubbab = (i: number, arah: -1 | 1) => {
    const baru = [...data.subbab];
    const j = i + arah;
    if (j < 0 || j >= baru.length) return;
    [baru[i], baru[j]] = [baru[j], baru[i]];
    ubah({ subbab: baru });
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
    const teksKonten = data.konten.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!teksKonten && !data.konten.includes('<img')) return setGalat('Isi materi masih kosong.');

    setMenyimpan(true);
    const { data: bentrok } = await supabase.from('materi').select('id').eq('chapter_number', bab).limit(2);
    if ((bentrok ?? []).some((m) => m.id !== idAktif)) {
      setMenyimpan(false);
      return setGalat(`Bab ${bab} sudah dipakai materi lain. Pilih nomor bab yang berbeda.`);
    }

    const payload = {
      chapter_number: bab,
      title: data.judul.trim(),
      subbab_json: data.subbab.map((s) => s.trim()).filter(Boolean),
      youtube_url: data.media.trim() || null,
      content_html: bersihkanHtmlKlien(data.konten),
    };
    const hasil = idAktif
      ? await supabase.from('materi').update(payload).eq('id', idAktif).select('id')
      : await supabase.from('materi').insert(payload).select('id');
    setMenyimpan(false);

    if (hasil.error) return setGalat(`Materi gagal disimpan. ${pesanGalat(hasil.error)}`);
    if (!hasil.data?.length) return setGalat('Materi gagal disimpan: akun Anda tidak memiliki izin.');

    const tersimpan = { ...data, judul: payload.title, subbab: payload.subbab_json.length ? payload.subbab_json : [''], konten: payload.content_html };
    setData(tersimpan);
    setAwal(tersimpan);
    setToast({ id: Date.now(), tone: 'success', text: idAktif ? 'Perubahan materi tersimpan.' : 'Materi baru tersimpan dan sudah tampil untuk siswa.' });
    if (!idAktif) {
      setIdAktif(hasil.data[0].id);
      window.history.replaceState(null, '', `/guru/materi/${hasil.data[0].id}`);
    }
  };

  const kembali = () => (berubah ? setKonfirmKeluar(true) : router.push('/guru/materi'));
  const kontenPratinjau = useMemo(() => (tab === 'pratinjau' ? bersihkanHtmlKlien(data.konten) : ''), [tab, data.konten]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={idAktif ? 'Ubah Materi' : 'Tambah Materi'} userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role ?? null} />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[980px] w-full mx-auto">
        <button
          type="button"
          onClick={kembali}
          className="btn-press inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] hover:bg-white shadow-sm mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar Materi
        </button>

        {memuat ? (
          <div className="glass-card p-6 md:p-8 space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : tidakAda ? (
          <div className="glass-card p-8 text-center anim-rise">
            <div className="text-5xl font-extrabold text-[#2E7BC4]/25 mb-3" aria-hidden="true">∅</div>
            <h1 className="text-xl font-extrabold text-[#1B4E80] mb-2">Materi tidak ditemukan</h1>
            <p className="text-sm text-[#66748C] mb-6">Materi ini mungkin sudah dihapus.</p>
            <Link href="/guru/materi" className="btn-press inline-block px-5 py-2.5 rounded-xl bg-[#2E7BC4] text-white font-bold text-sm">
              Lihat Daftar Materi
            </Link>
          </div>
        ) : (
          <div className="space-y-5 anim-rise">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-extrabold text-[#1B4E80]">{idAktif ? 'Ubah Materi' : 'Tambah Materi Baru'}</h1>
                <p className="text-xs text-[#66748C] mt-1">Materi yang disimpan langsung tampil di Daftar Modul siswa.</p>
              </div>
              <div className="grid grid-cols-2 gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm" role="tablist">
                {([['tulis', 'Tulis', PencilLine], ['pratinjau', 'Pratinjau', Eye]] as const).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`btn-press flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${tab === k ? 'bg-[#2E7BC4] text-white shadow-[0_4px_12px_rgba(46,123,196,0.3)]' : 'text-[#66748C] hover:text-[#1B4E80]'}`}
                  >
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

                <section className="glass-card p-6 md:p-7">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-[#1B4E80] flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4" /> Cakupan Topik (Subbab)
                    </h2>
                    <button type="button" onClick={() => ubah({ subbab: [...data.subbab, ''] })} className="btn-press text-xs font-bold text-[#2E7BC4] flex items-center gap-1 hover:text-[#1B4E80]">
                      <Plus className="w-3.5 h-3.5" /> Tambah subbab
                    </button>
                  </div>
                  <div className="space-y-2">
                    {data.subbab.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-[#2E7BC4] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0 tabular">{i + 1}</span>
                        <input
                          type="text"
                          value={s}
                          aria-label={`Subbab ${i + 1}`}
                          onChange={(e) => ubahSubbab(i, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              ubah({ subbab: [...data.subbab.slice(0, i + 1), '', ...data.subbab.slice(i + 1)] });
                            }
                          }}
                          placeholder="Contoh: Menghitung Nilai Rata-rata (Mean)"
                          className={inputClass}
                        />
                        <div className="flex">
                          <button type="button" aria-label="Naikkan" disabled={i === 0} onClick={() => geserSubbab(i, -1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#66748C] hover:bg-[#EAF6FF] disabled:opacity-30">
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button type="button" aria-label="Turunkan" disabled={i === data.subbab.length - 1} onClick={() => geserSubbab(i, 1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#66748C] hover:bg-[#EAF6FF] disabled:opacity-30">
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Hapus subbab"
                            onClick={() => ubah({ subbab: data.subbab.length > 1 ? data.subbab.filter((_, j) => j !== i) : [''] })}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#E3543F] hover:bg-[#FDEAE7]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#94A3B8] mt-2">Tekan Enter untuk menambah subbab di bawahnya. Subbab kosong tidak disimpan.</p>
                </section>

                <section className="glass-card p-6 md:p-7">
                  <h2 className="text-sm font-bold text-[#1B4E80] mb-1">Media Pendukung (opsional)</h2>
                  <p className="text-xs text-[#66748C] mb-3">Tempel link video YouTube, atau unggah/tempel link berkas PDF.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Youtube className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="url"
                        aria-label="Link media"
                        value={data.media}
                        onChange={(e) => ubah({ media: e.target.value })}
                        placeholder="https://www.youtube.com/watch?v=... atau https://.../berkas.pdf"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    <label className={`btn-press flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-xs font-bold text-[#1B4E80] cursor-pointer hover:border-[#2E7BC4] ${mengunggahPdf ? 'opacity-60 pointer-events-none' : ''}`}>
                      {mengunggahPdf ? <Spinner /> : <FileUp className="w-4 h-4" />}
                      {mengunggahPdf ? 'Mengunggah...' : 'Unggah PDF'}
                      <input type="file" accept="application/pdf" className="hidden" onChange={unggahPdf} />
                    </label>
                    {data.media && (
                      <button type="button" onClick={() => ubah({ media: '' })} className="btn-press px-3 py-2.5 rounded-xl text-xs font-bold text-[#E3543F] hover:bg-[#FDEAE7]">
                        Hapus
                      </button>
                    )}
                  </div>
                  {data.media.trim() && (
                    <p className={`text-xs font-semibold mt-2 flex items-center gap-1.5 ${media?.jenis === 'lain' || !media ? 'text-[#B45309]' : 'text-[#15885A]'}`}>
                      {media?.jenis === 'youtube' ? (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> Video YouTube terdeteksi.</>
                      ) : media?.jenis === 'pdf' ? (
                        <><CheckCircle2 className="w-3.5 h-3.5" /> Berkas PDF terdeteksi.</>
                      ) : (
                        <><AlertTriangle className="w-3.5 h-3.5" /> Link ini bukan video YouTube atau PDF, sehingga tidak akan ditampilkan ke siswa.</>
                      )}
                    </p>
                  )}
                </section>

                <section className="glass-card p-6 md:p-7">
                  <h2 className="text-sm font-bold text-[#1B4E80] mb-3">Isi Materi</h2>
                  <EditorHtml key={kunciEditor} initialValue={data.konten} onChange={(html) => ubah({ konten: html })} onUploadImage={unggahGambar} />
                  <p className="text-[11px] text-[#94A3B8] mt-2">Teks yang di-paste dari Word atau web otomatis dirapikan. Gambar maksimal 10 MB.</p>
                </section>
              </>
            ) : (
              <section className="glass-card p-6 md:p-8">
                <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full bg-[#D3ECFF] text-[#1B4E80] mb-3">
                  Materi Belajar Mandiri #{data.bab || '?'}
                </span>
                <h2 className="text-2xl md:text-[28px] font-extrabold text-[#1B4E80] mb-5 leading-tight">{data.judul || 'Judul materi'}</h2>
                {data.subbab.some((s) => s.trim()) && (
                  <ol className="grid sm:grid-cols-2 gap-2 mb-6">
                    {data.subbab.filter((s) => s.trim()).map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F4F9FF] border border-[#E3EEFA] text-[13px]">
                        <span className="w-5 h-5 rounded-md bg-[#2E7BC4] text-white text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-px">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                )}
                <MediaMateri url={data.media} judul={data.judul || 'Materi'} />
                <div className="materi-content text-[15px] leading-[1.85] text-[#1F2A37]" dangerouslySetInnerHTML={{ __html: kontenPratinjau || '<p><em>Isi materi masih kosong.</em></p>' }} />
              </section>
            )}

            {/* Bar simpan menempel */}
            <div className="sticky bottom-3 z-20">
              <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white shadow-[0_10px_40px_rgba(27,78,128,0.18)] p-4 space-y-3">
                {galat && (
                  <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {galat}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs text-[#66748C]">{berubah ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan tersimpan.'}</span>
                  <button
                    type="button"
                    onClick={simpan}
                    disabled={menyimpan || mengunggahPdf}
                    className="btn-press px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2468A9] hover:from-[#1B4E80] hover:to-[#1B4E80] text-white text-sm font-bold shadow-[0_8px_20px_rgba(46,123,196,0.3)] flex items-center gap-2 disabled:opacity-60"
                  >
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
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#FFF1DD] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#E37A12]" />
          </div>
        }
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setKonfirmKeluar(false)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF]">
              Lanjut Mengedit
            </button>
            <button type="button" onClick={() => router.push('/guru/materi')} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm">
              Buang Perubahan
            </button>
          </>
        }
      >
        Perubahan pada materi ini belum disimpan dan akan hilang jika Anda keluar.
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
