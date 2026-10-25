import React from 'react';
import { Target, ListOrdered, Footprints } from 'lucide-react';

const baris = (s: string | null | undefined) => (s ?? '').split('\n').map((x) => x.replace(/^\s*[-•\d.)]+\s*/, '').trim()).filter(Boolean);

/** Bagian pembuka LKPD: tujuan pembelajaran & petunjuk pengerjaan. */
export function PengantarLkpd({ judul, tujuan, petunjuk, jumlahTahap }: { judul?: string | null; tujuan?: string | null; petunjuk?: string | null; jumlahTahap?: number }) {
  const t = baris(tujuan);
  const p = baris(petunjuk);
  if (!judul && !t.length && !p.length) return null;
  return (
    <div className="mt-5 grid md:grid-cols-2 gap-3">
      {judul && (
        <div className="md:col-span-2 text-sm font-extrabold text-[#1B4E80] flex items-center gap-2">
          <Footprints className="w-4 h-4 text-[#F0932B]" /> {judul}
          {jumlahTahap ? <span className="text-[11px] font-bold text-[#94A3B8]">· {jumlahTahap} tahap kegiatan</span> : null}
        </div>
      )}
      {t.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#F4F9FF] border border-[#DCEAF7]">
          <div className="text-[11px] font-extrabold text-[#2E7BC4] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Tujuan pembelajaran</div>
          <ul className="space-y-1.5 text-[13px] text-[#1F2A37] list-disc pl-5">
            {t.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      )}
      {p.length > 0 && (
        <div className="p-4 rounded-2xl bg-[#FFF8EC] border border-[#FBD38D]">
          <div className="text-[11px] font-extrabold text-[#B45309] uppercase tracking-wider mb-2 flex items-center gap-1.5"><ListOrdered className="w-3.5 h-3.5" /> Petunjuk pengerjaan</div>
          <ol className="space-y-1.5 text-[13px] text-[#1F2A37] list-decimal pl-5">
            {p.map((x, i) => <li key={i}>{x}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Kepala satu tahap kegiatan LKPD. */
export function KepalaTahap({ nomor, total, judul, instruksi, selesai }: { nomor: number; total: number; judul: string; instruksi?: string | null; selesai?: boolean }) {
  return (
    <div className="flex gap-3 items-start">
      <span className={`w-10 h-10 rounded-2xl flex flex-col items-center justify-center shrink-0 font-extrabold text-white shadow-sm ${selesai ? 'bg-gradient-to-br from-[#34C98A] to-[#15885A]' : 'bg-gradient-to-br from-[#FFB454] to-[#F0932B]'}`}>
        <span className="text-[8px] uppercase tracking-wider opacity-90 leading-none">Tahap</span>
        <span className="text-sm leading-none tabular">{nomor}</span>
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">Tahap {nomor} dari {total}</div>
        <h2 className="text-lg font-extrabold text-[#1B4E80] leading-tight">{judul}</h2>
        {instruksi && <p className="text-[13px] text-[#4B5A70] mt-1 leading-relaxed whitespace-pre-wrap">{instruksi}</p>}
      </div>
    </div>
  );
}
