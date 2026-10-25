'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import { Spinner } from '@/components/ui/skeleton';

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
  const beranda = userRole === 'siswa' ? '/siswa/materi' : userRole === 'admin' ? '/admin' : '/guru/koreksi';

  return (
    <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-white/70 shadow-[0_1px_0_rgba(27,78,128,0.06),0_8px_24px_rgba(27,78,128,0.04)]">
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={beranda} className="group flex items-center gap-2.5 shrink-0 rounded-xl" aria-label="Beranda elearnMath">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white flex items-center justify-center font-extrabold text-lg shadow-md shadow-blue-500/25 transition-transform duration-300 group-hover:-rotate-6">
              e
              <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-md bg-[#FFB454] text-[10px] text-white flex items-center justify-center font-black shadow-sm">
                π
              </span>
            </div>
            <span className="font-extrabold text-lg text-[#1B4E80] hidden sm:inline">
              elearn<span className="text-[#F0932B]">Math</span>
            </span>
          </Link>
          <span className="h-6 w-px bg-[#DCEAF7] hidden sm:block" />
          <span className="text-[13px] sm:text-sm font-semibold text-[#1F2A37] truncate">{title}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 pl-1 pr-2.5 sm:pr-3 py-1 rounded-full bg-white/80 border border-[#DCEAF7] shadow-sm">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-white flex items-center justify-center text-xs font-extrabold">
              {nama.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-semibold text-[#1B4E80] max-w-[150px] truncate hidden sm:inline">{nama}</span>
            {userRole && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#D3ECFF] text-[#1B4E80] uppercase tracking-wide">
                {userRole}
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            disabled={keluar}
            className="btn-press w-9 h-9 flex items-center justify-center text-[#E3543F] hover:bg-[#FDEAE7] rounded-xl disabled:opacity-60"
            title="Keluar"
            aria-label="Keluar"
          >
            {keluar ? <Spinner /> : <LogOut className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
