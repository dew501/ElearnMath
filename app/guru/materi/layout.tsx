import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Kelola Materi' };

export default function MateriGuruLayout({ children }: { children: React.ReactNode }) {
  return children;
}
