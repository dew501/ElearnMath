import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Kelola Kelas' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
