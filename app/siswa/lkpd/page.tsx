import type { Metadata } from 'next';
import { DaftarTugas } from '@/components/daftar-tugas';

export const metadata: Metadata = { title: 'LKPD' };

export default function Page() {
  return <DaftarTugas jenis="lkpd" />;
}
