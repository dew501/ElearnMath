import type { Metadata } from 'next';
import { DaftarTugas } from '@/components/daftar-tugas';

export const metadata: Metadata = { title: 'Evaluasi' };

export default function Page() {
  return <DaftarTugas jenis="evaluasi" />;
}
