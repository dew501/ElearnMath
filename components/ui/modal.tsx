'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
  /** Saat proses berjalan, dialog tidak bisa ditutup. */
  busy?: boolean;
  /** 'lg' untuk form yang panjang (bisa digulir). */
  lebar?: 'md' | 'lg';
}

const FOKUS = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, icon, children, actions, onClose, busy = false, lebar = 'md' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const idJudul = useId();
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const sebelumnya = document.activeElement as HTMLElement | null;
    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const daftar = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOKUS) ?? []);
    (panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? daftar()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === 'Tab') {
        const f = daftar();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowLama;
      sebelumnya?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0F2A47]/45 backdrop-blur-[3px] anim-fade"
        onClick={() => !busyRef.current && onCloseRef.current()}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idJudul}
        className={`relative w-full ${lebar === 'lg' ? 'max-w-2xl max-h-[92vh] overflow-y-auto' : 'max-w-md'} bg-white rounded-3xl shadow-[0_30px_80px_rgba(15,42,71,0.35)] p-6 sm:p-7 anim-pop`}
      >
        {icon && <div className="mb-4">{icon}</div>}
        <h2 id={idJudul} className="text-lg font-extrabold text-[#1B4E80] mb-2">
          {title}
        </h2>
        <div className="text-sm text-[#4B5A70] leading-relaxed">{children}</div>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">{actions}</div>
      </div>
    </div>,
    document.body
  );
}
