'use client';

import React from 'react';
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

/** Menu utama siswa (di bawah navbar). Halaman pengerjaan menandai menu sesuai jenis tugasnya. */
export function SiswaNav({ aktif: aktifPaksa }: { aktif?: string }) {
  const pathname = usePathname();
  const aktif = (href: string) => {
    if (aktifPaksa) return aktifPaksa === href;
    return href === '/siswa' ? pathname === '/siswa' : pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav aria-label="Menu siswa" className="border-b border-white/70 bg-white/45 backdrop-blur-md">
      <div className="px-4 sm:px-6 flex gap-1 overflow-x-auto [scrollbar-width:none] max-w-[1100px] mx-auto">
        {MENU.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={aktif(href) ? 'page' : undefined}
            className={`relative flex items-center gap-1.5 px-3 py-3 text-xs font-bold whitespace-nowrap transition-colors ${
              aktif(href) ? 'text-[#1B4E80]' : 'text-[#66748C] hover:text-[#2E7BC4]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span
              className={`absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-gradient-to-r from-[#F0932B] to-[#FFB454] transition-transform duration-300 origin-left ${
                aktif(href) ? 'scale-x-100' : 'scale-x-0'
              }`}
            />
          </Link>
        ))}
      </div>
    </nav>
  );
}
