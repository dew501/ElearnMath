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
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[860px] w-full mx-auto">
        <div className="mb-5 anim-rise">
          <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2"><Megaphone className="w-6 h-6 text-[#F0932B]" /> Pengumuman</h1>
          <p className="text-xs text-[#66748C] mt-1">Informasi dari guru untuk kelasmu dan dari sekolah.</p>
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
