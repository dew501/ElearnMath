import type { Metadata } from 'next';
import { JENIS, isJenis } from '@/lib/pengerjaan';

export function generateMetadata({ params }: { params: { type: string } }): Metadata {
  return { title: isJenis(params.type) ? JENIS[params.type].singkat : 'Pengerjaan' };
}

export default function PengerjaanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
