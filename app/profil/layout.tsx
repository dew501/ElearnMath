import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Profil Saya' };

export default function ProfilLayout({ children }: { children: React.ReactNode }) {
  return children;
}
