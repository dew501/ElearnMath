import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Kelola Pengguna' };

export default function PenggunaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
