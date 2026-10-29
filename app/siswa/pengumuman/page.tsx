'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { KartuPengumuman, type Pengumuman } from '@/components/pengumuman-kelola';
import { useProfil } from '@/lib/use-profil';
import { Megaphone, Inbox } from 'lucide-react';

export default function PengumumanSiswaPage() {
  const supabase = createClient();
  const profil = useProfil();
  const [daftar, setDaftar] = useState<Pengumuman[] | null>(null);
  const [kelas, setKelas] = useState<{ id: string; nama: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [p, k] = await Promise.all([
        supabase.from('pengumuman').select('id, judul, isi, kelas_ids, penting, dibuat_oleh, peran_pembuat, nama_pembuat, created_at, updated_at').order('created_at', { ascending: false }),
        supabase.from('kelas').select('id, nama'),
      ]);
      setDaftar((p.data ?? []) as Pengumuman[]);
      setKelas((k.data ?? []) as { id: string; nama: string }[]);
      // Notifikasi pengumuman dianggap sudah dibaca setelah halaman ini dibuka
      await supabase.from('notifikasi').update({ dibaca_at: new Date().toISOString() }).eq('jenis', 'pengumuman').is('dibaca_at', null);
    })();
  }, [supabase]);

  const namaKelas = useCallback((id: string) => kelas.find((k) => k.id === id)?.nama ?? 'Kelas', [kelas]);
  const penting = daftar?.filter((p) => p.penting) ?? [];
  const biasa = daftar?.filter((p) => !p.penting) ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Pengumuman" userRole="siswa" userName={profil?.nama ?? '…'} />
      <SiswaNav />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[920px] w-full mx-auto">
        <div className="hero-navy p-6 sm:p-7 mb-6 anim-rise">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-xs font-bold text-[#FFCA80] mb-3">
              Papan Informasi Siswa
            </div>
            <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-[-0.02em] flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-white/14 border border-white/25 flex items-center justify-center text-[#FFCA80] shadow-inner shrink-0"><Megaphone className="w-5 h-5" /></span>
              Pengumuman
            </h1>
            <p className="text-xs sm:text-[13px] text-[#C8E1FA] mt-1.5">Informasi dari guru untuk kelasmu dan dari sekolah.</p>
          </div>
        </div>
        {!daftar ? (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}</div>
        ) : daftar.length === 0 ? (
          <div className="glass-card p-10 text-center"><Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" /><p className="text-sm font-semibold text-[#1B4E80]">Belum ada pengumuman.</p></div>
        ) : (
          <div className="space-y-3">
            {[...penting, ...biasa].map((p) => <KartuPengumuman key={p.id} p={p} namaKelas={namaKelas} />)}
          </div>
        )}
      </div>
    </div>
  );
}
