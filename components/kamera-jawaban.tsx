'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  Camera,
  RefreshCw,
  Check,
  Trash2,
  Plus,
  Zap,
  AlertTriangle,
  Smartphone,
} from 'lucide-react';

interface FotoTertangkap {
  id: string;
  file: File;
  previewUrl: string;
}

export function KameraJawaban({
  open,
  maksFoto,
  kemasKePdf = false,
  onClose,
  onSelesai,
}: {
  open: boolean;
  maksFoto: number;
  /** True bila soal hanya mengizinkan PDF (tanpa format gambar), sehingga foto halaman akan digabung otomatis ke 1 PDF. */
  kemasKePdf?: boolean;
  onClose: () => void;
  onSelesai: (berkasFoto: File[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputFallbackRef = useRef<HTMLInputElement | null>(null);

  const [arahKamera, setArahKamera] = useState<'environment' | 'user'>('environment');
  const [memuatKamera, setMemuatKamera] = useState(false);
  const [galatKamera, setGalatKamera] = useState<string | null>(null);
  const [dukungSenter, setDukungSenter] = useState(false);
  const [senterAktif, setSenterAktif] = useState(false);
  const [daftarFoto, setDaftarFoto] = useState<FotoTertangkap[]>([]);
  const [modeTambah, setModeTambah] = useState(true);

  const matikanStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setDukungSenter(false);
    setSenterAktif(false);
  }, []);

  const nyalakanKamera = useCallback(
    async (arah: 'environment' | 'user') => {
      matikanStream();
      setGalatKamera(null);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setGalatKamera('Peramban ini tidak mendukung akses kamera langsung. Gunakan tombol Kamera Perangkat di bawah.');
        return;
      }

      setMemuatKamera(true);
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: arah },
              width: { ideal: 2400 },
              height: { ideal: 1800 },
            },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const track = stream.getVideoTracks()[0];
        const kapabilitas = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setDukungSenter(Boolean(kapabilitas.torch));
      } catch (err: any) {
        const nama = err?.name || '';
        if (nama === 'NotAllowedError' || nama === 'PermissionDeniedError') {
          setGalatKamera('Izin akses kamera ditolak. Izinkan akses kamera pada peramban atau gunakan tombol Kamera Perangkat.');
        } else if (nama === 'NotFoundError' || nama === 'DevicesNotFoundError') {
          setGalatKamera('Perangkat kamera tidak ditemukan. Gunakan tombol unggah berkas atau kamera perangkat.');
        } else {
          setGalatKamera('Kamera tidak dapat dibuka saat ini. Anda tetap bisa memotret lewat tombol Kamera Perangkat.');
        }
      } finally {
        setMemuatKamera(false);
      }
    },
    [matikanStream]
  );

  useEffect(() => {
    if (!open) {
      matikanStream();
      setDaftarFoto((lama) => {
        lama.forEach((f) => URL.revokeObjectURL(f.previewUrl));
        return [];
      });
      setModeTambah(true);
      setGalatKamera(null);
      return;
    }

    if (modeTambah) {
      nyalakanKamera(arahKamera);
    } else {
      matikanStream();
    }

    return () => {
      matikanStream();
    };
  }, [open, arahKamera, modeTambah, nyalakanKamera, matikanStream]);

  const toggleSenter = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    const target = !senterAktif;
    try {
      await track.applyConstraints({ advanced: [{ torch: target } as any] });
      setSenterAktif(target);
    } catch {
      // Abaikan jika perangkat menolak perubahan senter
    }
  };

  const jepretFoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const kanvas = document.createElement('canvas');
    kanvas.width = video.videoWidth;
    kanvas.height = video.videoHeight;
    const ctx = kanvas.getContext('2d');
    if (!ctx) return;

    if (arahKamera === 'user') {
      // Kamera depan: jangan cerminkan tulisan tangan agar teks matematika tidak terbalik!
      ctx.drawImage(video, 0, 0, kanvas.width, kanvas.height);
    } else {
      ctx.drawImage(video, 0, 0, kanvas.width, kanvas.height);
    }

    const blob: Blob | null = await new Promise((res) => kanvas.toBlob(res, 'image/jpeg', 0.94));
    if (!blob) return;

    const urutan = daftarFoto.length + 1;
    const file = new File([blob], `foto-jawaban-${urutan}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    const previewUrl = URL.createObjectURL(blob);

    setDaftarFoto((prev) => [...prev, { id: `${Date.now()}-${urutan}`, file, previewUrl }]);
    setModeTambah(false);
  };

  const tanganiFallbackInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!list.length) return;
    const batas = kemasKePdf ? Math.max(maksFoto, 8) : maksFoto;
    const sisa = Math.max(0, batas - daftarFoto.length);
    const dipilih = list.slice(0, sisa).map((f, idx) => ({
      id: `${Date.now()}-fb-${idx}`,
      file: f,
      previewUrl: URL.createObjectURL(f),
    }));
    if (dipilih.length) {
      setDaftarFoto((prev) => [...prev, ...dipilih]);
      setModeTambah(false);
    }
  };

  const hapusFoto = (id: string) => {
    setDaftarFoto((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const sisa = prev.filter((x) => x.id !== id);
      if (sisa.length === 0) setModeTambah(true);
      return sisa;
    });
  };

  const batasHalaman = kemasKePdf ? 8 : maksFoto;
  const bisaTambahLagi = daftarFoto.length < batasHalaman;

  const konfirmasiPakai = () => {
    if (!daftarFoto.length) return;
    const hasil = daftarFoto.map((f) => f.file);
    onSelesai(hasil);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      lebar="lg"
      title="Ambil Foto Jawaban"
      actions={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn-press px-4 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF]"
          >
            Batal
          </button>
          {daftarFoto.length > 0 && (
            <button
              type="button"
              onClick={konfirmasiPakai}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#22B573] hover:bg-[#15885A] text-white font-bold text-sm inline-flex items-center justify-center gap-1.5 shadow-[0_6px_16px_rgba(34,181,115,0.3)]"
            >
              <Check className="w-4 h-4" />
              {kemasKePdf
                ? `Kompres & Gabung ${daftarFoto.length} Halaman ke PDF`
                : `Gunakan & Kompres ${daftarFoto.length} Foto`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-[#66748C]">
          Arahkan kamera tegak lurus di atas kertas jawaban dengan pencahayaan cukup agar angka, pangkat, dan pecahan terbaca tajam.
          {kemasKePdf && (
            <strong className="text-[#1B4E80]"> Soal ini diatur khusus PDF: foto Anda akan otomatis dikemas menjadi 1 berkas PDF terkompresi.</strong>
          )}
        </p>

        <input
          ref={inputFallbackRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={tanganiFallbackInput}
          className="hidden"
        />

        {modeTambah ? (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-[#0F172A] aspect-[4/3] flex items-center justify-center border border-[#DCEAF7]">
              {!galatKamera ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  {/* Bingkai pemandu dokumen */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-4 sm:inset-6 rounded-xl border-2 border-dashed border-white/60 shadow-[0_0_0_9999px_rgba(15,23,42,0.22)]"
                  />
                  {memuatKamera && (
                    <div className="absolute inset-0 bg-[#0F172A]/75 flex items-center justify-center text-white text-xs font-bold">
                      Menyiapkan kamera...
                    </div>
                  )}
                  <div className="absolute top-3 right-3 flex gap-2">
                    {dukungSenter && (
                      <button
                        type="button"
                        onClick={toggleSenter}
                        aria-label="Nyalakan lampu kilat"
                        className={`btn-press px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 backdrop-blur-md ${
                          senterAktif ? 'bg-[#FFB454] text-[#1F2A37]' : 'bg-black/50 text-white'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" /> Lampu
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setArahKamera((a) => (a === 'environment' ? 'user' : 'environment'))}
                      className="btn-press px-3 py-1.5 rounded-xl bg-black/50 hover:bg-black/70 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-md"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Putar Kamera
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-6 text-center max-w-sm space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#FFF1DD] text-[#F0932B] flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-white/90 leading-relaxed">{galatKamera}</p>
                  <button
                    type="button"
                    onClick={() => inputFallbackRef.current?.click()}
                    className="btn-press px-4 py-2.5 rounded-xl bg-[#2E7BC4] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Smartphone className="w-4 h-4" /> Buka Kamera Perangkat
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => inputFallbackRef.current?.click()}
                className="btn-press px-3.5 py-2 rounded-xl border border-[#DCEAF7] bg-white text-xs font-bold text-[#1B4E80] hover:bg-[#F4F9FF] inline-flex items-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5" /> Kamera Perangkat / Galeri
              </button>

              <div className="flex items-center gap-2">
                {daftarFoto.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setModeTambah(false)}
                    className="btn-press px-3.5 py-2 rounded-xl border border-[#DCEAF7] text-xs font-bold text-[#4B5A70]"
                  >
                    Lihat {daftarFoto.length} Foto
                  </button>
                )}
                {!galatKamera && (
                  <button
                    type="button"
                    disabled={memuatKamera}
                    onClick={jepretFoto}
                    className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold inline-flex items-center gap-2 shadow-[0_6px_18px_rgba(46,123,196,0.35)] disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" /> Ambil Foto
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {daftarFoto.map((item, idx) => (
                <div
                  key={item.id}
                  className="relative rounded-2xl overflow-hidden border border-[#DCEAF7] bg-[#F8FAFC]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={`Pratinjau foto halaman ${idx + 1}`}
                    className="w-full h-48 object-contain bg-[#0F172A]/95"
                  />
                  <div className="p-2.5 flex items-center justify-between text-xs">
                    <span className="font-bold text-[#1B4E80]">Halaman Foto #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => hapusFoto(item.id)}
                      className="btn-press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[#C2412E] hover:bg-[#FDEAE7] font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Foto Ulang / Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {bisaTambahLagi && (
              <button
                type="button"
                onClick={() => setModeTambah(true)}
                className="btn-press w-full py-2.5 rounded-xl border-2 border-dashed border-[#BFDBFE] text-xs font-bold text-[#2E7BC4] hover:bg-[#F4F9FF] flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Tambah Halaman Foto ({daftarFoto.length}/{batasHalaman})
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

