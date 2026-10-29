'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardCheck, BookOpenText, ListChecks, LayoutDashboard, Users, School, CalendarDays, Megaphone, Activity,
  BarChart3, ShieldCheck, Eye, ClipboardList,
} from 'lucide-react';

type PeranStaf = 'guru' | 'admin';

const MENU: Record<PeranStaf, { href: string; label: string; icon: React.ElementType }[]> = {
  guru: [
    { href: '/guru/koreksi', label: 'Koreksi', icon: ClipboardCheck },
    { href: '/guru/materi', label: 'Materi', icon: BookOpenText },
    { href: '/guru/lkpd', label: 'LKPD', icon: ClipboardList },
    { href: '/guru/soal', label: 'Bank Soal', icon: ListChecks },
    { href: '/guru/pengumuman', label: 'Pengumuman', icon: Megaphone },
    { href: '/guru/jadwal', label: 'Jadwal', icon: CalendarDays },
    { href: '/guru/aktivitas', label: 'Aktivitas Siswa', icon: Activity },
    { href: '/guru/nilai', label: 'Rekap Nilai', icon: BarChart3 },
  ],
  admin: [
    { href: '/admin', label: 'Ringkasan', icon: LayoutDashboard },
    { href: '/admin/pengguna', label: 'Pengguna', icon: Users },
    { href: '/admin/kelas', label: 'Kelas', icon: School },
    { href: '/admin/jadwal', label: 'Jadwal', icon: CalendarDays },
    { href: '/admin/pengumuman', label: 'Pengumuman', icon: Megaphone },
    { href: '/admin/keluar-tab', label: 'Keluar Tab', icon: Eye },
    { href: '/admin/hak-akses', label: 'Hak Akses', icon: ShieldCheck },
  ],
};

const lastStaffRect: Record<PeranStaf, { left: number; width: number } | null> = {
  guru: null,
  admin: null,
};

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Menu antar-halaman staf. Guru dan admin punya menu yang berbeda; saat peran belum termuat menu tidak ditampilkan. */
export function StaffNav({ role }: { role: PeranStaf | null }) {
  const pathname = usePathname();
  const items = role ? MENU[role] : [];
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indikator, setIndikator] = useState<{ left: number; width: number; animate: boolean } | null>(
    role && lastStaffRect[role] ? { ...lastStaffRect[role]!, animate: false } : null
  );

  const aktif = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`));
  const hrefAktif = items.find((m) => aktif(m.href))?.href ?? null;

  useIsoLayoutEffect(() => {
    if (!role || !hrefAktif) {
      setIndikator(null);
      return;
    }
    const el = itemRefs.current[hrefAktif];
    if (!el) return;

    const target = { left: el.offsetLeft, width: el.offsetWidth };
    const prev = lastStaffRect[role];
    lastStaffRect[role] = target;

    if (!prev || (prev.left === target.left && prev.width === target.width)) {
      setIndikator({ ...target, animate: false });
    } else {
      setIndikator({ ...prev, animate: false });
      const raf = requestAnimationFrame(() => {
        setIndikator({ ...target, animate: true });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [role, hrefAktif]);

  useEffect(() => {
    if (!role || !hrefAktif) return;
    const el = itemRefs.current[hrefAktif];
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

    const ukurUlang = () => {
      const targetEl = itemRefs.current[hrefAktif];
      if (!targetEl) return;
      const rect = { left: targetEl.offsetLeft, width: targetEl.offsetWidth };
      lastStaffRect[role] = rect;
      setIndikator({ ...rect, animate: false });
    };
    window.addEventListener('resize', ukurUlang);
    return () => window.removeEventListener('resize', ukurUlang);
  }, [role, hrefAktif]);

  return (
    <nav aria-label="Menu staf" className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-3 pb-1">
      <div className="command-dock min-h-[48px]">
        <div className="relative p-1.5 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
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
          {!role && (
            <div className="flex items-center gap-2 px-2 py-1.5" aria-hidden="true">
              <span className="h-6 w-24 rounded-lg bg-[#E8F0F8]" />
              <span className="h-6 w-20 rounded-lg bg-[#EEF4FA]" />
              <span className="h-6 w-24 rounded-lg bg-[#EEF4FA]" />
            </div>
          )}
          {items.map(({ href, label, icon: Icon }) => {
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
