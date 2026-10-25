'use client';

import React from 'react';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { PengumumanKelola } from '@/components/pengumuman-kelola';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfil } from '@/lib/use-profil';

export default function GuruPengumumanPage() {
  const profil = useProfil();
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Pengumuman" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil ? 'guru' : null} />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[960px] w-full mx-auto">
        {profil ? <PengumumanKelola profil={profil} /> : <Skeleton className="h-64 rounded-3xl" />}
      </div>
    </div>
  );
}
