'use client';

import React from 'react';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { MonitorKeluarTab } from '@/components/monitor-keluar-tab';
import { useProfil } from '@/lib/use-profil';
import { Eye } from 'lucide-react';

export default function AdminKeluarTabPage() {
  const profil = useProfil();
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Monitor Keluar Tab" userRole="admin" userName={profil?.nama ?? '…'} />
      <StaffNav role="admin" />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <div className="mb-5 anim-rise">
          <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2"><Eye className="w-6 h-6 text-[#C2412E]" /> Monitor Keluar Tab</h1>
          <p className="text-xs text-[#66748C] mt-1 max-w-2xl">
            Dicatat setiap kali siswa meninggalkan tab/aplikasi saat lembar LKPD, latihan, atau evaluasi sedang terbuka: siapa, berapa kali, dan pada bagian apa. Catatan ini bukti pendukung, bukan vonis kecurangan.
          </p>
        </div>
        <MonitorKeluarTab />
      </div>
    </div>
  );
}
