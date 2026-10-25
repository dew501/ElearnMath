'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface ProfilRingkas {
  id: string;
  nama: string;
  role: 'siswa' | 'guru' | 'admin';
  /** Kelas yang diampu (guru) atau kelas siswa: [{id, nama}] */
  kelas: { id: string; nama: string }[];
}

/** Profil pengguna yang sedang login (untuk navbar, menu, dan filter "kelas saya"). */
export function useProfil() {
  const router = useRouter();
  const [profil, setProfil] = useState<ProfilRingkas | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let batal = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const [p, k] = await Promise.all([
        supabase.from('users').select('full_name, role').eq('id', user.id).maybeSingle(),
        supabase.from('kelas_anggota').select('kelas_id, kelas:kelas_id(id, nama)').eq('user_id', user.id),
      ]);
      if (batal) return;
      const role = p.data?.role === 'admin' ? 'admin' : p.data?.role === 'guru' ? 'guru' : 'siswa';
      setProfil({
        id: user.id,
        nama: p.data?.full_name || user.email?.split('@')[0] || 'Pengguna',
        role,
        kelas: ((k.data ?? []) as any[])
          .map((x) => x.kelas)
          .filter(Boolean)
          .sort((a: { nama: string }, b: { nama: string }) => a.nama.localeCompare(b.nama, 'id')),
      });
    })();
    return () => {
      batal = true;
    };
  }, [router]);

  return profil;
}
