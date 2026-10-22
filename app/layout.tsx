import type { Metadata } from 'next';
import './globals.css';
import { AmbientBackground } from '@/components/ambient-bg';

export const metadata: Metadata = {
  title: 'elearnMath - Platform Pembelajaran Matematika Modern',
  description: 'Platform E-Learning Matematika Interaktif untuk Siswa dan Guru',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="relative min-h-screen">
        <AmbientBackground />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
