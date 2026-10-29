'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastData {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
}

const GAYA = {
  success: {
    box: 'bg-[#0D4A2E]/95 text-white ring-1 ring-[#7CE3B1]/25',
    badge: 'bg-[#176B44] text-[#8EF0BE]',
    icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
  },
  error: {
    box: 'bg-[#7A1C1C]/95 text-white ring-1 ring-[#FCA5A5]/25',
    badge: 'bg-[#992424] text-[#FECACA]',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
  },
  info: {
    box: 'bg-[#17436F]/95 text-white ring-1 ring-[#93C5FD]/25',
    badge: 'bg-[#215991] text-[#CFE7FF]',
    icon: <Info className="w-4 h-4 shrink-0" />,
  },
};

/** Notifikasi melayang di bawah layar, hilang sendiri (tertahan saat disentuh kursor / tab disembunyikan). */
export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  const [rendered, setRendered] = useState(Boolean(toast));
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);

  const lastToastRef = useRef<ToastData | null>(toast);
  if (toast) {
    lastToastRef.current = toast;
  }

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const remainingRef = useRef(4000);
  const startAtRef = useRef(0);

  useEffect(() => {
    const onVis = () => setTabHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (toast) {
      remainingRef.current = toast.tone === 'error' ? 7000 : 4000;
      setRendered(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setActive(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setActive(false);
    setHovered(false);
    const t = setTimeout(() => setRendered(false), 185);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!toast || hovered || tabHidden) return;
    startAtRef.current = Date.now();
    const dur = Math.max(400, remainingRef.current);
    const t = setTimeout(() => onCloseRef.current(), dur);
    return () => {
      clearTimeout(t);
      const elapsed = Date.now() - startAtRef.current;
      remainingRef.current = Math.max(400, remainingRef.current - elapsed);
    };
  }, [toast, hovered, tabHidden]);

  const tampil = toast ?? (rendered ? lastToastRef.current : null);
  if (!tampil) return null;
  const g = GAYA[tampil.tone];

  return (
    <div className="fixed inset-x-0 bottom-4 sm:bottom-6 z-[70] flex justify-center sm:justify-end px-4 sm:pr-6 pointer-events-none">
      <div
        role={tampil.tone === 'error' ? 'alert' : 'status'}
        aria-live={tampil.tone === 'error' ? 'assertive' : 'polite'}
        data-open={toast && active ? 'true' : 'false'}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`toast-card pointer-events-auto backdrop-blur-md max-w-sm w-full sm:w-auto flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-[0_18px_46px_-8px_rgba(15,42,71,0.38)] ${g.box}`}
      >
        <span className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${g.badge}`}>
          {g.icon}
        </span>
        <span className="text-[13px] font-semibold leading-snug flex-1">{tampil.text}</span>
        <button
          type="button"
          onClick={onClose}
          className="btn-press w-7 h-7 rounded-lg flex items-center justify-center opacity-75 hover:opacity-100 hover:bg-white/10"
          aria-label="Tutup notifikasi"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
