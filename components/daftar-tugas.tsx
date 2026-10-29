import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { JENIS, formatTanggal, type JenisPengerjaan } from '@/lib/pengerjaan';
import { evaluasiUntuk, muatDataSiswa } from '@/lib/siswa';
import { ArrowRight, Lock, Clock, CheckCircle2, RotateCcw, PenLine, ClipboardList, Award, MessageSquareQuote } from 'lucide-react';

const INFO: Record<JenisPengerjaan, { ikon: React.ElementType; ket: string; syarat?: { jenis: JenisPengerjaan; teks: string } }> = {
  lkpd: { ikon: ClipboardList, ket: 'Lembar kerja bertahap untuk membangun konsep. Kumpulkan LKPD tiap bab untuk membuka latihan soal.' },
  latihan: { ikon: PenLine, ket: 'Latihan mandiri setelah LKPD. Sekali kumpul per bab; nilai akhir diberikan guru.', syarat: { jenis: 'lkpd', teks: 'Kumpulkan LKPD bab ini dulu' } },
  evaluasi: { ikon: Award, ket: 'Evaluasi akhir setiap bab setelah latihan. Nilai akhir muncul setelah divalidasi guru.', syarat: { jenis: 'latihan', teks: 'Selesaikan latihan bab ini dulu' } },
};

/** Halaman daftar tugas siswa per jenis (LKPD / Latihan / Evaluasi) di semua bab. */
export async function DaftarTugas({ jenis }: { jenis: JenisPengerjaan }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const d = await muatDataSiswa(supabase, user.id, user.email);
  const info = INFO[jenis];
  const Ikon = info.ikon;

  const baris = d.materi.map((m) => {
    const k = jenis === 'evaluasi' ? evaluasiUntuk(d, m.id) : d.kiriman[jenis].get(m.id);
    const terkunci = info.syarat ? !d.kiriman[info.syarat.jenis].get(m.id) : false;
    const href = `/siswa/pengerjaan/${jenis}/${m.id}`;
    let status: { teks: string; kelas: string; ikon: React.ElementType };
    let aksi: { teks: string; href: string; utama: boolean };
    if (terkunci) {
      status = { teks: info.syarat!.teks, kelas: 'bg-[#F1F5F9] text-[#94A3B8]', ikon: Lock };
      aksi = { teks: `Buka ${JENIS[info.syarat!.jenis].singkat}`, href: `/siswa/pengerjaan/${info.syarat!.jenis}/${m.id}`, utama: false };
    } else if (!k) {
      status = { teks: 'Belum dikerjakan', kelas: 'bg-[#EAF6FF] text-[#2E7BC4]', ikon: PenLine };
      aksi = { teks: 'Kerjakan', href, utama: true };
    } else if (k.ulang) {
      status = { teks: 'Boleh dikerjakan ulang', kelas: 'bg-[#FFF1DD] text-[#B45309]', ikon: RotateCcw };
      aksi = { teks: 'Kerjakan Ulang', href, utama: true };
    } else if (k.final) {
      status = { teks: `Nilai ${k.score ?? '-'}`, kelas: 'bg-[#E4F8EE] text-[#15885A]', ikon: CheckCircle2 };
      aksi = { teks: 'Lihat Hasil', href, utama: false };
    } else {
      status = { teks: 'Menunggu koreksi guru', kelas: 'bg-[#FFF1DD] text-[#B45309]', ikon: Clock };
      aksi = { teks: 'Lihat Hasil', href, utama: false };
    }
    return { m, k, status, aksi };
  });
  const selesai = baris.filter((b) => b.k).length;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={JENIS[jenis].judul} userRole="siswa" userName={d.nama} />
      <SiswaNav />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1000px] w-full mx-auto">
        <section className="hero-navy p-6 md:p-7 mb-6 flex flex-col sm:flex-row sm:items-center gap-5 anim-rise">
          <span className="relative z-10 w-14 h-14 rounded-2xl bg-white/14 border border-white/25 text-[#FFCA80] flex items-center justify-center shrink-0 shadow-inner"><Ikon className="w-7 h-7" /></span>
          <div className="relative z-10 flex-1">
            <h1 className="text-2xl sm:text-[26px] font-extrabold tracking-[-0.02em] text-white">{JENIS[jenis].judul}</h1>
            <p className="text-xs sm:text-[13px] text-[#C8E1FA] mt-1 leading-relaxed">{info.ket}</p>
          </div>
          <div className="relative z-10 px-5 py-3 rounded-2xl bg-white/12 border border-white/20 backdrop-blur-md text-center shrink-0">
            <div className="text-3xl font-extrabold text-white tabular leading-none">{selesai}<span className="text-base text-[#9CC5EC]">/{d.materi.length}</span></div>
            <div className="text-xs font-bold text-[#FFCA80] mt-1">bab dikumpulkan</div>
          </div>
        </section>

        {d.materi.length === 0 ? (
          <div className="glass-card p-8 text-center"><p className="text-sm text-[#5A6B82]">Belum ada bab yang dibuka untuk kelasmu.</p></div>
        ) : (
          <div className="space-y-3.5">
            {baris.map(({ m, k, status, aksi }, i) => {
              const SIkon = status.ikon;
              return (
                <article key={m.id} className="glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise" style={{ ['--i' as string]: i + 1 }}>
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-13 h-13 w-[52px] h-[52px] rounded-2xl bg-gradient-to-br from-[#194B7E] to-[#0D2847] border border-[#2C68A6]/60 text-white flex flex-col items-center justify-center shrink-0 shadow-[0_8px_16px_-4px_rgba(13,40,71,0.36)]">
                      <span className="text-[8px] font-bold uppercase tracking-wider text-[#FFCA80]">Bab</span>
                      <span className="text-lg font-extrabold leading-none tabular mt-0.5">{m.chapter_number}</span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-extrabold text-[#0E2A48] line-clamp-2">{JENIS[jenis].singkat} — {m.title}</h2>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${status.kelas}`}><SIkon className="w-3 h-3" /> {status.teks}</span>
                        {k?.waktu && <span className="text-xs font-medium text-[#7C8DA4]">Dikumpulkan {formatTanggal(k.waktu)}</span>}
                      </div>
                      {k?.final && k.feedback && (
                        <p className="text-xs text-[#435368] mt-2 flex gap-1.5"><MessageSquareQuote className="w-3.5 h-3.5 text-[#256DB3] shrink-0 mt-px" /> <span className="line-clamp-2">{k.feedback}</span></p>
                      )}
                    </div>
                  </div>
                  <Link href={aksi.href} className={`group shrink-0 inline-flex items-center justify-center gap-1.5 text-[13px] font-bold px-4 py-2.5 rounded-xl ${aksi.utama ? 'btn-primary' : 'btn-secondary'}`}>
                    {aksi.teks} <ArrowRight className="w-4 h-4 transition-transform duration-150 ease-[var(--ease-out)] sm:group-hover:translate-x-0.5" />
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
