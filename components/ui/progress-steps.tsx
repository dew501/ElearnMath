import React from 'react';
import Link from 'next/link';
import { Check, Lock, RotateCcw } from 'lucide-react';

export type StatusLangkah = 'selesai' | 'aktif' | 'terkunci' | 'ulang';

export interface Langkah {
  label: string;
  status: StatusLangkah;
  keterangan: string;
  href?: string;
}

const LINGKARAN: Record<StatusLangkah, string> = {
  selesai: 'bg-gradient-to-br from-[#34C98A] to-[#15885A] text-white border-transparent',
  aktif: 'bg-white text-[#2E7BC4] border-[#2E7BC4] anim-pulse',
  ulang: 'bg-[#FFF1DD] text-[#E37A12] border-[#FFB454] anim-pulse',
  terkunci: 'bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0]',
};

/** Stepper progres LKPD → Latihan → Evaluasi. */
export function ProgressSteps({ langkah }: { langkah: Langkah[] }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Progres pengerjaan">
      {langkah.map((l, i) => {
        const isi = (
          <>
            <div className="flex items-center w-full">
              <span className={`h-[3px] flex-1 rounded-full ${i === 0 ? 'opacity-0' : langkah[i - 1].status === 'selesai' ? 'bg-[#34C98A]' : 'bg-[#DCEAF7]'}`} />
              <span className={`mx-1.5 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-extrabold shrink-0 transition-transform group-hover:scale-105 ${LINGKARAN[l.status]}`}>
                {l.status === 'selesai' ? <Check className="w-4 h-4" strokeWidth={3} /> : l.status === 'terkunci' ? <Lock className="w-3.5 h-3.5" /> : l.status === 'ulang' ? <RotateCcw className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`h-[3px] flex-1 rounded-full ${i === langkah.length - 1 ? 'opacity-0' : l.status === 'selesai' ? 'bg-[#34C98A]' : 'bg-[#DCEAF7]'}`} />
            </div>
            <span className={`mt-2 text-xs font-bold ${l.status === 'terkunci' ? 'text-[#94A3B8]' : 'text-[#1B4E80]'}`}>{l.label}</span>
            <span className="text-[11px] text-[#66748C] leading-tight text-center px-1">{l.keterangan}</span>
          </>
        );
        return (
          <li key={l.label} className="flex flex-col items-center">
            {l.href && l.status !== 'terkunci' ? (
              <Link href={l.href} className="group flex flex-col items-center w-full rounded-xl focus-visible:outline-offset-4">
                {isi}
              </Link>
            ) : (
              <div className="flex flex-col items-center w-full">{isi}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
