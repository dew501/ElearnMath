'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Bell, User } from 'lucide-react';

interface NavbarProps {
  title?: string;
  userRole?: 'siswa' | 'guru' | 'admin';
  userName?: string;
}

export function Navbar({
  title = 'elearnMath',
  userRole = 'siswa',
  userName = 'Pengguna',
}: NavbarProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 bg-white/75 backdrop-blur-md border-b border-[#DCEAF7] px-6 py-3.5 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <Link href={userRole === 'guru' ? '/guru/koreksi' : '/siswa/materi/1'} className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white flex items-center justify-center font-extrabold text-lg shadow-md shadow-blue-500/20">
            e
          </div>
          <span className="font-bold text-lg text-[#1B4E80]">
            elearn<span className="text-[#F0932B]">Math</span>
          </span>
        </Link>
        <span className="text-gray-300 mx-1">|</span>
        <span className="text-sm font-semibold text-[#1F2A37] hidden sm:inline">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EAF6FF] border border-[#DCEAF7]">
          <div className="w-6 h-6 rounded-full bg-[#FFB454] text-white flex items-center justify-center text-xs font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-[#1B4E80]">
            {userName}
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#D3ECFF] text-[#1B4E80] uppercase">
            {userRole}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 text-[#E3543F] hover:bg-[#FDEAE7] rounded-lg transition-colors"
          title="Keluar"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
