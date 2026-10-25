import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Susun LKPD' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
