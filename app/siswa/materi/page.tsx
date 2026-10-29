import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { ScoreRing } from '@/components/ui/score-ring';
import { evaluasiUntuk, jumlahSubbab, langkahBerikut, muatDataSiswa } from '@/lib/siswa';
import { BookOpen, ArrowRight, Check } from 'lucide-react';

export const metadata: Metadata = { title: 'Materi Belajar' };

export default async function DaftarMateriPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const d = await muatDataSiswa(supabase, user.id, user.email);
  const babSelesai = d.materi.filter((m) => langkahBerikut(d, m).selesai).length;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Materi Belajar" userRole="siswa" userName={d.nama} />
      <SiswaNav />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1000px] w-full mx-auto">
        <section className="hero-navy p-6 md:p-8 mb-6 flex flex-col sm:flex-row sm:items-center gap-6 relative anim-rise">
          <span className="font-mono absolute right-5 -bottom-6 text-[150px] font-extrabold text-white/[0.06] select-none leading-none pointer-events-none" aria-hidden="true">π</span>
          <div className="flex-1 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-xs font-bold text-[#FFCA80] mb-3">
              Alur Belajar Terstruktur · {d.materi.length} Bab
            </div>
            <h1 className="text-2xl md:text-[28px] font-extrabold tracking-[-0.02em] text-white leading-tight flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-white/14 border border-white/25 flex items-center justify-center text-[#FFCA80] shadow-inner shrink-0"><BookOpen className="w-5 h-5" /></span>
              Modul Belajar Matematika
            </h1>
            <p className="text-xs sm:text-[13px] text-[#C8E1FA] mt-1.5 max-w-lg leading-relaxed">
              Pelajari materi per subbab, kumpulkan LKPD, lalu lanjutkan ke latihan dan evaluasi akhir setiap bab{d.kelas ? ` untuk kelas ${d.kelas.nama}` : ''}.
            </p>
          </div>
          {d.materi.length > 0 && (
            <div className="relative z-10 self-center bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3 border border-white shadow-[0_14px_30px_-8px_rgba(6,19,36,0.42)]">
              <ScoreRing value={babSelesai} max={d.materi.length} size={98} caption="Bab tuntas" tone="green" />
            </div>
          )}
        </section>

        {d.galatMateri ? (
          <div className="glass-card p-6 text-sm text-[#991B1B]">Daftar modul gagal dimuat. Silakan muat ulang halaman ini.</div>
        ) : d.materi.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-4xl font-extrabold text-[#256DB3]/30 mb-2" aria-hidden="true">∅</div>
            <p className="text-sm text-[#5A6B82]">Belum ada modul yang dibuka guru untuk kelasmu.</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {d.materi.map((m, i) => {
              const l = d.kiriman.lkpd.get(m.id);
              const t = d.kiriman.latihan.get(m.id);
              const ev = evaluasiUntuk(d, m.id);
              const subbab = jumlahSubbab(m);
              const langkah = langkahBerikut(d, m);
              const chip = (ok: boolean, label: string) => (
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${ok ? 'bg-[#E3F7EE] border-[#B4E7CE] text-[#127A4D]' : 'bg-[#F3F7FB] border-[#DCE8F5] text-[#7C8DA4]'}`}>
                  {ok && <Check className="w-3 h-3" strokeWidth={3} />} {label}
                </span>
              );
              return (
                <article key={m.id} className="glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise" style={{ ['--i' as string]: i + 1 }}>
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#194B7E] to-[#0D2847] border border-[#2C68A6]/60 text-white flex flex-col items-center justify-center shrink-0 shadow-[0_8px_16px_-4px_rgba(13,40,71,0.38)]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFCA80]">Bab</span>
                      <span className="text-xl font-extrabold leading-none tabular mt-0.5">{m.chapter_number}</span>
                    </div>
                    <div className="min-w-0">
                      <Link href={`/siswa/materi/${m.id}`} className="text-base font-extrabold text-[#0E2A48] hover:text-[#256DB3] transition-colors line-clamp-2">{m.title}</Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {subbab > 0 && <span className="text-xs font-bold text-[#133B63] bg-[#EDF5FD] border border-[#CDE1F6] px-2.5 py-0.5 rounded-full tabular">{subbab} subbab</span>}
                        {chip(!!l, 'LKPD')}
                        {chip(!!t, 'Latihan')}
                        {chip(!!ev, 'Evaluasi')}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={langkah.href}
                    className={`group shrink-0 inline-flex items-center justify-center gap-1.5 text-[13px] font-bold px-4 py-2.5 rounded-xl ${
                      langkah.selesai ? 'btn-secondary' : 'btn-primary'
                    }`}
                  >
                    {langkah.teks}
                    <ArrowRight className="w-4 h-4 transition-transform duration-150 ease-[var(--ease-out)] sm:group-hover:translate-x-0.5" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
