'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastData {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
}

const GAYA = {
  success: { box: 'bg-[#0F5132] text-white', icon: <CheckCircle2 className="w-5 h-5 text-[#7CE3B1] shrink-0" /> },
  error: { box: 'bg-[#7F1D1D] text-white', icon: <AlertTriangle className="w-5 h-5 text-[#FCA5A5] shrink-0" /> },
  info: { box: 'bg-[#1B4E80] text-white', icon: <Info className="w-5 h-5 text-[#BFDBFE] shrink-0" /> },
};

/** Notifikasi melayang di bawah layar, hilang sendiri. */
export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.tone === 'error' ? 7000 : 4000);
    return () => clearTimeout(t);
    // onClose sengaja tidak jadi dependensi: timer hanya direset saat toast berganti
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!toast) return null;
  const g = GAYA[toast.tone];

  return (
    <div className="fixed inset-x-0 bottom-4 sm:bottom-6 z-[70] flex justify-center sm:justify-end px-4 sm:pr-6 pointer-events-none">
      <div
        key={toast.id}
        role={toast.tone === 'error' ? 'alert' : 'status'}
        aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
        className={`pointer-events-auto anim-toast max-w-sm w-full sm:w-auto flex items-start gap-3 rounded-2xl px-4 py-3.5 shadow-[0_18px_50px_rgba(15,42,71,0.35)] ${g.box}`}
      >
        {g.icon}
        <span className="text-sm font-semibold leading-snug flex-1">{toast.text}</span>
        <button onClick={onClose} className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Tutup notifikasi">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
