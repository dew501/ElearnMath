'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
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

  const [rendered, setRendered] = useState(open);
  const [active, setActive] = useState(false);

  // Bekukan isi terakhir saat dialog sedang animasi keluar agar konten tidak runtuh mendadak.
  const snapshotRef = useRef({ title, icon, children, actions, lebar });
  if (open) {
    snapshotRef.current = { title, icon, children, actions, lebar };
  }

  useEffect(() => {
    if (open) {
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
    const t = setTimeout(() => setRendered(false), 180);
    return () => clearTimeout(t);
  }, [open]);

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

  if ((!open && !rendered) || typeof document === 'undefined') return null;

  const snap = open ? { title, icon, children, actions, lebar } : snapshotRef.current;
  const dataOpen = open && active ? 'true' : 'false';

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 ${!open ? 'pointer-events-none' : ''}`}>
      <div
        data-open={dataOpen}
        className="modal-backdrop absolute inset-0 bg-[#0F2A47]/45 backdrop-blur-[4px]"
        onClick={() => open && !busyRef.current && onCloseRef.current()}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idJudul}
        data-open={dataOpen}
        className={`modal-panel relative w-full ${
          snap.lebar === 'lg' ? 'sm:max-w-2xl max-h-[92vh] overflow-y-auto' : 'sm:max-w-md max-h-[90vh] overflow-y-auto'
        } bg-gradient-to-b from-white to-[#F9FCFF] rounded-t-[28px] sm:rounded-[26px] border border-[#BFD8F0] shadow-[0_1px_0_#ffffff_inset,0_28px_72px_-12px_rgba(10,31,56,0.42)] p-6 sm:p-7`}
      >
        <div className="sm:hidden w-10 h-1 rounded-full bg-[#C6DCF2] mx-auto -mt-1.5 mb-4" aria-hidden="true" />
        {snap.icon && <div className="mb-4">{snap.icon}</div>}
        <h2 id={idJudul} className="text-lg font-extrabold text-[#0E2A48] tracking-[-0.015em] mb-2">
          {snap.title}
        </h2>
        <div className="text-sm text-[#435368] leading-relaxed">{snap.children}</div>
        <div className="mt-6 pt-4 border-t border-[#DFECF9] flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">{snap.actions}</div>
      </div>
    </div>,
    document.body
  );
}
