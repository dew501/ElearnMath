'use client';

// Tampilan gambar lampiran soal (galeri pertanyaan & gambar opsi PG) beserta lightbox zoom.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { urlGambarSoal, type GambarSoal } from '@/lib/lampiran/tipe';
import { ChevronLeft, ChevronRight, ImageOff, Minus, Plus, RotateCcw, X, ZoomIn } from 'lucide-react';

export interface ItemLightbox {
  url: string;
  nama: string;
}

const SKALA_MIN = 1;
const SKALA_MAKS = 5;
const batasi = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Lightbox layar penuh: zoom (scroll, pinch, klik ganda, tombol), geser saat diperbesar, panah & Esc. */
export function LightboxGambar({
  daftar,
  indeks,
  onIndeks,
  onClose,
}: {
  daftar: ItemLightbox[];
  indeks: number;
  onIndeks: (i: number) => void;
  onClose: () => void;
}) {
  const [skala, setSkala] = useState(1);
  const [geser, setGeser] = useState({ x: 0, y: 0 });
  const [gagal, setGagal] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tutupRef = useRef<HTMLButtonElement>(null);
  const pointer = useRef(new Map<number, { x: number; y: number }>());
  const awalPinch = useRef<{ jarak: number; skala: number } | null>(null);
  const awalGeser = useRef<{ x: number; y: number; gx: number; gy: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const item = daftar[indeks];
  const banyak = daftar.length > 1;

  const reset = useCallback(() => {
    setSkala(1);
    setGeser({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
    setGagal(false);
  }, [indeks, reset]);

  const ubahSkala = useCallback((baru: number) => {
    const s = batasi(baru, SKALA_MIN, SKALA_MAKS);
    setSkala(s);
    if (s === 1) setGeser({ x: 0, y: 0 });
  }, []);

  const keIndeks = useCallback(
    (arah: 1 | -1) => {
      if (!banyak) return;
      onIndeks((indeks + arah + daftar.length) % daftar.length);
    },
    [banyak, daftar.length, indeks, onIndeks]
  );

  // Tangkap keyboard lebih dulu (fase capture) agar tidak menutup dialog/form di belakangnya.
  useEffect(() => {
    const sebelumnya = document.activeElement as HTMLElement | null;
    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    tutupRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        keIndeks(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        keIndeks(-1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setSkala((s) => batasi(s * 1.4, SKALA_MIN, SKALA_MAKS));
      } else if (e.key === '-') {
        e.preventDefault();
        setSkala((s) => {
          const b = batasi(s / 1.4, SKALA_MIN, SKALA_MAKS);
          if (b === 1) setGeser({ x: 0, y: 0 });
          return b;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        reset();
      } else if (e.key === 'Tab') {
        const f = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
        if (!f.length) return;
        e.preventDefault();
        const i = f.indexOf(document.activeElement as HTMLElement);
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflowLama;
      sebelumnya?.focus?.();
    };
  }, [keIndeks, reset]);

  const onWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    ubahSkala(skala * (e.deltaY < 0 ? 1.18 : 1 / 1.18));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    // Tangkap pointer hanya saat menggeser gambar yang diperbesar (agar klik tombol & latar tetap normal)
    if (skala > 1) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointer.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointer.current.size === 2) {
      const [a, b] = Array.from(pointer.current.values());
      awalPinch.current = { jarak: Math.hypot(a.x - b.x, a.y - b.y), skala };
      awalGeser.current = null;
    } else if (pointer.current.size === 1 && skala > 1) {
      awalGeser.current = { x: e.clientX, y: e.clientY, gx: geser.x, gy: geser.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointer.current.has(e.pointerId)) return;
    pointer.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointer.current.size === 2 && awalPinch.current) {
      const [a, b] = Array.from(pointer.current.values());
      const jarak = Math.hypot(a.x - b.x, a.y - b.y);
      if (awalPinch.current.jarak > 0) ubahSkala((awalPinch.current.skala * jarak) / awalPinch.current.jarak);
    } else if (awalGeser.current) {
      setGeser({ x: awalGeser.current.gx + (e.clientX - awalGeser.current.x), y: awalGeser.current.gy + (e.clientY - awalGeser.current.y) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointer.current.delete(e.pointerId);
    if (pointer.current.size < 2) awalPinch.current = null;
    if (pointer.current.size === 0) awalGeser.current = null;
  };

  if (!item || typeof document === 'undefined') return null;

  const tombol =
    'btn-press w-10 h-10 rounded-full flex items-center justify-center bg-white/12 hover:bg-white/22 text-white border border-white/20 disabled:opacity-40';

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau gambar: ${item.nama}`}
      className="fixed inset-0 z-[90] flex flex-col bg-[#081A2E]/92 backdrop-blur-sm text-white"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0">
        <p className="text-xs sm:text-sm font-semibold truncate min-w-0">
          {banyak && <span className="tabular text-[#9CC7F0] mr-2">{indeks + 1}/{daftar.length}</span>}
          {item.nama}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" aria-label="Perkecil" onClick={() => ubahSkala(skala / 1.4)} disabled={skala <= SKALA_MIN} className={tombol}>
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-12 text-center text-xs font-bold tabular" aria-live="polite">{Math.round(skala * 100)}%</span>
          <button type="button" aria-label="Perbesar" onClick={() => ubahSkala(skala * 1.4)} disabled={skala >= SKALA_MAKS} className={tombol}>
            <Plus className="w-4 h-4" />
          </button>
          <button type="button" aria-label="Kembalikan ukuran" onClick={reset} disabled={skala === 1} className={tombol}>
            <RotateCcw className="w-4 h-4" />
          </button>
          <button ref={tutupRef} type="button" aria-label="Tutup pratinjau" onClick={onClose} className={`${tombol} ml-1`}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 min-h-0 overflow-hidden touch-none select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (skala > 1 ? reset() : ubahSkala(2.5))}
        onClick={(e) => {
          if (e.target === e.currentTarget && skala === 1) onClose();
        }}
        style={{ cursor: skala > 1 ? 'grab' : 'zoom-in' }}
      >
        {gagal ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#C8E1FA]">
            <ImageOff className="w-10 h-10" />
            <p className="text-sm font-semibold">Gambar tidak dapat dimuat.</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.url}
            src={item.url}
            alt={item.nama}
            draggable={false}
            onError={() => setGagal(true)}
            className="absolute inset-0 m-auto max-w-[94%] max-h-[94%] object-contain transition-transform duration-75 ease-out"
            style={{ transform: `translate(${geser.x}px, ${geser.y}px) scale(${skala})` }}
          />
        )}
        {banyak && (
          <>
            <button type="button" aria-label="Gambar sebelumnya" onClick={(e) => { e.stopPropagation(); keIndeks(-1); }} className={`${tombol} absolute left-3 top-1/2 -translate-y-1/2`}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" aria-label="Gambar berikutnya" onClick={(e) => { e.stopPropagation(); keIndeks(1); }} className={`${tombol} absolute right-3 top-1/2 -translate-y-1/2`}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      <p className="shrink-0 text-center text-[11px] text-[#9CC7F0] px-4 pb-3 hidden sm:block">
        Gulir atau klik ganda untuk memperbesar, seret untuk menggeser, panah kiri/kanan untuk berpindah, Esc untuk menutup.
      </p>
    </div>,
    document.body
  );
}

/**
 * Gambar lazy-load dengan kerangka (skeleton) selama memuat agar tata letak tidak meloncat,
 * dan placeholder bila gagal dimuat (mis. objek sudah dihapus / migrasi belum dijalankan).
 */
function GambarAman({ src, alt, className, kerangka = 'min-h-[96px] min-w-[140px]' }: { src: string; alt: string; className: string; kerangka?: string }) {
  const [status, setStatus] = useState<'memuat' | 'siap' | 'gagal'>('memuat');
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // Gambar dari cache bisa sudah selesai sebelum handler onLoad terpasang
    if (ref.current?.complete && ref.current.naturalWidth > 0) setStatus('siap');
  }, [src]);
  if (status === 'gagal') {
    return (
      <span className={`${className} ${kerangka} flex flex-col items-center justify-center gap-1 text-[#94A3B8] bg-[#F1F5F9]`}>
        <ImageOff className="w-5 h-5" />
        <span className="text-[11px] font-semibold">Gambar tidak tersedia</span>
      </span>
    );
  }
  return (
    <span className={`block relative ${status === 'memuat' ? `${kerangka} bg-[#EEF4FA] animate-pulse` : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setStatus('siap')}
        onError={() => setStatus('gagal')}
        className={className}
      />
    </span>
  );
}

const keItemLightbox = (g: GambarSoal): ItemLightbox => ({ url: urlGambarSoal(g.path), nama: g.original_name || g.name || 'Gambar soal' });

/** Galeri gambar pertanyaan (maks 5). Klik untuk memperbesar. */
export function GaleriGambarSoal({ items, ukuran = 'normal', className = '' }: { items: GambarSoal[]; ukuran?: 'normal' | 'kecil'; className?: string }) {
  const [buka, setBuka] = useState<number | null>(null);
  if (!items.length) return null;
  const satu = items.length === 1;
  const tinggi = ukuran === 'kecil' ? (satu ? 'max-h-48' : 'h-24') : satu ? 'max-h-[340px]' : 'h-36 sm:h-40';
  return (
    <>
      <ul className={`${satu ? 'flex' : `grid gap-2 ${ukuran === 'kecil' ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`} w-full min-w-0 ${className}`} aria-label="Gambar pada soal">
        {items.map((g, i) => (
          <li key={g.path} className="min-w-0 max-w-full">
            <button
              type="button"
              onClick={() => setBuka(i)}
              aria-label={`Perbesar gambar soal ${i + 1}: ${g.original_name || g.name}`}
              className={`group relative block overflow-hidden rounded-xl border border-[#DCEAF7] bg-white hover:border-[#8BBCE8] focus-visible:ring-4 focus-visible:ring-[#2E7BC4]/25 ${satu ? 'max-w-full' : 'w-full'}`}
            >
              <GambarAman src={urlGambarSoal(g.path)} alt={`Gambar soal ${i + 1}`} kerangka={satu ? "min-h-[160px] w-[min(320px,100%)]" : tinggi} className={`${satu ? `${tinggi} w-auto max-w-full` : `${tinggi} w-full`} object-contain`} />
              <span className="absolute right-1.5 bottom-1.5 w-7 h-7 rounded-lg bg-[#0E2A48]/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                <ZoomIn className="w-4 h-4" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {buka !== null && <LightboxGambar daftar={items.map(keItemLightbox)} indeks={buka} onIndeks={setBuka} onClose={() => setBuka(null)} />}
    </>
  );
}

/** Gambar kecil pada opsi PG. Klik gambar = perbesar (tidak ikut memilih opsi). */
export function GambarOpsi({ item, huruf, ukuran = 'normal' }: { item: GambarSoal; huruf: string; ukuran?: 'normal' | 'kecil' }) {
  const [buka, setBuka] = useState(false);
  const kelas = ukuran === 'kecil' ? 'h-14 max-w-[120px]' : 'h-20 sm:h-24 max-w-[180px]';
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setBuka(true);
        }}
        aria-label={`Perbesar gambar opsi ${huruf}`}
        className="group relative shrink-0 overflow-hidden rounded-lg border border-[#DCEAF7] bg-white hover:border-[#8BBCE8] focus-visible:ring-4 focus-visible:ring-[#2E7BC4]/25"
      >
        <GambarAman src={urlGambarSoal(item.path)} alt={`Gambar opsi ${huruf}`} kerangka={ukuran === "kecil" ? "min-h-[56px] min-w-[72px]" : "min-h-[80px] min-w-[110px]"} className={`${kelas} w-auto object-contain`} />
        <span className="absolute right-1 bottom-1 w-6 h-6 rounded-md bg-[#0E2A48]/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
          <ZoomIn className="w-3.5 h-3.5" />
        </span>
      </button>
      {buka && <LightboxGambar daftar={[keItemLightbox(item)]} indeks={0} onIndeks={() => {}} onClose={() => setBuka(false)} />}
    </>
  );
}
