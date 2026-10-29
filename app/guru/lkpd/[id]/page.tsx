'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { FormSoal, type AwalSoal, type MateriRingkas } from '@/components/form-soal';
import { PengantarLkpd, KepalaTahap } from '@/components/lkpd-pengantar';
import { UUID_RE } from '@/lib/akses';
import { OPSI, bobotSoal, pesanGalat, tahapanDari, teksOpsi, type Soal, type TahapLkpd } from '@/lib/pengerjaan';
import { labelFormatFile } from '@/lib/lampiran/tipe';
import { useProfil } from '@/lib/use-profil';
import { ArrowLeft, Save, Plus, Trash2, ChevronUp, ChevronDown, PencilLine, Eye, PencilRuler, AlertTriangle, Layers, Sparkles, Paperclip } from 'lucide-react';

interface Meta {
  judul: string;
  tujuan: string;
  petunjuk: string;
  tahapan: TahapLkpd[];
}

const PETUNJUK_BAWAAN = 'Bacalah setiap tahap secara berurutan.\nKerjakan secara mandiri dan tuliskan langkah-langkahmu.\nPeriksa kembali jawabanmu sebelum mengumpulkan.';
const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 transition-all';

export default function SusunLkpdPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const profil = useProfil();
  const valid = UUID_RE.test(params.id);
  const [materi, setMateri] = useState<MateriRingkas[]>([]);
  const [bab, setBab] = useState<MateriRingkas | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [awalMeta, setAwalMeta] = useState('');
  const [soal, setSoal] = useState<Soal[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [mode, setMode] = useState<'susun' | 'pratinjau'>('susun');
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [awalSoal, setAwalSoal] = useState<AwalSoal | null>(null);
  const [hapus, setHapus] = useState<Soal | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const muatSoal = useCallback(async () => {
    const { data } = await supabase.rpc('soal_dengan_kunci', { p_jenis: 'lkpd', p_id_materi: params.id });
    setSoal((data ?? []) as Soal[]);
  }, [supabase, params.id]);

  useEffect(() => {
    if (!valid) return setMemuat(false);
    (async () => {
      const [m, l] = await Promise.all([
        supabase.from('materi').select('id, chapter_number, title').order('chapter_number'),
        supabase.from('lkpd').select('judul, tujuan, petunjuk, tahapan').eq('id_materi', params.id).maybeSingle(),
      ]);
      const daftar = (m.data ?? []) as MateriRingkas[];
      const b = daftar.find((x) => x.id === params.id) ?? null;
      setMateri(daftar);
      setBab(b);
      const awal: Meta = {
        judul: l.data?.judul ?? (b ? `LKPD Bab ${b.chapter_number} — ${b.title}` : 'LKPD'),
        tujuan: l.data?.tujuan ?? '',
        petunjuk: l.data?.petunjuk ?? PETUNJUK_BAWAAN,
        tahapan: tahapanDari(l.data?.tahapan),
      };
      setMeta(awal);
      setAwalMeta(l.data ? JSON.stringify(awal) : '');
      await muatSoal();
      setMemuat(false);
    })();
  }, [supabase, params.id, valid, muatSoal]);

  const berubah = !!meta && JSON.stringify(meta) !== awalMeta;
  useEffect(() => {
    if (!berubah) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [berubah]);

  const soalBab = useMemo(() => soal.filter((q) => q.id_materi === params.id), [soal, params.id]);
  const soalUmum = useMemo(() => soal.filter((q) => !q.id_materi), [soal]);
  const tanpaTahap = soalBab.filter((q) => !meta?.tahapan.some((t) => t.kunci === q.tahap));
  const totalBobot = soal.reduce((s, q) => s + bobotSoal(q), 0);

  const ubahTahap = (i: number, patch: Partial<TahapLkpd>) => meta && setMeta({ ...meta, tahapan: meta.tahapan.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const geser = (i: number, arah: -1 | 1) => {
    if (!meta) return;
    const t = [...meta.tahapan];
    const j = i + arah;
    if (j < 0 || j >= t.length) return;
    [t[i], t[j]] = [t[j], t[i]];
    setMeta({ ...meta, tahapan: t });
  };
  const hapusTahap = (i: number) => {
    if (!meta) return;
    const k = meta.tahapan[i].kunci;
    if (soalBab.some((q) => q.tahap === k)) return setToast({ id: Date.now(), tone: 'error', text: 'Pindahkan atau hapus dulu soal di tahap ini.' });
    setMeta({ ...meta, tahapan: meta.tahapan.filter((_, j) => j !== i) });
  };

  const simpanMeta = async () => {
    if (!meta) return;
    setGalat(null);
    if (!meta.judul.trim()) return setGalat('Judul LKPD belum diisi.');
    if (!meta.tahapan.length) return setGalat('Minimal ada satu tahap kegiatan.');
    if (meta.tahapan.some((t) => !t.judul.trim())) return setGalat('Setiap tahap perlu judul.');
    setMenyimpan(true);
    const muatan = {
      id_materi: params.id,
      judul: meta.judul.trim(),
      tujuan: meta.tujuan.trim() || null,
      petunjuk: meta.petunjuk.trim() || null,
      tahapan: meta.tahapan.map((t) => ({ kunci: t.kunci, judul: t.judul.trim(), instruksi: t.instruksi.trim() })),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('lkpd').upsert(muatan, { onConflict: 'id_materi' });
    setMenyimpan(false);
    if (error) return setGalat(pesanGalat(error));
    setAwalMeta(JSON.stringify(meta));
    setToast({ id: Date.now(), tone: 'success', text: 'LKPD tersimpan dan langsung dipakai siswa.' });
  };

  const hapusSoal = async () => {
    if (!hapus) return;
    const { error } = await supabase.rpc('hapus_soal', { p_id: hapus.id });
    setHapus(null);
    if (error) return setToast({ id: Date.now(), tone: 'error', text: pesanGalat(error) });
    setToast({ id: Date.now(), tone: 'success', text: 'Soal dihapus.' });
    muatSoal();
  };

  const tambahSoal = (tahap: string) => {
    const maks = soalBab.reduce((m, q) => Math.max(m, q.urutan ?? 0), 0);
    setAwalSoal({ category: 'lkpd', id_materi: params.id, tahap: tahap || null, tipe: 'essay', bobot: 20, urutan: maks + 1 });
  };

  const KartuSoal = ({ q, nomor }: { q: Soal; nomor: number }) => (
    <div className="p-3.5 rounded-xl bg-white border border-[#E6EEF7]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold">
          <span className="w-6 h-6 rounded-md bg-[#1B4E80] text-white flex items-center justify-center tabular">{nomor}</span>
          <span className="px-2 py-0.5 rounded-full bg-[#EAF6FF] text-[#1B4E80]">{q.tipe === 'pg' ? 'Pilihan Ganda' : 'Uraian'}</span>
          <span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#4B5A70]">Bobot {bobotSoal(q)}</span>
          {q.tipe !== 'pg' && (
            <>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${q.rubrik?.length || q.jawaban_ideal ? 'bg-[#F3E8FF] text-[#6D28D9]' : 'bg-[#F1F5F9] text-[#94A3B8]'}`}>
                <Sparkles className="w-3 h-3" /> {q.rubrik?.length ? `Rubrik ${q.rubrik.length}` : q.jawaban_ideal ? 'Jawaban ideal' : 'Tanpa rubrik'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EAF6FF] text-[#2E7BC4]" title="Format lampiran berkas/foto yang diterima">
                <Paperclip className="w-3 h-3" /> {labelFormatFile(q.format_file)}
              </span>
            </>
          )}
        </div>
        {mode === 'susun' && (
          <div className="flex shrink-0">
            <button type="button" aria-label="Ubah soal" onClick={() => setAwalSoal({ ...q, category: 'lkpd' })} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#1B4E80] hover:bg-[#EAF6FF]"><PencilLine className="w-4 h-4" /></button>
            <button type="button" aria-label="Hapus soal" onClick={() => setHapus(q)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#C2412E] hover:bg-[#FDEAE7]"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      <p className="text-sm text-[#1F2A37] mt-2 whitespace-pre-wrap">{q.pertanyaan}</p>
      {q.tipe === 'pg' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
          {OPSI.map((h) => teksOpsi(q, h) && (
            <span key={h} className={`text-xs px-2 py-1 rounded-md ${mode === 'susun' && (q.kunci_jawaban ?? '').toUpperCase() === h ? 'bg-[#E4F8EE] text-[#15885A] font-bold' : 'bg-[#F8FAFC] text-[#4B5A70]'}`}>{h}. {teksOpsi(q, h)}</span>
          ))}
        </div>
      )}
    </div>
  );

  let nomor = 0;
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Susun LKPD" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role === 'admin' ? 'admin' : profil ? 'guru' : null} />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[980px] w-full mx-auto">
        <Link href="/guru/lkpd" className="btn-press inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar LKPD
        </Link>

        {memuat ? (
          <Skeleton className="h-80 rounded-3xl" />
        ) : !bab || !meta ? (
          <div className="glass-card p-10 text-center"><p className="text-sm font-semibold text-[#1B4E80]">Materi tidak ditemukan.</p></div>
        ) : (
          <div className="space-y-5 pb-4">
            <div className="flex items-end justify-between gap-4 flex-wrap anim-rise">
              <div>
                <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full bg-[#FFF1DD] text-[#B45309] mb-2">Bab {bab.chapter_number}: {bab.title}</span>
                <h1 className="text-2xl font-extrabold text-[#1B4E80]">Susun LKPD</h1>
                <p className="text-xs text-[#66748C] mt-1">Total bobot soal yang dikerjakan siswa: <strong className={totalBobot === 100 ? 'text-[#15885A]' : 'text-[#B45309]'}>{totalBobot}</strong>{totalBobot !== 100 && ' (disarankan 100)'}</p>
              </div>
              <div className="grid grid-cols-2 gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm" role="tablist">
                {([['susun', 'Susun', PencilRuler], ['pratinjau', 'Pratinjau Siswa', Eye]] as const).map(([k, label, Icon]) => (
                  <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`btn-press flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${mode === k ? 'bg-[#2E7BC4] text-white' : 'text-[#66748C] hover:text-[#1B4E80]'}`}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'pratinjau' ? (
              <div className="space-y-5">
                <div className="glass-card p-6 md:p-8">
                  <span className="text-xs font-bold text-[#2E7BC4] uppercase tracking-wider">Lembar Kerja Peserta Didik (LKPD)</span>
                  <h2 className="text-2xl font-extrabold text-[#1B4E80] mt-1">Bab {bab.chapter_number}: {bab.title}</h2>
                  <PengantarLkpd judul={meta.judul} tujuan={meta.tujuan} petunjuk={meta.petunjuk} jumlahTahap={meta.tahapan.length} />
                </div>
                {soalUmum.length > 0 && (
                  <div className="glass-card p-6 space-y-3">
                    <h3 className="text-sm font-extrabold text-[#1B4E80]">Soal umum (semua bab)</h3>
                    {soalUmum.map((q) => <KartuSoal key={q.id} q={q} nomor={++nomor} />)}
                  </div>
                )}
                {meta.tahapan.map((t, i) => (
                  <div key={t.kunci} className="glass-card p-6 space-y-3">
                    <KepalaTahap nomor={i + 1} total={meta.tahapan.length} judul={t.judul} instruksi={t.instruksi} />
                    {soalBab.filter((q) => q.tahap === t.kunci).map((q) => <KartuSoal key={q.id} q={q} nomor={++nomor} />)}
                  </div>
                ))}
                {tanpaTahap.length > 0 && (
                  <div className="glass-card p-6 space-y-3">
                    <h3 className="text-sm font-extrabold text-[#1B4E80]">Soal lainnya</h3>
                    {tanpaTahap.map((q) => <KartuSoal key={q.id} q={q} nomor={++nomor} />)}
                  </div>
                )}
              </div>
            ) : (
              <>
                <section className="glass-card p-6 md:p-7 space-y-4">
                  <div>
                    <label htmlFor="l-judul" className="block text-xs font-bold text-[#1F2A37] mb-1.5">Judul LKPD</label>
                    <input id="l-judul" value={meta.judul} maxLength={150} onChange={(e) => setMeta({ ...meta, judul: e.target.value })} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="l-tujuan" className="block text-xs font-bold text-[#1F2A37] mb-1.5">Tujuan pembelajaran <span className="font-normal text-[#94A3B8]">(satu per baris)</span></label>
                      <textarea id="l-tujuan" rows={5} value={meta.tujuan} onChange={(e) => setMeta({ ...meta, tujuan: e.target.value })} placeholder="Siswa dapat menentukan mean dari sekumpulan data." className={`${inputClass} resize-y`} />
                    </div>
                    <div>
                      <label htmlFor="l-petunjuk" className="block text-xs font-bold text-[#1F2A37] mb-1.5">Petunjuk pengerjaan <span className="font-normal text-[#94A3B8]">(satu per baris)</span></label>
                      <textarea id="l-petunjuk" rows={5} value={meta.petunjuk} onChange={(e) => setMeta({ ...meta, petunjuk: e.target.value })} className={`${inputClass} resize-y`} />
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><Layers className="w-4 h-4" /> Tahapan kegiatan ({meta.tahapan.length})</h2>
                    <button
                      type="button"
                      onClick={() => setMeta({ ...meta, tahapan: [...meta.tahapan, { kunci: `tahap-${Date.now().toString(36)}`, judul: 'Tahap baru', instruksi: '' }] })}
                      className="text-xs font-bold text-[#2E7BC4] flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah tahap
                    </button>
                  </div>
                  <div className="space-y-3">
                    {meta.tahapan.map((t, i) => {
                      const isi = soalBab.filter((q) => q.tahap === t.kunci);
                      return (
                        <div key={t.kunci} className="glass-card p-5 anim-rise">
                          <div className="flex items-start gap-3">
                            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-white font-extrabold flex items-center justify-center shrink-0 tabular">{i + 1}</span>
                            <div className="flex-1 space-y-2 min-w-0">
                              <input aria-label={`Judul tahap ${i + 1}`} value={t.judul} maxLength={60} onChange={(e) => ubahTahap(i, { judul: e.target.value })} className={`${inputClass} font-bold`} />
                              <textarea aria-label={`Instruksi tahap ${i + 1}`} rows={2} value={t.instruksi} onChange={(e) => ubahTahap(i, { instruksi: e.target.value })} placeholder="Instruksi untuk siswa pada tahap ini" className={`${inputClass} resize-y text-[13px]`} />
                            </div>
                            <div className="flex flex-col">
                              <button type="button" aria-label="Naikkan tahap" disabled={i === 0} onClick={() => geser(i, -1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#66748C] hover:bg-[#EAF6FF] disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                              <button type="button" aria-label="Turunkan tahap" disabled={i === meta.tahapan.length - 1} onClick={() => geser(i, 1)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#66748C] hover:bg-[#EAF6FF] disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                              <button type="button" aria-label="Hapus tahap" onClick={() => hapusTahap(i)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#E3543F] hover:bg-[#FDEAE7]"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                          <div className="mt-3 pl-12 space-y-2">
                            {isi.map((q) => <KartuSoal key={q.id} q={q} nomor={q.urutan ?? 0} />)}
                            <button
                              type="button"
                              onClick={() => (berubah ? setToast({ id: Date.now(), tone: 'info', text: 'Simpan perubahan tahapan dulu, lalu tambahkan soal.' }) : tambahSoal(t.kunci))}
                              className="btn-press w-full py-2.5 rounded-xl border-2 border-dashed border-[#DCEAF7] text-xs font-bold text-[#2E7BC4] hover:border-[#2E7BC4] hover:bg-[#F4F9FF] flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" /> Tambah soal di tahap &ldquo;{t.judul}&rdquo;
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {(tanpaTahap.length > 0 || soalUmum.length > 0) && (
                  <section className="glass-card p-5 space-y-2">
                    <h2 className="text-sm font-extrabold text-[#1B4E80]">Soal di luar tahapan</h2>
                    <p className="text-[11px] text-[#66748C]">Soal umum (dari Bank Soal) tampil di awal; soal khusus bab tanpa tahap tampil di akhir LKPD. Ubah soal untuk memasukkannya ke tahap.</p>
                    {soalUmum.map((q) => <KartuSoal key={q.id} q={q} nomor={q.urutan ?? 0} />)}
                    {tanpaTahap.map((q) => <KartuSoal key={q.id} q={q} nomor={q.urutan ?? 0} />)}
                  </section>
                )}

                <div className="sticky bottom-3 z-20">
                  <div className="rounded-2xl bg-white/90 backdrop-blur-xl border border-white shadow-[0_10px_40px_rgba(27,78,128,0.18)] p-4 space-y-3">
                    {galat && <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake"><AlertTriangle className="w-4 h-4 shrink-0" /> {galat}</div>}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs text-[#66748C]">{berubah ? 'Judul, tujuan, petunjuk, atau tahapan belum disimpan.' : awalMeta ? 'Semua perubahan tersimpan.' : 'LKPD ini belum pernah disimpan.'}</span>
                      <button type="button" onClick={simpanMeta} disabled={menyimpan} className="btn-press px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2468A9] text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">
                        {menyimpan ? <Spinner /> : <Save className="w-4 h-4" />} Simpan LKPD
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <FormSoal
        awal={awalSoal}
        materi={materi}
        onClose={() => setAwalSoal(null)}
        onTersimpan={({ baru }) => {
          setAwalSoal(null);
          setToast({ id: Date.now(), tone: 'success', text: baru ? 'Soal ditambahkan ke tahap.' : 'Soal diperbarui.' });
          muatSoal();
        }}
      />
      <Modal
        open={hapus !== null}
        onClose={() => setHapus(null)}
        title="Hapus soal ini?"
        icon={<div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center"><Trash2 className="w-6 h-6 text-[#C2412E]" /></div>}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">Batal</button>
            <button type="button" onClick={hapusSoal} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm">Ya, Hapus</button>
          </>
        }
      >
        <p className="line-clamp-3">&ldquo;{hapus?.pertanyaan}&rdquo;</p>
      </Modal>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
