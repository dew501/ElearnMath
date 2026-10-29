import React from 'react';
import Link from 'next/link';

/** Kartu tengah untuk halaman autentikasi sekunder (lupa / atur ulang kata sandi). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[440px] bg-white/95 backdrop-blur-xl rounded-[28px] shadow-[0_1px_0_#ffffff_inset,0_0_0_1px_rgba(27,78,128,0.07),0_28px_72px_-12px_rgba(27,78,128,0.18)] border border-white p-8 md:p-10 anim-pop">
        <Link href="/login" className="group inline-flex items-center gap-2.5 mb-7 rounded-xl">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#3687D4] to-[#1B4E80] text-white flex items-center justify-center font-extrabold text-xl shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_6px_14px_-3px_rgba(27,78,128,0.35)] transition-transform duration-200 ease-[var(--ease-out)] sm:group-hover:-rotate-6">
            e
            <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-md bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-[11px] text-white flex items-center justify-center font-black ring-1 ring-white/80">π</span>
          </div>
          <span className="font-extrabold text-lg tracking-[-0.02em] text-[#1B4E80]">
            elearn<span className="text-[#F0932B]">Math</span>
          </span>
        </Link>
        <h1 className="text-2xl font-extrabold tracking-[-0.015em] text-[#1B4E80]">{title}</h1>
        <p className="text-sm text-[#66748C] mt-1.5 mb-6 leading-relaxed">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
