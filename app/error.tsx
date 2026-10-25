'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, WifiOff } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card p-8 md:p-10 max-w-md w-full text-center anim-pop">
        <div className="w-14 h-14 rounded-2xl bg-[#FDEAE7] text-[#E3543F] flex items-center justify-center mx-auto mb-4">
          <WifiOff className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-extrabold text-[#991B1B] mb-2">Terjadi gangguan</h1>
        <p className="text-sm text-[#66748C] mb-6">Halaman ini gagal dimuat. Periksa koneksi internet Anda lalu coba lagi.</p>
        <div className="flex justify-center gap-2.5 flex-wrap">
          <button
            onClick={reset}
            className="btn-press inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Coba Lagi
          </button>
          <Link href="/" className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-[#4B5A70] font-bold text-sm hover:border-[#2E7BC4]">
            Ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
