'use client';

import React from 'react';
import { Spinner } from '@/components/ui/skeleton';
import type { HasilKoreksi } from '@/lib/koreksi/tipe';
import { Sparkles, Wand2, RefreshCw, ShieldCheck, Bot, AlertTriangle, Scale } from 'lucide-react';

export interface SaranAi {
  hasil: HasilKoreksi;
  sumber: 'gemini' | 'aturan';
  model: string | null;
  status: 'saran' | 'divalidasi';
  updated_at?: string | null;
}

const TINGKAT = {
  rendah: 'bg-[#E4F8EE] text-[#15885A]',
  sedang: 'bg-[#FFF1DD] text-[#B45309]',
  tinggi: 'bg-[#FDEAE7] text-[#C2412E]',
} as const;

const namaModel = (m: string | null) => (m ? m.replace(/^gemini-/, 'Gemini ').replace(/-/g, ' ').replace(/\b(\w)/g, (c) => c.toUpperCase()) : 'Gemini');

/** Kartu saran koreksi AI di panel guru: AI memberi nilai & feedback, guru memeriksa lalu memvalidasi. */
export function PanelAi({
  saran,
  memuat,
  galat,
  onKoreksi,
  onPakai,
  adaUraian,
}: {
  saran: SaranAi | null;
  memuat: boolean;
  galat: string | null;
  onKoreksi: () => void;
  onPakai: (s: SaranAi) => void;
  adaUraian: boolean;
}) {
  if (memuat) {
    return (
      <div className="p-5 rounded-2xl border border-[#E3D7FF] bg-gradient-to-br from-[#FAF7FF] to-white flex items-center gap-3" role="status" aria-live="polite">
        <span className="w-10 h-10 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center anim-pulse"><Sparkles className="w-5 h-5" /></span>
        <div>
          <div className="text-sm font-extrabold text-[#5B21B6] flex items-center gap-2"><Spinner className="w-4 h-4" /> AI sedang memeriksa jawaban…</div>
          <p className="text-[11px] text-[#66748C] mt-0.5">Biasanya 3–10 detik. Anda tetap bisa membaca lembar jawaban.</p>
        </div>
      </div>
    );
  }

  if (!saran) {
    return (
      <div className="p-5 rounded-2xl border border-[#E3D7FF] bg-gradient-to-br from-[#FAF7FF] to-white flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] text-white flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-[#5B21B6]">Koreksi AI</div>
          <p className="text-[11px] text-[#66748C] mt-0.5 leading-relaxed">
            {adaUraian
              ? 'AI menilai jawaban uraian berdasarkan rubrik & jawaban ideal, lalu menyarankan nilai dan umpan balik. Anda tetap memeriksa dan memutuskan nilai akhirnya.'
              : 'Lembar ini hanya berisi pilihan ganda; saran nilai dihitung otomatis dari kunci jawaban.'}
          </p>
          {galat && <p role="alert" className="text-[11px] font-semibold text-[#C2412E] mt-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {galat}</p>}
        </div>
        <button type="button" onClick={onKoreksi} className="btn-press shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-white text-xs font-bold shadow-[0_6px_16px_rgba(109,40,217,0.3)]">
          <Sparkles className="w-4 h-4" /> Koreksi dengan AI
        </button>
      </div>
    );
  }

  const h = saran.hasil;
  const divalidasi = saran.status === 'divalidasi';
  const selisih = h.pembanding_aturan != null ? Math.abs(h.pembanding_aturan - h.nilai_100) : null;
  return (
    <div className={`p-5 rounded-2xl border ${divalidasi ? 'border-[#BBF7D0] bg-[#F6FEF9]' : 'border-[#E3D7FF] bg-gradient-to-br from-[#FAF7FF] to-white'} anim-rise`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="text-center shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#7C3AED]">Saran nilai</div>
          <div className="text-4xl font-extrabold text-[#5B21B6] leading-none tabular mt-1">{h.nilai_100}</div>
          <div className="text-[10px] text-[#94A3B8] mt-1 tabular">{h.skor} / {h.maks} poin</div>
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EDE9FE] text-[#6D28D9]">
              {saran.sumber === 'gemini' ? <><Bot className="w-3 h-3" /> {namaModel(saran.model)}</> : <><Scale className="w-3 h-3" /> Mesin aturan (rubrik)</>}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${divalidasi ? 'bg-[#E4F8EE] text-[#15885A]' : 'bg-[#FFF1DD] text-[#B45309]'}`}>
              {divalidasi ? <><ShieldCheck className="w-3 h-3" /> Divalidasi guru</> : 'Belum divalidasi'}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TINGKAT[h.keyakinan === 'tinggi' ? 'rendah' : h.keyakinan === 'sedang' ? 'sedang' : 'tinggi']}`}>Keyakinan {h.keyakinan}</span>
          </div>
          <p className="text-sm text-[#1F2A37] mt-2 leading-relaxed">{h.feedback}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#66748C]">
            {selisih != null && saran.sumber === 'gemini' && (
              <span className={selisih > 15 ? 'text-[#B45309] font-semibold' : ''}>
                Pembanding mesin aturan: {h.pembanding_aturan}{selisih > 15 ? ' — selisih besar, periksa lebih teliti' : ''}
              </span>
            )}
            {h.indikasi_ai && (
              <span>
                Indikasi jawaban buatan AI/salinan:{' '}
                <span className={`font-bold px-1.5 py-0.5 rounded-full ${TINGKAT[h.indikasi_ai.tingkat]}`}>{h.indikasi_ai.tingkat}</span>
                {h.indikasi_ai.alasan && <span className="ml-1">({h.indikasi_ai.alasan})</span>}
              </span>
            )}
          </div>
          {h.catatan_sistem && <p className="text-[11px] text-[#B45309] mt-1.5 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {h.catatan_sistem}</p>}
          {galat && <p role="alert" className="text-[11px] font-semibold text-[#C2412E] mt-1">{galat}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 justify-end">
        <button type="button" onClick={onKoreksi} className="btn-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#6D28D9] hover:bg-[#EDE9FE]">
          <RefreshCw className="w-3.5 h-3.5" /> Koreksi ulang
        </button>
        <button type="button" onClick={() => onPakai(saran)} className="btn-press inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-xs font-bold">
          <Wand2 className="w-3.5 h-3.5" /> Pakai saran ini
        </button>
      </div>
    </div>
  );
}
