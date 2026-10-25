import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { JENIS, type JenisPengerjaan } from '@/lib/pengerjaan';
import { evaluasiUntuk, muatDataSiswa, type Kiriman } from '@/lib/siswa';
import { BarChart3, MessageSquareQuote, Trophy } from 'lucide-react';

export const metadata: Metadata = { title: 'Daftar Nilai' };
const JENIS_URUT: JenisPengerjaan[] = ['lkpd', 'latihan', 'evaluasi'];

export default async function DaftarNilaiPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const d = await muatDataSiswa(supabase, user.id, user.email);

  const ambil = (id: string, j: JenisPengerjaan): Kiriman | undefined => (j === 'evaluasi' ? evaluasiUntuk(d, id) : d.kiriman[j].get(id));
  const semuaFinal = d.materi.flatMap((m) => JENIS_URUT.map((j) => ambil(m.id, j)).filter((k): k is Kiriman => !!k?.final && k.score !== null));
  const rata = semuaFinal.length ? Math.round((semuaFinal.reduce((a, k) => a + Number(k.score), 0) / semuaFinal.length) * 10) / 10 : null;
  const rataJenis = (j: JenisPengerjaan) => {
    const x = d.materi.map((m) => ambil(m.id, j)).filter((k): k is Kiriman => !!k?.final && k.score !== null);
    return x.length ? Math.round((x.reduce((a, k) => a + Number(k.score), 0) / x.length) * 10) / 10 : null;
  };
  const catatan = d.materi.flatMap((m) =>
    JENIS_URUT.map((j) => ({ m, j, k: ambil(m.id, j) })).filter((x) => x.k?.final && x.k.feedback)
  );
  const warna = (n: number) => (n >= 75 ? 'text-[#15885A]' : n >= 60 ? 'text-[#B45309]' : 'text-[#C2412E]');

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Daftar Nilai" userRole="siswa" userName={d.nama} />
      <SiswaNav />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[960px] w-full mx-auto">
        <section className="glass-card p-6 md:p-7 mb-6 flex flex-col sm:flex-row sm:items-center gap-5 anim-rise">
          <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-white flex items-center justify-center shrink-0 shadow-md"><Trophy className="w-7 h-7" /></span>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-[#1B4E80]">Daftar Nilai</h1>
            <p className="text-sm text-[#66748C] mt-1">Nilai akhir dari guru untuk setiap tugas. Tugas yang belum dinilai ditandai &ldquo;menunggu&rdquo;.</p>
          </div>
          <div className="text-center shrink-0">
            <div className={`text-4xl font-extrabold tabular leading-none ${rata !== null ? warna(rata) : 'text-[#94A3B8]'}`}>{rata ?? '–'}</div>
            <div className="text-[11px] font-semibold text-[#66748C] mt-1">rata-rata nilai</div>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {JENIS_URUT.map((j) => {
            const r = rataJenis(j);
            return (
              <div key={j} className="glass-card p-4">
                <div className="text-[11px] font-bold text-[#66748C] uppercase tracking-wider">{JENIS[j].singkat}</div>
                <div className="text-2xl font-extrabold text-[#1B4E80] tabular mt-1">{r ?? '–'}</div>
                <div className="h-1.5 rounded-full bg-[#E6EEF7] mt-2 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#5FA8E8] to-[#2E7BC4]" style={{ width: `${r ?? 0}%` }} /></div>
              </div>
            );
          })}
        </div>

        {d.materi.length === 0 ? (
          <div className="glass-card p-8 text-center"><p className="text-sm text-[#66748C]">Belum ada nilai.</p></div>
        ) : (
          <div className="glass-card overflow-hidden anim-rise">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-[#F4F9FF] text-[#1B4E80] text-xs">
                  <tr>
                    <th className="text-left px-4 py-3">Bab</th>
                    {JENIS_URUT.map((j) => <th key={j} className="px-3 py-3">{JENIS[j].singkat}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.materi.map((m) => (
                    <tr key={m.id} className="border-t border-[#F1F5F9]">
                      <td className="px-4 py-3">
                        <Link href={`/siswa/materi/${m.id}`} className="font-bold text-[#1B4E80] hover:underline">Bab {m.chapter_number}</Link>
                        <span className="block text-[11px] text-[#66748C] line-clamp-1">{m.title}</span>
                      </td>
                      {JENIS_URUT.map((j) => {
                        const k = ambil(m.id, j);
                        return (
                          <td key={j} className="px-3 py-3 text-center">
                            <Link href={`/siswa/pengerjaan/${j}/${m.id}`} className="inline-block min-w-[60px]">
                              {!k ? (
                                <span className="text-[#CBD5E1]">–</span>
                              ) : k.final ? (
                                <span className={`text-lg font-extrabold tabular ${warna(Number(k.score))}`}>{k.score}</span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF1DD] text-[#B45309]">{k.ulang ? 'boleh ulang' : 'menunggu'}</span>
                              )}
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {catatan.length > 0 && (
          <section className="mt-6 anim-rise">
            <h2 className="text-xs font-bold text-[#1B4E80] uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Catatan dari Guru</h2>
            <ul className="space-y-2">
              {catatan.map(({ m, j, k }) => (
                <li key={m.id + j} className="glass-card p-4 flex gap-3">
                  <MessageSquareQuote className="w-5 h-5 text-[#2E7BC4] shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-[#1B4E80]">{JENIS[j].singkat} Bab {m.chapter_number} · nilai {k!.score}</div>
                    <p className="text-sm text-[#1F2A37] mt-0.5">{k!.feedback}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
