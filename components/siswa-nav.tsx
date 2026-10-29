'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, ClipboardList, PenLine, Award, BarChart3, Megaphone, CalendarDays } from 'lucide-react';

const MENU = [
  { href: '/siswa', label: 'Beranda', icon: Home },
  { href: '/siswa/materi', label: 'Materi', icon: BookOpen },
  { href: '/siswa/lkpd', label: 'LKPD', icon: ClipboardList },
  { href: '/siswa/latihan', label: 'Latihan', icon: PenLine },
  { href: '/siswa/evaluasi', label: 'Evaluasi', icon: Award },
  { href: '/siswa/nilai', label: 'Daftar Nilai', icon: BarChart3 },
  { href: '/siswa/pengumuman', label: 'Pengumuman', icon: Megaphone },
  { href: '/siswa/jadwal', label: 'Jadwal', icon: CalendarDays },
];

// Simpan posisi indikator terakhir lintas perpindahan halaman agar garis aktif meluncur mulus.
let lastSiswaRect: { left: number; width: number } | null = null;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Menu utama siswa (di bawah navbar). Halaman pengerjaan menandai menu sesuai jenis tugasnya. */
export function SiswaNav({ aktif: aktifPaksa }: { aktif?: string }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indikator, setIndikator] = useState<{ left: number; width: number; animate: boolean } | null>(
    lastSiswaRect ? { ...lastSiswaRect, animate: false } : null
  );

  const aktif = (href: string) => {
    if (aktifPaksa) return aktifPaksa === href;
    return href === '/siswa' ? pathname === '/siswa' : pathname === href || pathname.startsWith(`${href}/`);
  };

  const hrefAktif = MENU.find((m) => aktif(m.href))?.href ?? null;

  useIsoLayoutEffect(() => {
    if (!hrefAktif) {
      setIndikator(null);
      return;
    }
    const el = itemRefs.current[hrefAktif];
    if (!el) return;

    const target = { left: el.offsetLeft, width: el.offsetWidth };
    const prev = lastSiswaRect;
    lastSiswaRect = target;

    if (!prev || (prev.left === target.left && prev.width === target.width)) {
      setIndikator({ ...target, animate: false });
    } else {
      setIndikator({ ...prev, animate: false });
      const raf = requestAnimationFrame(() => {
        setIndikator({ ...target, animate: true });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [hrefAktif]);

  useEffect(() => {
    if (!hrefAktif) return;
    const el = itemRefs.current[hrefAktif];
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

    const ukurUlang = () => {
      const targetEl = itemRefs.current[hrefAktif];
      if (!targetEl) return;
      const rect = { left: targetEl.offsetLeft, width: targetEl.offsetWidth };
      lastSiswaRect = rect;
      setIndikator({ ...rect, animate: false });
    };
    window.addEventListener('resize', ukurUlang);
    return () => window.removeEventListener('resize', ukurUlang);
  }, [hrefAktif]);

  return (
    <nav aria-label="Menu siswa" className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-3 pb-1">
      <div className="command-dock">
        <div
          ref={containerRef}
          className="relative p-1.5 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
        >
          {indikator && (
            <span
              aria-hidden="true"
              style={{
                transform: `translate3d(${indikator.left}px, 0, 0)`,
                width: indikator.width,
                transition: indikator.animate
                  ? 'transform 260ms var(--ease-out), width 260ms var(--ease-out)'
                  : 'none',
              }}
              className="pointer-events-none absolute left-0 top-1.5 bottom-1.5 rounded-[11px] bg-[#133B63] shadow-[0_1px_2px_rgba(15,45,78,0.2),0_4px_12px_-4px_rgba(15,45,78,0.45)]"
            />
          )}
          {MENU.map(({ href, label, icon: Icon }) => {
            const isAktif = aktif(href);
            return (
              <Link
                key={href}
                ref={(node) => {
                  itemRefs.current[href] = node;
                }}
                href={href}
                aria-current={isAktif ? 'page' : undefined}
                className={`group relative z-10 flex items-center gap-1.5 px-3.5 py-2 rounded-[11px] text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 ${
                  isAktif
                    ? `text-white ${!indikator ? 'bg-[#133B63]' : ''}`
                    : 'text-[#4A5D75] hover:text-[#0E2A48] hover:bg-[#EEF4FB]'
                }`}
              >
                <Icon className={`w-4 h-4 transition-colors duration-150 ${isAktif ? 'text-[#FFB454]' : 'text-[#8BA3BD] group-hover:text-[#256DB3]'}`} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
