import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card p-8 md:p-10 max-w-md w-full text-center anim-pop">
        <div className="font-extrabold text-[#1B4E80] mb-1 flex items-center justify-center gap-3 tabular" aria-hidden="true">
          <span className="text-6xl">4</span>
          <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-white text-3xl flex items-center justify-center rotate-6 shadow-lg">∅</span>
          <span className="text-6xl">4</span>
        </div>
        <p className="text-xs font-mono text-[#94A3B8] mb-4" aria-hidden="true">halaman ∉ elearnMath</p>
        <h1 className="text-xl font-extrabold text-[#1B4E80] mb-2">Halaman tidak ditemukan</h1>
        <p className="text-sm text-[#66748C] mb-6">Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
        <Link href="/" className="btn-press inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm shadow-[0_6px_16px_rgba(46,123,196,0.3)]">
          <Home className="w-4 h-4" /> Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
