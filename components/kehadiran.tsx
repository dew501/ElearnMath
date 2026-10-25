'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Menandai pengguna sedang aktif (status online) setiap menit selama tab terbuka. */
export function Kehadiran() {
  useEffect(() => {
    const supabase = createClient();
    const tandai = () => {
      if (document.visibilityState === 'visible') supabase.rpc('tandai_aktif').then(() => {}, () => {});
    };
    tandai();
    const t = setInterval(tandai, 60_000);
    document.addEventListener('visibilitychange', tandai);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tandai);
    };
  }, []);
  return null;
}
