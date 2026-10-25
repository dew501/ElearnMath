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
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[980px] w-full mx-auto">
        <div className="mb-6 anim-rise">
          <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2"><ClipboardList className="w-6 h-6 text-[#F0932B]" /> LKPD Konstruktivis</h1>
          <p className="text-xs text-[#66748C] mt-1 max-w-2xl">
            Susun LKPD tiap bab: tujuan pembelajaran, petunjuk pengerjaan, dan tahapan kegiatan (orientasi → eksplorasi → membangun konsep → menyimpulkan → refleksi) beserta soal di setiap tahap.
          </p>
        </div>
        {!materi ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}</div>
        ) : materi.length === 0 ? (
          <div className="glass-card p-10 text-center"><Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" /><p className="text-sm font-semibold text-[#1B4E80]">Belum ada materi. Tambahkan bab di menu Materi.</p></div>
        ) : (
          <div className="space-y-3">
            {materi.map((m, i) => {
              const l = lkpd[m.id];
              const tahapan = tahapanDari(l?.tahapan);
              const s = soal.filter((q) => q.id_materi === m.id);
              const umum = soal.filter((q) => !q.id_materi);
              const total = [...s, ...umum].reduce((a, q) => a + bobotSoal(q), 0);
              const bertahap = s.filter((q) => q.tahap && tahapan.some((t) => t.kunci === q.tahap)).length;
              const siap = !!l && !!l.petunjuk?.trim() && s.length > 0;
              return (
                <article key={m.id} className="glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise" style={{ ['--i' as string]: i }}>
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFF1DD] to-[#FFF8EC] border border-white text-[#B45309] flex flex-col items-center justify-center shrink-0 shadow-sm">
                    <span className="text-[9px] font-bold uppercase tracking-wider">Bab</span>
                    <span className="text-xl font-extrabold leading-none tabular">{m.chapter_number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-extrabold text-[#1B4E80] truncate">{l?.judul || `LKPD ${m.title}`}</h2>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] font-semibold">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${siap ? 'bg-[#E4F8EE] text-[#15885A]' : 'bg-[#FFF1DD] text-[#B45309]'}`}>
                        {siap ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />} {siap ? 'Siap dipakai' : !l ? 'Belum disusun' : !s.length ? 'Belum ada soal' : 'Petunjuk belum diisi'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EAF6FF] text-[#1B4E80]"><Layers className="w-3 h-3" /> {tahapan.length} tahap · {bertahap}/{s.length} soal bertahap</span>
                      <span className={`px-2 py-0.5 rounded-full ${total === 100 ? 'bg-[#E4F8EE] text-[#15885A]' : 'bg-[#F1F5F9] text-[#4B5A70]'}`}>total bobot {total}</span>
                    </div>
                  </div>
                  <Link href={`/guru/lkpd/${m.id}`} className="btn-press shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-xs font-bold">
                    Susun LKPD <ArrowRight className="w-3.5 h-3.5" />
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
