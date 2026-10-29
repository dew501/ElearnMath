'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { Spinner } from '@/components/ui/skeleton';
import { NotifBell } from '@/components/notif-bell';
import { Kehadiran } from '@/components/kehadiran';

interface NavbarProps {
  title?: string;
  /** null = profil masih dimuat (badge peran disembunyikan) */
  userRole?: 'siswa' | 'guru' | 'admin' | null;
  userName?: string;
}

export function Navbar({
  title = 'elearnMath',
  userRole = 'siswa',
  userName = 'Pengguna',
}: NavbarProps) {
  const router = useRouter();
  const supabase = createClient();
  const [keluar, setKeluar] = useState(false);

  const handleLogout = async () => {
    setKeluar(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  const nama = userName.trim() || 'Pengguna';
  const beranda = userRole === 'siswa' ? '/siswa' : userRole === 'admin' ? '/admin' : '/guru/koreksi';
  const roleBadge =
    userRole === 'admin'
      ? 'bg-[#FFF3E2] text-[#9A4E04]'
      : userRole === 'guru'
        ? 'bg-[#E8F0F9] text-[#133B63]'
        : 'bg-[#E9F4FE] text-[#1E5F9E]';

  return (
    <header className="sticky top-0 z-30 bg-white/92 backdrop-blur-xl border-b border-[#DCE7F2]">
      <Kehadiran />
      <div className="max-w-[1200px] mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Link href={beranda} className="group flex items-center gap-2.5 shrink-0 rounded-xl" aria-label="Beranda elearnMath">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#2569AD] to-[#123A63] text-white flex items-center justify-center font-extrabold text-lg shadow-[0_1px_2px_rgba(13,42,74,0.25),0_4px_10px_-4px_rgba(13,42,74,0.5)] transition-transform duration-200 ease-[var(--ease-out)] sm:group-hover:-rotate-6">
              e
              <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-md bg-[#FFB454] text-[11px] text-[#0D2744] flex items-center justify-center font-extrabold ring-2 ring-white">
                π
              </span>
            </div>
            <span className="font-extrabold text-[19px] tracking-[-0.025em] text-[#0E2A48] hidden sm:inline">
              elearn<span className="text-[#EA881A]">Math</span>
            </span>
          </Link>
          <span className="text-[#C5D5E6] text-lg font-light select-none hidden sm:inline" aria-hidden="true">/</span>
          <span className="text-[13px] sm:text-sm font-semibold text-[#4A5D75] truncate">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <NotifBell />
          <Link
            href="/profil"
            title="Profil saya"
            aria-label={`Profil saya (${nama})`}
            className="btn-press flex items-center gap-2 pl-1 pr-2 sm:pr-2.5 py-1 rounded-full border border-transparent hover:bg-[#F2F7FC] hover:border-[#DCE7F2]"
          >
            <div className="w-8 h-8 rounded-full bg-[#FFB454] text-[#0D2744] flex items-center justify-center text-[13px] font-extrabold">
              {nama.charAt(0).toUpperCase()}
            </div>
            <span className="text-[13px] font-semibold text-[#0F2D4E] max-w-[145px] truncate hidden sm:inline">{nama}</span>
            {userRole && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md capitalize ${roleBadge}`}>
                {userRole}
              </span>
            )}
          </Link>

          <button
            onClick={handleLogout}
            disabled={keluar}
            className="btn-press w-9 h-9 flex items-center justify-center text-[#7C8DA4] hover:text-[#D94330] hover:bg-[#FDEEEC] rounded-xl disabled:opacity-60"
            title="Keluar"
            aria-label="Keluar"
          >
            {keluar ? <Spinner /> : <LogOut className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </div>
    </header>
  );
}
