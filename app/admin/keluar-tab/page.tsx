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
        <div className="hero-navy p-6 md:p-7 mb-5 anim-rise">
          <div className="relative z-10">
            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.12] border border-white/20 text-[#FCA5A5] mb-2">Integritas Ujian</span>
            <h1 className="text-2xl md:text-[28px] font-extrabold text-white tracking-[-0.02em] flex items-center gap-2.5"><Eye className="w-6 h-6 text-[#FCA5A5]" /> Monitor Keluar Tab</h1>
            <p className="text-xs md:text-sm text-[#D2E6FA]/90 mt-1 max-w-2xl leading-relaxed">
              Dicatat setiap kali siswa meninggalkan tab/aplikasi saat lembar LKPD, latihan, atau evaluasi sedang terbuka: siapa, berapa kali, dan pada bagian apa. Catatan ini bukti pendukung, bukan vonis kecurangan.
            </p>
          </div>
        </div>
        <MonitorKeluarTab />
      </div>
    </div>
  );
}
