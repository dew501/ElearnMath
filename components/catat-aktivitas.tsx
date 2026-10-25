'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Mencatat aktivitas siswa (mis. membuka materi) untuk pemantauan guru. Tidak menampilkan apa pun. */
export function CatatAktivitas({ jenis, idMateri, detail }: { jenis: 'buka_materi' | 'mulai_tugas' | 'buka_halaman'; idMateri?: string | null; detail?: Record<string, unknown> | null }) {
  const kunciDetail = JSON.stringify(detail ?? null);
  useEffect(() => {
    createClient()
      .rpc('catat_aktivitas', { p_jenis: jenis, p_id_materi: idMateri ?? null, p_detail: detail ?? null })
      .then(() => {}, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jenis, idMateri, kunciDetail]);
  return null;
}
