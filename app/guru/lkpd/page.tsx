'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { bobotSoal, tahapanDari, type Soal } from '@/lib/pengerjaan';
import { useProfil } from '@/lib/use-profil';
import { ClipboardList, ArrowRight, CheckCircle2, AlertTriangle, Inbox, Layers } from 'lucide-react';

interface Baris {
  id: string;
  chapter_number: number | null;
  title: string | null;
}

export default function DaftarLkpdPage() {
  const supabase = createClient();
  const profil = useProfil();
  const [materi, setMateri] = useState<Baris[] | null>(null);
  const [lkpd, setLkpd] = useState<Record<string, { judul: string | null; tujuan: string | null; petunjuk: string | null; tahapan: unknown }>>({});
  const [soal, setSoal] = useState<Soal[]>([]);

  useEffect(() => {
    (async () => {
      const [m, l, s] = await Promise.all([
        supabase.from('materi').select('id, chapter_number, title').order('chapter_number'),
        supabase.from('lkpd').select('id_materi, judul, tujuan, petunjuk, tahapan'),
        supabase.rpc('soal_dengan_kunci', { p_jenis: 'lkpd' }),
      ]);
      setMateri((m.data ?? []) as Baris[]);
      setLkpd(Object.fromEntries(((l.data ?? []) as any[]).map((x) => [x.id_materi, x])));
      setSoal((s.data ?? []) as Soal[]);
    })();
  }, [supabase]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Susun LKPD" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role === 'admin' ? 'admin' : profil ? 'guru' : null} />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1040px] w-full mx-auto">
        <div className="hero-navy p-6 sm:p-7 mb-6 anim-rise">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-xs font-bold text-[#FFCA80] mb-3">
              <Layers className="w-3.5 h-3.5" /> Alur Penemuan Terbimbing
            </div>
            <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-[-0.02em] flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-white/14 border border-white/25 flex items-center justify-center text-[#FFCA80] shadow-inner shrink-0">
                <ClipboardList className="w-5 h-5" />
              </span>
              LKPD Konstruktivis
            </h1>
            <p className="text-xs sm:text-[13px] text-[#C8E1FA] mt-1.5 max-w-2xl leading-relaxed">
              Susun LKPD tiap bab: tujuan pembelajaran, petunjuk pengerjaan, dan tahapan kegiatan (orientasi → eksplorasi → membangun konsep → menyimpulkan → refleksi) beserta soal di setiap tahap.
            </p>
          </div>
        </div>
        {!materi ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}</div>
        ) : materi.length === 0 ? (
          <div className="glass-card p-10 text-center"><Inbox className="w-12 h-12 text-[#9CC5EC] mx-auto mb-3" /><p className="text-sm font-bold text-[#0E2A48]">Belum ada materi. Tambahkan bab di menu Materi.</p></div>
        ) : (
          <div className="space-y-3.5">
            {materi.map((m, i) => {
              const l = lkpd[m.id];
              const tahapan = tahapanDari(l?.tahapan);
              const s = soal.filter((q) => q.id_materi === m.id);
              const umum = soal.filter((q) => !q.id_materi);
              const total = [...s, ...umum].reduce((a, q) => a + bobotSoal(q), 0);
              const bertahap = s.filter((q) => q.tahap && tahapan.some((t) => t.kunci === q.tahap)).length;
              const siap = !!l && !!l.petunjuk?.trim() && s.length > 0;
              return (
                <article key={m.id} className="group glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise" style={{ ['--i' as string]: i }}>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFAE42] to-[#D97208] border border-[#F59E0B]/40 text-white flex flex-col items-center justify-center shrink-0 shadow-[0_8px_16px_-4px_rgba(217,114,8,0.36)]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">Bab</span>
                    <span className="text-xl font-extrabold leading-none tabular mt-0.5">{m.chapter_number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-extrabold text-[#0E2A48] truncate">{l?.judul || `LKPD ${m.title}`}</h2>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs font-semibold">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border ${siap ? 'bg-[#E3F7EE] border-[#B4E7CE] text-[#127A4D]' : 'bg-[#FFF1DD] border-[#F6D29B] text-[#B45309]'}`}>
                        {siap ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {siap ? 'Siap dipakai' : !l ? 'Belum disusun' : !s.length ? 'Belum ada soal' : 'Petunjuk belum diisi'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EDF5FD] border border-[#CDE1F6] text-[#133B63] tabular"><Layers className="w-3 h-3" /> {tahapan.length} tahap · {bertahap}/{s.length} soal bertahap</span>
                      <span className={`tabular px-2.5 py-0.5 rounded-full border ${total === 100 ? 'bg-[#E3F7EE] border-[#B4E7CE] text-[#127A4D]' : 'bg-[#F1F5F9] border-[#DCE5F0] text-[#4B5A70]'}`}>total bobot {total}</span>
                    </div>
                  </div>
                  <Link href={`/guru/lkpd/${m.id}`} className="btn-primary shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold">
                    Susun LKPD <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 ease-[var(--ease-out)] sm:group-hover:translate-x-0.5" />
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
