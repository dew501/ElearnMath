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

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[960px] w-full mx-auto">
        <section className="glass-card p-6 md:p-7 mb-6 flex flex-col sm:flex-row sm:items-center gap-6 overflow-hidden relative anim-rise">
          <span className="absolute -right-4 -top-10 text-[150px] font-extrabold text-[#2E7BC4]/[0.05] select-none leading-none" aria-hidden="true">π</span>
          <div className="flex-1 relative">
            <h1 className="text-2xl md:text-[28px] font-extrabold text-[#1B4E80] leading-tight flex items-center gap-2"><BookOpen className="w-7 h-7 text-[#2E7BC4]" /> Modul Belajar</h1>
            <p className="text-sm text-[#66748C] mt-1.5 max-w-md">
              Pelajari materi per subbab, kumpulkan LKPD, lalu lanjutkan ke latihan dan evaluasi akhir setiap bab{d.kelas ? ` untuk kelas ${d.kelas.nama}` : ''}.
            </p>
          </div>
          {d.materi.length > 0 && (
            <div className="relative self-center">
              <ScoreRing value={babSelesai} max={d.materi.length} size={104} caption="Bab tuntas" tone="green" />
            </div>
          )}
        </section>

        {d.galatMateri ? (
          <div className="glass-card p-6 text-sm text-[#991B1B]">Daftar modul gagal dimuat. Silakan muat ulang halaman ini.</div>
        ) : d.materi.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-4xl font-extrabold text-[#2E7BC4]/30 mb-2" aria-hidden="true">∅</div>
            <p className="text-sm text-[#66748C]">Belum ada modul yang dibuka guru untuk kelasmu.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {d.materi.map((m, i) => {
              const l = d.kiriman.lkpd.get(m.id);
              const t = d.kiriman.latihan.get(m.id);
              const ev = evaluasiUntuk(d, m.id);
              const subbab = jumlahSubbab(m);
              const langkah = langkahBerikut(d, m);
              const chip = (ok: boolean, label: string) => (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${ok ? 'bg-[#E4F8EE] text-[#15885A]' : 'bg-[#F1F5F9] text-[#94A3B8]'}`}>
                  {ok && <Check className="w-3 h-3" strokeWidth={3} />} {label}
                </span>
              );
              return (
                <article key={m.id} className="glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise" style={{ ['--i' as string]: i + 1 }}>
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D3ECFF] to-[#EAF6FF] border border-white text-[#1B4E80] flex flex-col items-center justify-center shrink-0 shadow-sm">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#2E7BC4]">Bab</span>
                      <span className="text-xl font-extrabold leading-none tabular">{m.chapter_number}</span>
                    </div>
                    <div className="min-w-0">
                      <Link href={`/siswa/materi/${m.id}`} className="font-extrabold text-[#1B4E80] hover:text-[#2E7BC4] transition-colors line-clamp-2">{m.title}</Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {subbab > 0 && <span className="text-[11px] font-semibold text-[#66748C] mr-1">{subbab} subbab</span>}
                        {chip(!!l, 'LKPD')}
                        {chip(!!t, 'Latihan')}
                        {chip(!!ev, 'Evaluasi')}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={langkah.href}
                    className={`btn-press group shrink-0 inline-flex items-center justify-center gap-1.5 text-[13px] font-bold px-4 py-2.5 rounded-xl ${
                      langkah.selesai ? 'bg-white border border-[#DCEAF7] text-[#1B4E80] hover:border-[#2E7BC4]' : 'bg-[#2E7BC4] hover:bg-[#1B4E80] text-white shadow-[0_6px_16px_rgba(46,123,196,0.28)]'
                    }`}
                  >
                    {langkah.teks}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
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
