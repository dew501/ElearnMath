'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KameraJawaban } from '@/components/kamera-jawaban';
import { Modal } from '@/components/ui/modal';
import {
  MAKS_BERKAS_PER_SOAL,
  MAKS_UKURAN_MENTAH_BYTE,
  apakahGambarDiizinkan,
  apakahPdfDiizinkan,
  atributAcceptFile,
  formatUkuranByte,
  labelFormatFile,
  validasiFormatBerkas,
  type HasilForensikAi,
  type LampiranJawaban,
  type StatusKualitasKompresi,
} from '@/lib/lampiran/tipe';
import { pindaiForensikBerkas } from '@/lib/lampiran/deteksi-ai';
import {
  bungkusGambarKePdf,
  kompresBerkasOtomatis,
  type HasilKompresiBerkas,
} from '@/lib/lampiran/kompres';
import {
  buatUrlLampiran,
  hapusLampiranStorage,
  unggahLampiranXhr,
} from '@/lib/lampiran/unggah-xhr';
import { pesanGalat, type JenisPengerjaan } from '@/lib/pengerjaan';
import {
  Camera,
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  Eye,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface AntreanProses {
  idLokal: string;
  namaAsli: string;
  ukuranAsli: number;
  sumber: 'camera' | 'upload';
  tahap: 'kompresi' | 'unggah' | 'gagal';
  persenKompresi: number;
  infoTahapKompresi: string;
  persenUnggah: number;
  hasilKompresi: HasilKompresiBerkas | null;
  hasilForensik: HasilForensikAi | null;
  urlSebelum: string | null;
  urlSesudah: string | null;
  pesanGalat: string | null;
  gantiPathLama?: string | null;
}

function lencanaKualitas(status: StatusKualitasKompresi, skor: number) {
  if (status === 'peringatan_blur') {
    return {
      kelas: 'bg-[#FFF1DD] text-[#B45309] border-[#FBD38D]',
      ikon: AlertTriangle,
      label: `Perlu Dicek (${skor}/100) — Agak Blur`,
    };
  }
  if (status === 'lossless') {
    return {
      kelas: 'bg-[#E4F8EE] text-[#15885A] border-[#BBF7D0]',
      ikon: CheckCircle2,
      label: 'Kualitas Utuh 100% (Lossless)',
    };
  }
  if (status === 'sangat_baik') {
    return {
      kelas: 'bg-[#E4F8EE] text-[#15885A] border-[#BBF7D0]',
      ikon: CheckCircle2,
      label: `Masih Sangat Bagus & Tajam (${skor}/100)`,
    };
  }
  return {
    kelas: 'bg-[#EAF6FF] text-[#1B4E80] border-[#BFDBFE]',
    ikon: CheckCircle2,
    label: `Kualitas Baik & Terbaca (${skor}/100)`,
  };
}

export function InputLampiranEssay({
  supabase,
  uid,
  jenis,
  idMateri,
  idSoal,
  nomorSoal,
  formatFile,
  lampiran,
  pathAwalLama,
  onChange,
  onSibukChange,
}: {
  supabase: SupabaseClient;
  uid: string;
  jenis: JenisPengerjaan;
  idMateri: string;
  idSoal: string;
  nomorSoal: number;
  formatFile?: string[] | null;
  lampiran: LampiranJawaban[];
  /** Path lampiran dari pengumpulan lama (saat pengerjaan ulang) agar tidak dihapus dari storage sebelum pengumpulan baru selesai. */
  pathAwalLama?: Set<string>;
  onChange: (daftarBaru: LampiranJawaban[]) => void;
  onSibukChange?: (sibuk: boolean) => void;
}) {
  const inputBerkasRef = useRef<HTMLInputElement | null>(null);
  const inputGantiRef = useRef<HTMLInputElement | null>(null);
  const abortMapRef = useRef<Map<string, AbortController>>(new Map());
  const lampiranRef = useRef<LampiranJawaban[]>(lampiran);
  lampiranRef.current = lampiran;

  const [antrean, setAntrean] = useState<AntreanProses[]>([]);
  const [bukaKamera, setBukaKamera] = useState(false);
  const [seretAktif, setSeretAktif] = useState(false);
  const [galatumum, setGalatUmum] = useState<string | null>(null);
  const [targetGantiPath, setTargetGantiPath] = useState<string | null>(null);

  // Cache URL lokal sesi ini (sebelum & sesudah kompresi) untuk perbandingan visual langsung
  const [pratinjauSesi, setPratinjauSesi] = useState<
    Record<string, { sebelum: string | null; sesudah: string | null }>
  >({});
  const [modalPratinjau, setModalPratinjau] = useState<{
    item: LampiranJawaban;
    urlSesudah: string | null;
    urlSebelum: string | null;
    tampilSebelum: boolean;
    memuatUrl: boolean;
  } | null>(null);

  const sedangProses = antrean.some((a) => a.tahap === 'kompresi' || a.tahap === 'unggah');
  useEffect(() => {
    onSibukChange?.(sedangProses);
  }, [sedangProses, onSibukChange]);

  // Bersihkan ObjectURL saat komponen dilepas
  const pratinjauSesiRef = useRef(pratinjauSesi);
  pratinjauSesiRef.current = pratinjauSesi;
  useEffect(() => {
    const aborts = abortMapRef.current;
    return () => {
      aborts.forEach((c) => c.abort());
      Object.values(pratinjauSesiRef.current).forEach((u) => {
        if (u.sebelum) URL.revokeObjectURL(u.sebelum);
        if (u.sesudah) URL.revokeObjectURL(u.sesudah);
      });
    };
  }, []);

  const izinkanGambar = apakahGambarDiizinkan(formatFile);
  const izinkanPdf = apakahPdfDiizinkan(formatFile);
  const bisaPakaiKamera = izinkanGambar || izinkanPdf;
  const kemasKameraKePdf = !izinkanGambar && izinkanPdf;
  const acceptAttr = atributAcceptFile(formatFile);

  const jumlahSlotTerpakai =
    lampiran.length + antrean.filter((a) => !a.gantiPathLama).length;
  const sisaSlot = Math.max(0, MAKS_BERKAS_PER_SOAL - jumlahSlotTerpakai);

  const perbaruiItemAntrean = (idLokal: string, patch: Partial<AntreanProses>) => {
    setAntrean((prev) => prev.map((x) => (x.idLokal === idLokal ? { ...x, ...patch } : x)));
  };

  const jalankanUnggah = async (
    idLokal: string,
    namaAsli: string,
    sumber: 'camera' | 'upload',
    hasilKomp: HasilKompresiBerkas,
    forensik: HasilForensikAi | null,
    urlSebelum: string | null,
    urlSesudah: string | null,
    gantiPathLama?: string | null
  ) => {
    const controller = new AbortController();
    abortMapRef.current.set(idLokal, controller);
    perbaruiItemAntrean(idLokal, {
      tahap: 'unggah',
      persenUnggah: 1,
      pesanGalat: null,
    });

    try {
      const { path } = await unggahLampiranXhr({
        supabase,
        uid,
        jenis,
        idMateri,
        idSoal,
        blob: hasilKomp.blob,
        namaSimpan: hasilKomp.namaSimpan,
        mime: hasilKomp.mime,
        signal: controller.signal,
        onProgress: (persen) => perbaruiItemAntrean(idLokal, { persenUnggah: persen }),
      });

      abortMapRef.current.delete(idLokal);

      const entriBaru: LampiranJawaban = {
        path,
        name: hasilKomp.namaSimpan,
        original_name: namaAsli,
        mime: hasilKomp.mime,
        original_size: hasilKomp.ukuranAsli,
        compressed_size: hasilKomp.ukuranHasil,
        hemat_persen: hasilKomp.hematPersen,
        quality_score: hasilKomp.skorKualitas,
        quality_status: hasilKomp.statusKualitas,
        quality_note: hasilKomp.catatanKualitas,
        metode_kompresi: hasilKomp.metode,
        source: sumber,
        uploaded_at: new Date().toISOString(),
        ai_scan: forensik,
      };

      setPratinjauSesi((prev) => ({
        ...prev,
        [path]: { sebelum: urlSebelum, sesudah: urlSesudah },
      }));

      const saatIni = lampiranRef.current;
      let berikutnya: LampiranJawaban[];
      if (gantiPathLama) {
        const ada = saatIni.some((l) => l.path === gantiPathLama);
        berikutnya = ada
          ? saatIni.map((l) => (l.path === gantiPathLama ? entriBaru : l))
          : [...saatIni, entriBaru];
        if (!pathAwalLama?.has(gantiPathLama)) {
          hapusLampiranStorage(supabase, [gantiPathLama]).catch(() => {});
        }
      } else {
        berikutnya = [...saatIni, entriBaru];
      }

      lampiranRef.current = berikutnya;
      onChange(berikutnya);
      setAntrean((prev) => prev.filter((x) => x.idLokal !== idLokal));
    } catch (err: any) {
      abortMapRef.current.delete(idLokal);
      if (err?.name === 'AbortError') {
        if (urlSebelum) URL.revokeObjectURL(urlSebelum);
        if (urlSesudah) URL.revokeObjectURL(urlSesudah);
        setAntrean((prev) => prev.filter((x) => x.idLokal !== idLokal));
        return;
      }
      perbaruiItemAntrean(idLokal, {
        tahap: 'gagal',
        pesanGalat: pesanGalat(err),
      });
    }
  };

  const prosesSatuBerkas = async (
    file: File,
    sumber: 'camera' | 'upload',
    gantiPathLama?: string | null
  ) => {
    setGalatUmum(null);
    if (file.size <= 0) {
      setGalatUmum(`Berkas "${file.name}" kosong (0 byte).`);
      return;
    }
    if (file.size > MAKS_UKURAN_MENTAH_BYTE) {
      setGalatUmum(
        `Ukuran berkas "${file.name}" (${formatUkuranByte(file.size)}) melebihi batas maksimal 25 MB.`
      );
      return;
    }
    const cek = validasiFormatBerkas(file.name, file.type, formatFile);
    if (!cek.ok) {
      setGalatUmum(cek.pesan);
      return;
    }

    const idLokal = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const adalahGbr = file.type.startsWith('image/');
    const urlSebelum = adalahGbr ? URL.createObjectURL(file) : null;

    const itemAwal: AntreanProses = {
      idLokal,
      namaAsli: file.name,
      ukuranAsli: file.size,
      sumber,
      tahap: 'kompresi',
      persenKompresi: 2,
      infoTahapKompresi: 'Memeriksa & menyiapkan kompresi...',
      persenUnggah: 0,
      hasilKompresi: null,
      hasilForensik: null,
      urlSebelum,
      urlSesudah: null,
      pesanGalat: null,
      gantiPathLama,
    };
    setAntrean((prev) => [...prev, itemAwal]);

    try {
      // 1. Pindai forensik pada byte mentah SEBELUM kompresi (non-blocking, tidak pernah menggagalkan unggahan siswa)
      let forensik: HasilForensikAi | null = null;
      try {
        const rawBytes = new Uint8Array(await file.arrayBuffer());
        forensik = await pindaiForensikBerkas(rawBytes, file.name, file.type);
      } catch {
        forensik = null;
      }

      // 2. Auto-kompresi maksimal dengan penjagaan ketajaman
      const hasilKomp = await kompresBerkasOtomatis(file, (persen, tahap) => {
        perbaruiItemAntrean(idLokal, {
          persenKompresi: persen,
          infoTahapKompresi: tahap,
        });
      });

      const urlSesudah =
        hasilKomp.mime.startsWith('image/') || hasilKomp.mime === 'application/pdf'
          ? URL.createObjectURL(hasilKomp.blob)
          : null;

      perbaruiItemAntrean(idLokal, {
        persenKompresi: 100,
        hasilKompresi: hasilKomp,
        hasilForensik: forensik,
        urlSesudah,
      });

      // 3. Langsung unggah ke Supabase Storage dengan progres 0%–100%
      await jalankanUnggah(
        idLokal,
        file.name,
        sumber,
        hasilKomp,
        forensik,
        urlSebelum,
        urlSesudah,
        gantiPathLama
      );
    } catch (err: any) {
      perbaruiItemAntrean(idLokal, {
        tahap: 'gagal',
        pesanGalat: pesanGalat(err),
      });
    }
  };

  const prosesFotoKameraKePdf = async (daftarFoto: File[]) => {
    setGalatUmum(null);
    const totalAsli = daftarFoto.reduce((s, f) => s + f.size, 0);
    if (totalAsli > MAKS_UKURAN_MENTAH_BYTE) {
      setGalatUmum('Total ukuran foto melebihi batas 25 MB. Kurangi jumlah halaman foto.');
      return;
    }

    const namaPdf = `foto-jawaban-soal-${nomorSoal}.pdf`;
    const idLokal = `${Date.now()}-campdf`;
    const itemAwal: AntreanProses = {
      idLokal,
      namaAsli: namaPdf,
      ukuranAsli: totalAsli,
      sumber: 'camera',
      tahap: 'kompresi',
      persenKompresi: 4,
      infoTahapKompresi: 'Mengompres & menggabung foto ke PDF...',
      persenUnggah: 0,
      hasilKompresi: null,
      hasilForensik: null,
      urlSebelum: null,
      urlSesudah: null,
      pesanGalat: null,
    };
    setAntrean((prev) => [...prev, itemAwal]);

    try {
      let forensik: HasilForensikAi | null = null;
      try {
        const bytesPertama = new Uint8Array(await daftarFoto[0].arrayBuffer());
        forensik = await pindaiForensikBerkas(bytesPertama, daftarFoto[0].name, daftarFoto[0].type);
      } catch {
        forensik = null;
      }

      const hasilKomp = await bungkusGambarKePdf(daftarFoto, namaPdf, (persen, tahap) => {
        perbaruiItemAntrean(idLokal, {
          persenKompresi: persen,
          infoTahapKompresi: tahap,
        });
      });

      const urlSesudah = URL.createObjectURL(hasilKomp.blob);
      perbaruiItemAntrean(idLokal, {
        persenKompresi: 100,
        hasilKompresi: hasilKomp,
        hasilForensik: forensik,
        urlSesudah,
      });

      await jalankanUnggah(
        idLokal,
        namaPdf,
        'camera',
        hasilKomp,
        forensik,
        null,
        urlSesudah
      );
    } catch (err: any) {
      perbaruiItemAntrean(idLokal, {
        tahap: 'gagal',
        pesanGalat: pesanGalat(err),
      });
    }
  };

  const terimaDaftarBerkas = (files: File[], sumber: 'camera' | 'upload', gantiPath?: string | null) => {
    if (!files.length) return;
    setGalatUmum(null);

    if (gantiPath) {
      prosesSatuBerkas(files[0], sumber, gantiPath);
      return;
    }

    if (sumber === 'camera' && kemasKameraKePdf) {
      if (sisaSlot <= 0) {
        setGalatUmum(`Maksimal ${MAKS_BERKAS_PER_SOAL} berkas per soal.`);
        return;
      }
      prosesFotoKameraKePdf(files);
      return;
    }

    if (files.length > sisaSlot) {
      setGalatUmum(
        `Slot tersisa ${sisaSlot} berkas (maksimal ${MAKS_BERKAS_PER_SOAL} berkas per soal).`
      );
    }
    files.slice(0, sisaSlot).forEach((f) => {
      prosesSatuBerkas(f, sumber);
    });
  };

  const batalkanAntrean = (item: AntreanProses) => {
    const ctrl = abortMapRef.current.get(item.idLokal);
    if (ctrl) {
      ctrl.abort();
      return;
    }
    if (item.urlSebelum) URL.revokeObjectURL(item.urlSebelum);
    if (item.urlSesudah) URL.revokeObjectURL(item.urlSesudah);
    setAntrean((prev) => prev.filter((x) => x.idLokal !== item.idLokal));
  };

  const hapusLampiran = async (item: LampiranJawaban) => {
    const baru = lampiranRef.current.filter((x) => x.path !== item.path);
    lampiranRef.current = baru;
    onChange(baru);

    const urlLokal = pratinjauSesi[item.path];
    if (urlLokal) {
      if (urlLokal.sebelum) URL.revokeObjectURL(urlLokal.sebelum);
      if (urlLokal.sesudah) URL.revokeObjectURL(urlLokal.sesudah);
      setPratinjauSesi((prev) => {
        const salin = { ...prev };
        delete salin[item.path];
        return salin;
      });
    }

    if (!pathAwalLama?.has(item.path)) {
      hapusLampiranStorage(supabase, [item.path]).catch(() => {});
    }
  };

  const bukaPratinjau = async (item: LampiranJawaban) => {
    const lokal = pratinjauSesi[item.path];
    if (lokal?.sesudah) {
      setModalPratinjau({
        item,
        urlSesudah: lokal.sesudah,
        urlSebelum: lokal.sebelum,
        tampilSebelum: false,
        memuatUrl: false,
      });
      return;
    }

    setModalPratinjau({
      item,
      urlSesudah: null,
      urlSebelum: null,
      tampilSebelum: false,
      memuatUrl: true,
    });
    const signed = await buatUrlLampiran(supabase, item.path);
    setModalPratinjau((prev) =>
      prev && prev.item.path === item.path
        ? { ...prev, urlSesudah: signed, memuatUrl: false }
        : prev
    );
  };

  return (
    <div className="mt-3 rounded-2xl border border-[#DCEAF7] bg-[#F8FBFF] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs">
          <span className="font-extrabold text-[#1B4E80]">Lampiran Foto / Berkas Jawaban</span>
          <span className="text-[#66748C]"> &bull; Format diterima: </span>
          <strong className="text-[#2E7BC4]">{labelFormatFile(formatFile)}</strong>
        </div>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white border border-[#DCEAF7] text-[#4B5A70] tabular">
          {lampiran.length}/{MAKS_BERKAS_PER_SOAL} berkas
        </span>
      </div>

      {/* Zona tombol kamera & unggah berkas */}
      {sisaSlot > 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSeretAktif(true);
          }}
          onDragLeave={() => setSeretAktif(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSeretAktif(false);
            const dropped = Array.from(e.dataTransfer.files ?? []);
            terimaDaftarBerkas(dropped, 'upload');
          }}
          className={`rounded-xl border-2 border-dashed p-3.5 transition-colors ${
            seretAktif
              ? 'border-[#2E7BC4] bg-[#EAF6FF]'
              : 'border-[#CFE2F6] bg-white/80 hover:border-[#93C5FD]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <p className="text-xs text-[#66748C] leading-relaxed">
               Anda dapat mengisi teks di atas, memotret jawaban tulisan tangan, atau mengunggah berkas (otomatis dikompres tajam sebelum diunggah).
            </p>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {bisaPakaiKamera && (
                <button
                  type="button"
                  onClick={() => setBukaKamera(true)}
                  className="btn-press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-xs font-bold shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" /> Ambil Foto
                </button>
              )}
              <button
                type="button"
                onClick={() => inputBerkasRef.current?.click()}
                className="btn-press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#2E7BC4] text-[#1B4E80] hover:bg-[#EAF6FF] text-xs font-bold"
              >
                <Upload className="w-3.5 h-3.5 text-[#2E7BC4]" /> Pilih Berkas
              </button>
            </div>
          </div>

          <input
            ref={inputBerkasRef}
            type="file"
            multiple={sisaSlot > 1}
            accept={acceptAttr}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = '';
              terimaDaftarBerkas(list, 'upload');
            }}
            className="hidden"
          />
        </div>
      )}

      {/* Input tersembunyi untuk fitur Ganti Berkas */}
      <input
        ref={inputGantiRef}
        type="file"
        accept={acceptAttr}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          const pathLama = targetGantiPath;
          setTargetGantiPath(null);
          if (list.length && pathLama) {
            terimaDaftarBerkas([list[0]], 'upload', pathLama);
          }
        }}
        className="hidden"
      />

      {galatumum && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex items-start justify-between gap-2"
        >
          <span className="flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {galatumum}
          </span>
          <button
            type="button"
            aria-label="Tutup pesan kesalahan"
            onClick={() => setGalatUmum(null)}
            className="text-[#991B1B] hover:opacity-75"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Daftar berkas yang sedang dikompresi / diunggah */}
      {antrean.length > 0 && (
        <div className="space-y-2.5">
          {antrean.map((a) => {
            const komp = a.hasilKompresi;
            const infoKualitas = komp
              ? lencanaKualitas(komp.statusKualitas, komp.skorKualitas)
              : null;
            return (
              <div
                key={a.idLokal}
                className="rounded-xl bg-white border border-[#DCEAF7] p-3.5 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-[#1F2A37] truncate">
                      {a.gantiPathLama ? 'Mengganti berkas: ' : ''}
                      {a.namaAsli}
                    </div>
                    <div className="text-xs text-[#66748C] mt-0.5 flex items-center gap-1.5 flex-wrap tabular">
                      <span>Ukuran awal: {formatUkuranByte(a.ukuranAsli)}</span>
                      {komp && (
                        <>
                          <ArrowRight className="w-3 h-3 text-[#2E7BC4]" />
                          <strong className="text-[#1B4E80]">
                            Sesudah kompres: {formatUkuranByte(komp.ukuranHasil)}
                          </strong>
                          {komp.hematPersen > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[#E4F8EE] text-[#15885A] font-extrabold">
                              Hemat {String(komp.hematPersen).replace('.', ',')}%
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => batalkanAntrean(a)}
                    className="btn-press px-2.5 py-1 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7] shrink-0"
                  >
                    Batalkan
                  </button>
                </div>

                {/* Bar Progres Kompresi */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-[#1B4E80] flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#2E7BC4]" />
                      {a.tahap === 'kompresi' ? a.infoTahapKompresi : 'Auto-kompresi selesai'}
                    </span>
                    <span className="text-[#2E7BC4] tabular">{a.persenKompresi}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#E6EEF7] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2E7BC4] transition-[width] duration-200"
                      style={{ width: `${a.persenKompresi}%` }}
                    />
                  </div>
                </div>

                {/* Indikator kualitas setelah kompresi selesai */}
                {komp && infoKualitas && (
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${infoKualitas.kelas}`}
                    >
                      <infoKualitas.ikon className="w-3 h-3" /> {infoKualitas.label}
                    </span>
                    <span className="text-[#66748C]">{komp.catatanKualitas}</span>
                  </div>
                )}

                {/* Bar Progres Unggah ke Supabase */}
                {(a.tahap === 'unggah' || a.persenUnggah > 0) && (
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-[#15885A]">Mengunggah ke penyimpanan...</span>
                      <span className="text-[#15885A] tabular">{a.persenUnggah}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#E4F8EE] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#22B573] transition-[width] duration-150"
                        style={{ width: `${a.persenUnggah}%` }}
                      />
                    </div>
                  </div>
                )}

                {a.tahap === 'gagal' && (
                  <div className="p-2.5 rounded-lg bg-[#FDEAE7] border border-[#FECACA] flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#991B1B]">
                      {a.pesanGalat || 'Gagal memproses berkas.'}
                    </span>
                    {a.hasilKompresi && (
                      <button
                        type="button"
                        onClick={() =>
                          jalankanUnggah(
                            a.idLokal,
                            a.namaAsli,
                            a.sumber,
                            a.hasilKompresi!,
                            a.hasilForensik,
                            a.urlSebelum,
                            a.urlSesudah,
                            a.gantiPathLama
                          )
                        }
                        className="btn-press px-3 py-1 rounded-lg bg-[#2E7BC4] text-white text-xs font-bold inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Coba Unggah Lagi
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Daftar berkas yang sudah berhasil dikompresi & terunggah (masih bisa diedit/diganti/dihapus sebelum kumpul final) */}
      {lampiran.length > 0 && (
        <ul className="space-y-2" aria-label={`Lampiran jawaban soal ${nomorSoal}`}>
          {lampiran.map((item) => {
            const infoKualitas = lencanaKualitas(item.quality_status, item.quality_score);
            const IkonBerkas = item.mime.startsWith('image/') ? ImageIcon : FileText;
            const lokalThumb = pratinjauSesi[item.path]?.sesudah;

            return (
              <li
                key={item.path}
                className="rounded-xl bg-white border border-[#DCEAF7] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {item.mime.startsWith('image/') && lokalThumb ? (
                    <button
                      type="button"
                      onClick={() => bukaPratinjau(item)}
                      className="w-14 h-14 rounded-xl overflow-hidden border border-[#DCEAF7] bg-[#F8FAFC] shrink-0"
                      title="Klik untuk memperbesar hasil kompresi"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={lokalThumb}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-[#EAF6FF] text-[#2E7BC4] flex items-center justify-center shrink-0">
                      <IkonBerkas className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-[#1F2A37] truncate max-w-[240px] sm:max-w-[320px]">
                        {item.original_name || item.name}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#E4F8EE] text-[#15885A]">
                        Terunggah 100%
                      </span>
                    </div>

                    {/* Info Before vs After Ukuran Kompresi */}
                    <div className="text-xs text-[#4B5A70] flex items-center gap-1.5 flex-wrap tabular">
                      <span>Sebelum: <strong>{formatUkuranByte(item.original_size)}</strong></span>
                      <ArrowRight className="w-3 h-3 text-[#2E7BC4]" />
                      <span>Sesudah: <strong className="text-[#1B4E80]">{formatUkuranByte(item.compressed_size)}</strong></span>
                      {item.hemat_persen > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-[#EAF6FF] text-[#2E7BC4] font-extrabold">
                          -{String(item.hemat_persen).replace('.', ',')}%
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md bg-[#F1F5F9] text-[#66748C] font-bold">
                          Ukuran optimal
                        </span>
                      )}
                    </div>

                    {/* Status kualitas hasil kompresi (apakah masih bagus atau blur) */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${infoKualitas.kelas}`}
                      >
                        <infoKualitas.ikon className="w-3 h-3" /> {infoKualitas.label}
                      </span>
                      <span className="text-xs text-[#66748C]">{item.quality_note}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => bukaPratinjau(item)}
                    className="btn-press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#DCEAF7] text-xs font-bold text-[#1B4E80] hover:bg-[#F4F9FF]"
                  >
                    <Eye className="w-3.5 h-3.5" /> Cek Hasil
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetGantiPath(item.path);
                      inputGantiRef.current?.click();
                    }}
                    className="btn-press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#DCEAF7] text-xs font-bold text-[#4B5A70] hover:bg-[#F4F9FF]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Ganti
                  </button>
                  <button
                    type="button"
                    onClick={() => hapusLampiran(item)}
                    aria-label={`Hapus berkas ${item.original_name || item.name}`}
                    className="btn-press inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7]"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Modal Kamera Web */}
      <KameraJawaban
        open={bukaKamera}
        maksFoto={Math.max(1, sisaSlot)}
        kemasKePdf={kemasKameraKePdf}
        onClose={() => setBukaKamera(false)}
        onSelesai={(berkasFoto) => terimaDaftarBerkas(berkasFoto, 'camera')}
      />

      {/* Modal Pratinjau & Perbandingan Sebelum vs Sesudah Kompresi */}
      <Modal
        open={modalPratinjau !== null}
        lebar="lg"
        onClose={() => setModalPratinjau(null)}
        title={modalPratinjau?.item.original_name || modalPratinjau?.item.name || 'Pratinjau Lampiran'}
        actions={
          <>
            {modalPratinjau?.urlSesudah && (
              <a
                href={modalPratinjau.urlSesudah}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-press px-4 py-2.5 rounded-xl border border-[#DCEAF7] text-[#1B4E80] font-bold text-sm hover:bg-[#F4F9FF] inline-flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" /> Buka / Unduh
              </a>
            )}
            <button
              type="button"
              onClick={() => setModalPratinjau(null)}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm"
            >
              Tutup
            </button>
          </>
        }
      >
        {modalPratinjau && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#DCEAF7] flex items-center justify-between gap-2 flex-wrap text-xs">
              <div className="space-x-1.5 tabular">
                <span>Sebelum: <strong>{formatUkuranByte(modalPratinjau.item.original_size)}</strong></span>
                <span>&rarr;</span>
                <span>Sesudah: <strong className="text-[#1B4E80]">{formatUkuranByte(modalPratinjau.item.compressed_size)}</strong></span>
                {modalPratinjau.item.hemat_persen > 0 && (
                  <span className="font-extrabold text-[#15885A]">
                    (Hemat {String(modalPratinjau.item.hemat_persen).replace('.', ',')}%)
                  </span>
                )}
              </div>
              <span className="font-bold text-[#1B4E80]">{modalPratinjau.item.quality_note}</span>
            </div>

            {modalPratinjau.urlSebelum && modalPratinjau.urlSesudah && modalPratinjau.item.mime.startsWith('image/') && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F1F5F9] border border-[#DCEAF7]">
                <button
                  type="button"
                  onClick={() => setModalPratinjau((p) => (p ? { ...p, tampilSebelum: false } : p))}
                  className={`py-1.5 rounded-lg text-xs font-bold ${
                    !modalPratinjau.tampilSebelum ? 'bg-white text-[#1B4E80] shadow-sm' : 'text-[#66748C]'
                  }`}
                >
                  Hasil Sesudah Kompres ({formatUkuranByte(modalPratinjau.item.compressed_size)})
                </button>
                <button
                  type="button"
                  onClick={() => setModalPratinjau((p) => (p ? { ...p, tampilSebelum: true } : p))}
                  className={`py-1.5 rounded-lg text-xs font-bold ${
                    modalPratinjau.tampilSebelum ? 'bg-white text-[#1B4E80] shadow-sm' : 'text-[#66748C]'
                  }`}
                >
                  Berkas Asli Sebelum Kompres ({formatUkuranByte(modalPratinjau.item.original_size)})
                </button>
              </div>
            )}

            {modalPratinjau.memuatUrl ? (
              <div className="py-12 text-center text-xs font-bold text-[#66748C]">
                Memuat pratinjau berkas...
              </div>
            ) : !modalPratinjau.urlSesudah ? (
              <div className="py-10 text-center text-xs text-[#66748C]">
                Pratinjau langsung tidak tersedia untuk berkas ini.
              </div>
            ) : modalPratinjau.item.mime.startsWith('image/') ? (
              <div className="rounded-2xl overflow-hidden border border-[#DCEAF7] bg-[#0F172A]/95 max-h-[62vh] flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    modalPratinjau.tampilSebelum && modalPratinjau.urlSebelum
                      ? modalPratinjau.urlSebelum
                      : modalPratinjau.urlSesudah
                  }
                  alt={modalPratinjau.item.name}
                  className="max-h-[60vh] w-auto object-contain"
                />
              </div>
            ) : modalPratinjau.item.mime === 'application/pdf' ? (
              <iframe
                title={modalPratinjau.item.name}
                src={modalPratinjau.urlSesudah}
                className="w-full h-[58vh] rounded-2xl border border-[#DCEAF7]"
              />
            ) : (
              <div className="p-8 rounded-2xl border border-[#DCEAF7] bg-[#F8FAFC] text-center space-y-2">
                <FileText className="w-10 h-10 text-[#2E7BC4] mx-auto" />
                <p className="text-xs font-bold text-[#1B4E80]">
                  {modalPratinjau.item.original_name || modalPratinjau.item.name}
                </p>
                <p className="text-xs text-[#66748C]">
                  Gunakan tombol <strong>Buka / Unduh</strong> di bawah untuk memeriksa berkas dokumen ini.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

