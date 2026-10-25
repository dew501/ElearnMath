'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, BookOpenText, ListChecks, LayoutDashboard, Users } from 'lucide-react';

type PeranStaf = 'guru' | 'admin';

const MENU: { href: string; label: string; icon: React.ElementType; peran: PeranStaf[] }[] = [
  { href: '/admin', label: 'Ringkasan', icon: LayoutDashboard, peran: ['admin'] },
  { href: '/admin/pengguna', label: 'Pengguna', icon: Users, peran: ['admin'] },
  { href: '/guru/koreksi', label: 'Koreksi', icon: ClipboardCheck, peran: ['guru', 'admin'] },
  { href: '/guru/materi', label: 'Materi', icon: BookOpenText, peran: ['guru', 'admin'] },
  { href: '/guru/soal', label: 'Bank Soal', icon: ListChecks, peran: ['guru', 'admin'] },
];

/** Menu antar-halaman staf (guru/admin). Saat peran belum termuat, menu admin disembunyikan. */
export function StaffNav({ role }: { role: PeranStaf | null }) {
  const pathname = usePathname();
  const items = MENU.filter((m) => m.peran.includes(role ?? 'guru'));
  const aktif = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <nav aria-label="Menu staf" className="border-b border-white/70 bg-white/45 backdrop-blur-md">
      <div className="px-4 sm:px-6 flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={aktif(href) ? 'page' : undefined}
            className={`relative flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold whitespace-nowrap transition-colors ${
              aktif(href) ? 'text-[#1B4E80]' : 'text-[#66748C] hover:text-[#2E7BC4]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span
              className={`absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-gradient-to-r from-[#2E7BC4] to-[#5FA8E8] transition-transform duration-300 origin-left ${
                aktif(href) ? 'scale-x-100' : 'scale-x-0'
              }`}
            />
          </Link>
        ))}
      </div>
    </nav>
  );
}
