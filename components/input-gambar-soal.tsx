'use client';

// Unggah gambar lampiran soal oleh guru: pilih / seret / tempel (Ctrl+V), auto-kompresi dengan progres,
// unggah berprogres ke bucket "gambar-soal", urutkan, pratinjau, dan hapus.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LightboxGambar } from '@/components/gambar-soal';
import { kompresBerkasOtomatis, type HasilKompresiBerkas } from '@/lib/lampiran/kompres';
import {
  ACCEPT_GAMBAR_SOAL,
  BUCKET_GAMBAR_SOAL,
  MAKS_UKURAN_GAMBAR_SOAL_MENTAH,
  MAKS_UKURAN_GAMBAR_SOAL_SIMPAN,
  formatUkuranByte,
  urlGambarSoal,
  validasiBerkasGambarSoal,
  type GambarSoal,
  type StatusKualitasKompresi,
} from '@/lib/lampiran/tipe';
import { buatPathGambarSoal, unggahLampiranXhr } from '@/lib/lampiran/unggah-xhr';
import { pesanGalat } from '@/lib/pengerjaan';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';

const MIME_BUCKET = new Set(['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/bmp']);

interface Antrean {
  idLokal: string;
  namaAsli: string;
  ukuranAsli: number;
  tahap: 'kompresi' | 'unggah' | 'gagal';
  persenKompresi: number;
  infoKompresi: string;
  persenUnggah: number;
  hasil: HasilKompresiBerkas | null;
  urlLokal: string | null;
  pesanGalat: string | null;
}

export interface InputGambarSoalHandle {
  /** Tambahkan berkas dari luar komponen (mis. tempel screenshot di kolom pertanyaan). */
  tambahBerkas: (files: File[]) => void;
}

function lencanaKualitas(status?: StatusKualitasKompresi, skor?: number) {
  if (status === 'peringatan_blur') {
    return { kelas: 'bg-[#FFF1DD] text-[#B45309] border-[#FBD38D]', ikon: AlertTriangle, label: `Agak blur (${skor ?? '-'}/100)`, panjang: `Perlu dicek (${skor ?? '-'}/100): gambar asli agak blur` };
  }
  if (status === 'lossless') {
    return { kelas: 'bg-[#E4F8EE] text-[#15885A] border-[#BBF7D0]', ikon: CheckCircle2, label: 'Utuh 100%', panjang: 'Kualitas utuh 100% (lossless)' };
  }
  if (status === 'sangat_baik') {
    return { kelas: 'bg-[#E4F8EE] text-[#15885A] border-[#BBF7D0]', ikon: CheckCircle2, label: `Tajam (${skor ?? '-'}/100)`, panjang: `Masih sangat tajam (${skor ?? '-'}/100)` };
  }
  return { kelas: 'bg-[#EAF6FF] text-[#1B4E80] border-[#BFDBFE]', ikon: CheckCircle2, label: `Baik (${skor ?? '-'}/100)`, panjang: `Kualitas baik & terbaca (${skor ?? '-'}/100)` };
}

const idAcak = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Ambil berkas gambar dari clipboard (screenshot). Teks biasa tidak diganggu. */
export function gambarDariClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const adaTeks = Array.from(data.types ?? []).some((t) => t === 'text/plain' || t === 'text/html');
  const berkas = Array.from(data.files ?? []).filter((f) => f.type.startsWith('image/'));
  // Salinan dari Word/web membawa teks + gambar render; hanya tangkap bila isinya murni gambar.
  return adaTeks ? [] : berkas;
}

export const InputGambarSoal = forwardRef<
  InputGambarSoalHandle,
  {
    supabase: SupabaseClient;
    uid: string | null;
    items: GambarSoal[];
    maks: number;
    onChange: (items: GambarSoal[]) => void;
    onSibukChange?: (sibuk: boolean) => void;
    /** Dipanggil setiap ada objek baru di Storage (untuk dibersihkan bila form dibatalkan). */
    onUnggahBaru?: (path: string) => void;
    /** 'penuh' untuk gambar pertanyaan; 'opsi' untuk 1 gambar kecil di baris opsi PG. */
    varian?: 'penuh' | 'opsi';
    /** Nama bagian untuk label aksesibilitas, mis. "soal" atau "opsi A". */
    label: string;
  }
>(function InputGambarSoal({ supabase, uid, items, maks, onChange, onSibukChange, onUnggahBaru, varian = 'penuh', label }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(new Map<string, AbortController>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [antrean, setAntrean] = useState<Antrean[]>([]);
  const antreanRef = useRef(antrean);
  antreanRef.current = antrean;
  const [galat, setGalat] = useState<string | null>(null);
  const [seret, setSeret] = useState(false);
  const [lihat, setLihat] = useState<number | null>(null);
  const [urlLokal, setUrlLokal] = useState<Record<string, string>>({});
  const urlLokalRef = useRef(urlLokal);
  urlLokalRef.current = urlLokal;

  const sibuk = antrean.some((a) => a.tahap !== 'gagal');
  useEffect(() => {
    onSibukChange?.(sibuk);
  }, [sibuk, onSibukChange]);

  // Batalkan unggahan & lepas ObjectURL saat komponen dilepas
  useEffect(() => {
    const aborts = abortRef.current;
    return () => {
      aborts.forEach((c) => c.abort());
      Object.values(urlLokalRef.current).forEach((u) => URL.revokeObjectURL(u));
      antreanRef.current.forEach((a) => a.urlLokal && URL.revokeObjectURL(a.urlLokal));
      onSibukChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perbarui = (idLokal: string, patch: Partial<Antrean>) =>
    setAntrean((prev) => prev.map((x) => (x.idLokal === idLokal ? { ...x, ...patch } : x)));

  const unggah = useCallback(
    async (idLokal: string, namaAsli: string, hasil: HasilKompresiBerkas, urlPratinjau: string | null) => {
      if (!uid) {
        perbarui(idLokal, { tahap: 'gagal', pesanGalat: 'Sesi belum siap. Tunggu sebentar lalu coba lagi.' });
        return;
      }
      const ctrl = new AbortController();
      abortRef.current.set(idLokal, ctrl);
      perbarui(idLokal, { tahap: 'unggah', persenUnggah: 1, pesanGalat: null });
      try {
        const { path } = await unggahLampiranXhr({
          supabase,
          bucket: BUCKET_GAMBAR_SOAL,
          path: buatPathGambarSoal(uid, hasil.namaSimpan),
          blob: hasil.blob,
          namaSimpan: hasil.namaSimpan,
          mime: hasil.mime,
          signal: ctrl.signal,
          onProgress: (persen) => perbarui(idLokal, { persenUnggah: persen }),
        });
        abortRef.current.delete(idLokal);
        onUnggahBaru?.(path);
        const baru: GambarSoal = {
          path,
          name: hasil.namaSimpan,
          original_name: namaAsli,
          mime: hasil.mime,
          original_size: hasil.ukuranAsli,
          compressed_size: hasil.ukuranHasil,
          hemat_persen: hasil.hematPersen,
          quality_score: hasil.skorKualitas,
          quality_status: hasil.statusKualitas,
        };
        if (urlPratinjau) setUrlLokal((u) => ({ ...u, [path]: urlPratinjau }));
        // Varian opsi: unggahan baru menggantikan gambar lama
        const berikut = varian === 'opsi' ? [baru] : [...itemsRef.current, baru].slice(0, maks);
        itemsRef.current = berikut;
        onChange(berikut);
        setAntrean((prev) => prev.filter((x) => x.idLokal !== idLokal));
      } catch (err: any) {
        abortRef.current.delete(idLokal);
        if (err?.name === 'AbortError') {
          if (urlPratinjau) URL.revokeObjectURL(urlPratinjau);
          setAntrean((prev) => prev.filter((x) => x.idLokal !== idLokal));
          return;
        }
        perbarui(idLokal, { tahap: 'gagal', pesanGalat: pesanGalat(err) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, uid, maks, varian, onChange, onUnggahBaru]
  );

  const proses = useCallback(
    async (file: File) => {
      const cek = validasiBerkasGambarSoal(file.name, file.type);
      if (!cek.ok) return setGalat(cek.pesan);
      if (file.size <= 0) return setGalat(`Berkas "${file.name}" kosong.`);
      if (file.size > MAKS_UKURAN_GAMBAR_SOAL_MENTAH) {
        return setGalat(`Ukuran "${file.name}" (${formatUkuranByte(file.size)}) melebihi batas 25 MB.`);
      }
      const idLokal = idAcak();
      const namaAsli = file.name || 'gambar-tempel.png';
      setAntrean((prev) => [
        ...prev,
        { idLokal, namaAsli, ukuranAsli: file.size, tahap: 'kompresi', persenKompresi: 2, infoKompresi: 'Menyiapkan kompresi...', persenUnggah: 0, hasil: null, urlLokal: null, pesanGalat: null },
      ]);
      let hasil: HasilKompresiBerkas;
      try {
        hasil = await kompresBerkasOtomatis(file, (persen, tahap) => perbarui(idLokal, { persenKompresi: persen, infoKompresi: tahap }));
      } catch {
        return perbarui(idLokal, { tahap: 'gagal', pesanGalat: `Gambar "${namaAsli}" tidak bisa dibaca atau rusak. Coba simpan ulang sebagai JPG/PNG.` });
      }
      if (!MIME_BUCKET.has(hasil.mime)) {
        return perbarui(idLokal, { tahap: 'gagal', persenKompresi: 100, pesanGalat: 'Format gambar hasil kompresi tidak didukung. Gunakan JPG, PNG, atau WEBP.' });
      }
      if (hasil.ukuranHasil > MAKS_UKURAN_GAMBAR_SOAL_SIMPAN) {
        return perbarui(idLokal, {
          tahap: 'gagal',
          persenKompresi: 100,
          pesanGalat: `Gambar masih ${formatUkuranByte(hasil.ukuranHasil)} setelah dikompres (maks 5 MB). Perkecil resolusinya lalu coba lagi.`,
        });
      }
      const urlPratinjau = URL.createObjectURL(hasil.blob);
      perbarui(idLokal, { persenKompresi: 100, hasil, urlLokal: urlPratinjau });
      await unggah(idLokal, namaAsli, hasil, urlPratinjau);
    },
    [unggah]
  );

  const terima = useCallback(
    (files: File[]) => {
      setGalat(null);
      const gambar = files.filter((f) => f && f.size >= 0);
      if (!gambar.length) return;
      if (varian === 'opsi') {
        if (antreanRef.current.some((a) => a.tahap !== 'gagal')) return setGalat('Tunggu unggahan sebelumnya selesai.');
        proses(gambar[0]);
        return;
      }
      const terpakai = itemsRef.current.length + antreanRef.current.filter((a) => a.tahap !== 'gagal').length;
      const sisa = Math.max(0, maks - terpakai);
      if (!sisa) return setGalat(`Maksimal ${maks} gambar untuk setiap soal.`);
      if (gambar.length > sisa) setGalat(`Hanya ${sisa} gambar lagi yang bisa ditambahkan (maks ${maks} per soal).`);
      gambar.slice(0, sisa).forEach((f) => proses(f));
    },
    [maks, proses, varian]
  );

  useImperativeHandle(ref, () => ({ tambahBerkas: terima }), [terima]);

  const batal = (a: Antrean) => {
    const c = abortRef.current.get(a.idLokal);
    if (c) return c.abort();
    if (a.urlLokal) URL.revokeObjectURL(a.urlLokal);
    setAntrean((prev) => prev.filter((x) => x.idLokal !== a.idLokal));
  };

  const hapus = (path: string) => {
    const berikut = itemsRef.current.filter((g) => g.path !== path);
    itemsRef.current = berikut;
    onChange(berikut);
    setLihat(null);
  };

  const geser = (i: number, arah: -1 | 1) => {
    const j = i + arah;
    if (j < 0 || j >= items.length) return;
    const salin = [...items];
    [salin[i], salin[j]] = [salin[j], salin[i]];
    itemsRef.current = salin;
    onChange(salin);
  };

  const src = (g: GambarSoal) => urlLokal[g.path] ?? urlGambarSoal(g.path);
  const terpakai = items.length + antrean.filter((a) => a.tahap !== 'gagal').length;
  const bisaTambah = varian === 'opsi' ? !sibuk : terpakai < maks;

  const inputBerkas = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_GAMBAR_SOAL}
      multiple={varian === 'penuh' && maks - terpakai > 1}
      className="hidden"
      aria-hidden="true"
      tabIndex={-1}
      onChange={(e) => {
        const list = Array.from(e.target.files ?? []);
        e.target.value = '';
        terima(list);
      }}
    />
  );

  const lightbox =
    lihat !== null && items[lihat] ? (
      <LightboxGambar
        daftar={items.map((g) => ({ url: src(g), nama: g.original_name || g.name }))}
        indeks={lihat}
        onIndeks={setLihat}
        onClose={() => setLihat(null)}
      />
    ) : null;

  const pesanGalatEl = galat && (
    <div role="alert" className="p-2 rounded-lg bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex items-start justify-between gap-2">
      <span className="flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {galat}</span>
      <button type="button" aria-label="Tutup pesan" onClick={() => setGalat(null)} className="hover:opacity-75"><X className="w-3.5 h-3.5" /></button>
    </div>
  );

  // ------------------------- Varian kecil untuk baris opsi PG -------------------------
  if (varian === 'opsi') {
    const g = items[0];
    const a = antrean[0];
    return (
      <div className="shrink-0 flex flex-col items-end gap-1" onPaste={(e) => {
        const f = gambarDariClipboard(e.clipboardData);
        if (f.length) {
          e.preventDefault();
          terima(f);
        }
      }}>
        {inputBerkas}
        {a ? (
          <div className="w-40 rounded-lg border border-[#DCEAF7] bg-white p-1.5 space-y-1" aria-live="polite">
            <div className="flex items-center justify-between gap-1 text-[11px] font-bold">
              <span className={a.tahap === 'gagal' ? 'text-[#C2412E]' : a.tahap === 'unggah' ? 'text-[#15885A]' : 'text-[#1B4E80]'}>
                {a.tahap === 'gagal' ? 'Gagal' : a.tahap === 'unggah' ? `Unggah ${a.persenUnggah}%` : `Kompres ${a.persenKompresi}%`}
              </span>
              {a.tahap === 'gagal' && a.hasil ? (
                <button type="button" aria-label={`Coba unggah ulang gambar ${label}`} onClick={() => unggah(a.idLokal, a.namaAsli, a.hasil!, a.urlLokal)} className="text-[#2E7BC4]"><RefreshCw className="w-3.5 h-3.5" /></button>
              ) : null}
              <button type="button" aria-label={`Batalkan gambar ${label}`} onClick={() => batal(a)} className="text-[#C2412E]"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="h-1 rounded-full bg-[#E6EEF7] overflow-hidden">
              <div className={`h-full rounded-full ${a.tahap === 'unggah' ? 'bg-[#22B573]' : 'bg-[#2E7BC4]'}`} style={{ width: `${a.tahap === 'unggah' ? a.persenUnggah : a.persenKompresi}%` }} />
            </div>
            {a.hasil && a.tahap !== 'gagal' && (
              <p className="text-[10px] text-[#66748C] tabular truncate">
                {formatUkuranByte(a.ukuranAsli)} → {formatUkuranByte(a.hasil.ukuranHasil)}
              </p>
            )}
            {a.tahap === 'gagal' && <p className="text-[10px] text-[#991B1B] leading-snug">{a.pesanGalat}</p>}
          </div>
        ) : g ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setLihat(0)} aria-label={`Perbesar gambar ${label}`} className="relative rounded-lg border border-[#DCEAF7] bg-white overflow-hidden hover:border-[#8BBCE8]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(g)} alt={`Gambar ${label}`} className="h-12 w-auto max-w-[96px] object-contain" />
            </button>
            <div className="flex flex-col gap-0.5">
              <button type="button" aria-label={`Ganti gambar ${label}`} title="Ganti gambar" onClick={() => inputRef.current?.click()} className="w-7 h-7 rounded-md flex items-center justify-center text-[#1B4E80] hover:bg-[#EAF6FF]"><RefreshCw className="w-3.5 h-3.5" /></button>
              <button type="button" aria-label={`Hapus gambar ${label}`} title="Hapus gambar" onClick={() => hapus(g.path)} className="w-7 h-7 rounded-md flex items-center justify-center text-[#C2412E] hover:bg-[#FDEAE7]"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label={`Tambah gambar untuk ${label}`}
            title="Tambah gambar (atau tempel dengan Ctrl+V)"
            className="btn-press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#2E7BC4] border border-dashed border-[#BFDBFE] hover:bg-[#EAF6FF]"
          >
            <ImagePlus className="w-3.5 h-3.5" /> Gambar
          </button>
        )}
        {galat && <p role="alert" className="text-[10px] font-semibold text-[#991B1B] max-w-[180px] text-right">{galat}</p>}
        {lightbox}
      </div>
    );
  }

  // ------------------------- Varian penuh untuk gambar pertanyaan -------------------------
  return (
    <div className="space-y-2.5">
      {inputBerkas}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold flex items-center gap-1.5">
          <ImagePlus className="w-4 h-4 text-[#2E7BC4]" /> Gambar {label} <span className="font-normal text-[#94A3B8]">(opsional)</span>
        </span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-[#DCEAF7] text-[#4B5A70] tabular">{items.length}/{maks}</span>
      </div>

      {bisaTambah && (
        <div
          tabIndex={0}
          role="button"
          aria-label={`Tambah gambar ${label}: pilih, seret, atau tempel`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onPaste={(e) => {
            const f = gambarDariClipboard(e.clipboardData);
            if (f.length) {
              e.preventDefault();
              terima(f);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setSeret(true);
          }}
          onDragLeave={() => setSeret(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSeret(false);
            terima(Array.from(e.dataTransfer.files ?? []));
          }}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2E7BC4]/20 ${
            seret ? 'border-[#2E7BC4] bg-[#EAF6FF]' : 'border-[#CFE2F6] bg-white/80 hover:border-[#93C5FD]'
          }`}
        >
          <p className="text-xs text-[#66748C] leading-relaxed">
            Seret gambar ke sini, klik untuk memilih, atau tempel screenshot dengan <kbd className="px-1 py-0.5 rounded border border-[#DCEAF7] bg-[#F8FBFF] text-[10px] font-bold">Ctrl+V</kbd>. Gambar otomatis dikompres tanpa mengurangi ketajaman.
          </p>
          <span className="btn-press shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#2E7BC4] text-[#1B4E80] text-xs font-bold">
            <Upload className="w-3.5 h-3.5 text-[#2E7BC4]" /> Pilih Gambar
          </span>
        </div>
      )}

      {pesanGalatEl}

      {antrean.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {antrean.map((a) => {
            const info = a.hasil ? lencanaKualitas(a.hasil.statusKualitas, a.hasil.skorKualitas) : null;
            return (
              <div key={a.idLokal} className="rounded-xl bg-white border border-[#DCEAF7] p-3 space-y-2 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-[#1F2A37] truncate">{a.namaAsli}</div>
                    <div className="text-xs text-[#66748C] mt-0.5 flex items-center gap-1.5 flex-wrap tabular">
                      <span>Awal {formatUkuranByte(a.ukuranAsli)}</span>
                      {a.hasil && (
                        <>
                          <ArrowRight className="w-3 h-3 text-[#2E7BC4]" />
                          <strong className="text-[#1B4E80]">Sesudah {formatUkuranByte(a.hasil.ukuranHasil)}</strong>
                          {a.hasil.hematPersen > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[#E4F8EE] text-[#15885A] font-extrabold">Hemat {String(a.hasil.hematPersen).replace('.', ',')}%</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => batal(a)} className="btn-press px-2.5 py-1 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7] shrink-0">
                    {a.tahap === 'gagal' ? 'Buang' : 'Batalkan'}
                  </button>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#1B4E80] flex items-center gap-1"><Sparkles className="w-3 h-3 text-[#2E7BC4]" /> {a.hasil ? 'Kompresi selesai' : a.infoKompresi}</span>
                    <span className="text-[#2E7BC4] tabular">{a.persenKompresi}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#E6EEF7] overflow-hidden">
                    <div className="h-full rounded-full bg-[#2E7BC4] transition-[width] duration-200" style={{ width: `${a.persenKompresi}%` }} />
                  </div>
                </div>
                {info && a.hasil && (
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${info.kelas}`}><info.ikon className="w-3 h-3" /> {info.panjang}</span>
                    <span className="text-[#66748C]">{a.hasil.catatanKualitas}</span>
                  </div>
                )}
                {(a.tahap === 'unggah' || a.persenUnggah > 0) && (
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-[#15885A]">Mengunggah...</span>
                      <span className="text-[#15885A] tabular">{a.persenUnggah}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#E4F8EE] overflow-hidden">
                      <div className="h-full rounded-full bg-[#22B573] transition-[width] duration-150" style={{ width: `${a.persenUnggah}%` }} />
                    </div>
                  </div>
                )}
                {a.tahap === 'gagal' && (
                  <div className="p-2 rounded-lg bg-[#FDEAE7] border border-[#FECACA] flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#991B1B]">{a.pesanGalat || 'Gagal memproses gambar.'}</span>
                    {a.hasil && (
                      <button type="button" onClick={() => unggah(a.idLokal, a.namaAsli, a.hasil!, a.urlLokal)} className="btn-press px-3 py-1 rounded-lg bg-[#2E7BC4] text-white text-xs font-bold inline-flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Coba Lagi
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label={`Gambar ${label} yang sudah diunggah`}>
          {items.map((g, i) => {
            const info = lencanaKualitas(g.quality_status, g.quality_score);
            return (
              <li key={g.path} className="rounded-xl bg-white border border-[#DCEAF7] overflow-hidden shadow-sm flex flex-col">
                <button type="button" onClick={() => setLihat(i)} aria-label={`Perbesar gambar ${i + 1}`} className="group relative bg-[#F8FBFF] h-28 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src(g)} alt={`Gambar ${label} ${i + 1}`} className="max-h-full max-w-full object-contain" />
                  <span className="absolute left-1.5 top-1.5 w-6 h-6 rounded-md bg-[#0E2A48]/75 text-white text-[11px] font-extrabold flex items-center justify-center tabular">{i + 1}</span>
                  <span className="absolute right-1.5 bottom-1.5 w-7 h-7 rounded-lg bg-[#0E2A48]/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="w-4 h-4" /></span>
                </button>
                <div className="p-2 space-y-1.5 flex-1 flex flex-col">
                  <p className="text-[11px] font-bold text-[#1F2A37] truncate" title={g.original_name || g.name}>{g.original_name || g.name}</p>
                  {g.compressed_size ? (
                    <p className="text-[11px] text-[#66748C] tabular">
                      {formatUkuranByte(g.compressed_size)}
                      {g.hemat_persen ? <span className="text-[#15885A] font-bold"> · hemat {String(g.hemat_persen).replace('.', ',')}%</span> : null}
                    </p>
                  ) : null}
                  {g.quality_status && (
                    <span className={`self-start inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${info.kelas}`} title={info.panjang}>
                      <info.ikon className="w-3 h-3" /> {info.label}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-1 pt-1 mt-auto border-t border-[#EEF4FA]">
                    <span className="flex">
                      <button type="button" aria-label={`Geser gambar ${i + 1} ke kiri`} disabled={i === 0} onClick={() => geser(i, -1)} className="w-7 h-7 rounded-md flex items-center justify-center text-[#1B4E80] hover:bg-[#EAF6FF] disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                      <button type="button" aria-label={`Geser gambar ${i + 1} ke kanan`} disabled={i === items.length - 1} onClick={() => geser(i, 1)} className="w-7 h-7 rounded-md flex items-center justify-center text-[#1B4E80] hover:bg-[#EAF6FF] disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                    </span>
                    <button type="button" aria-label={`Hapus gambar ${i + 1}`} onClick={() => hapus(g.path)} className="w-7 h-7 rounded-md flex items-center justify-center text-[#C2412E] hover:bg-[#FDEAE7]"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {lightbox}
    </div>
  );
});
