import React from 'react';
import Link from 'next/link';

/** Kartu tengah untuk halaman autentikasi sekunder (lupa / atur ulang kata sandi). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[440px] bg-white rounded-[28px] shadow-[0_30px_80px_rgba(27,78,128,0.16)] border border-white p-8 md:p-10 anim-pop">
        <Link href="/login" className="inline-flex items-center gap-2.5 mb-7 rounded-xl">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white flex items-center justify-center font-extrabold text-xl shadow-md shadow-blue-500/25">
            e
            <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-md bg-[#FFB454] text-[10px] text-white flex items-center justify-center font-black">π</span>
          </div>
          <span className="font-extrabold text-lg text-[#1B4E80]">
            elearn<span className="text-[#F0932B]">Math</span>
          </span>
        </Link>
        <h1 className="text-2xl font-extrabold text-[#1B4E80]">{title}</h1>
        <p className="text-sm text-[#66748C] mt-1.5 mb-6 leading-relaxed">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
