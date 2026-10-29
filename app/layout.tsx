import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AmbientBackground } from '@/components/ambient-bg';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'elearnMath - Platform Pembelajaran Matematika Modern',
    template: '%s · elearnMath',
  },
  description: 'Platform E-Learning Matematika Interaktif untuk Siswa dan Guru',
};

export const viewport: Viewport = {
  themeColor: '#13385E',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="relative min-h-screen">
        <AmbientBackground />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
