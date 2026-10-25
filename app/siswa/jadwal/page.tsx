import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { JadwalMingguan } from '@/components/jadwal-mingguan';
import { JENIS_AGENDA } from '@/components/agenda-jenis';
import { jamPendek, labelHariRelatif, selisihHari, tanggalIni, tanggalPanjang } from '@/lib/waktu';
import { CalendarDays, AlertTriangle, Inbox } from 'lucide-react';

export const metadata: Metadata = { title: 'Jadwal Pelajaran' };

export default async function JadwalSiswaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profil }, { data: ang }] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('kelas_anggota').select('kelas:kelas_id(id, nama)').eq('user_id', user.id).eq('peran', 'siswa').maybeSingle(),
  ]);
  const kelas = (ang as any)?.kelas as { id: string; nama: string } | null;
  const [jadwalRes, agendaRes] = kelas
    ? await Promise.all([
        supabase.from('jadwal').select('id, hari, jam_mulai, jam_selesai, mapel, ruang, guru:guru_id(full_name)').eq('kelas_id', kelas.id),
        supabase.from('agenda').select('id, judul, deskripsi, tanggal, jam_mulai, jenis, materi:id_materi(chapter_number)').eq('kelas_id', kelas.id).gte('tanggal', tanggalIni(new Date(Date.now() - 7 * 86400000))).order('tanggal'),
      ])
    : [{ data: [] }, { data: [] }];
  const entri = ((jadwalRes.data ?? []) as any[]).map((j) => ({ ...j, guru_nama: j.guru?.full_name ?? null }));
  const agenda = (agendaRes.data ?? []) as any[];
  const mendatang = agenda.filter((a) => selisihHari(a.tanggal) >= 0);
  const lalu = agenda.filter((a) => selisihHari(a.tanggal) < 0).reverse();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Jadwal Pelajaran" userRole="siswa" userName={profil?.full_name || user.email?.split('@')[0] || 'Siswa'} />
      <SiswaNav />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto space-y-6">
        <section className="anim-rise">
          <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2 mb-1"><CalendarDays className="w-6 h-6 text-[#2E7BC4]" /> Jadwal Pelajaran {kelas ? `Kelas ${kelas.nama}` : ''}</h1>
          <p className="text-xs text-[#66748C] mb-4">Jadwal mingguan mata pelajaran matematika di kelasmu.</p>
          {!kelas ? (
            <div className="p-4 rounded-2xl bg-[#FFF8EC] border border-[#FBD38D] text-xs font-semibold text-[#92400E] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Kamu belum dimasukkan ke kelas. Hubungi admin sekolah agar jadwal dan agenda kelas tampil di sini.
            </div>
          ) : (
            <div className="glass-card p-4 sm:p-5"><JadwalMingguan entri={entri} tampil="kelas" kosong="Belum ada jadwal untuk kelasmu." /></div>
          )}
        </section>

        {kelas && (
          <section className="anim-rise" style={{ ['--i' as string]: 1 }}>
            <h2 className="text-xl font-extrabold text-[#1B4E80] mb-1">Agenda & Tenggat</h2>
            <p className="text-xs text-[#66748C] mb-4">Kegiatan, tenggat tugas, dan ujian yang dibuat gurumu.</p>
            {mendatang.length === 0 ? (
              <div className="glass-card p-8 text-center"><Inbox className="w-10 h-10 text-[#BFDBFE] mx-auto mb-2" /><p className="text-sm font-semibold text-[#1B4E80]">Tidak ada agenda mendatang.</p></div>
            ) : (
              <ul className="space-y-2">
                {mendatang.map((a) => {
                  const j = JENIS_AGENDA[a.jenis] ?? JENIS_AGENDA.lainnya;
                  const Ikon = j.ikon;
                  const dekat = selisihHari(a.tanggal) <= 2;
                  return (
                    <li key={a.id} className={`glass-card p-4 flex gap-4 items-start ${dekat ? 'ring-2 ring-[#FFB454]/50' : ''}`}>
                      <span className="w-14 shrink-0 text-center rounded-2xl bg-white border border-[#DCEAF7] py-2">
                        <span className="block text-[10px] font-bold text-[#2E7BC4] uppercase">{new Date(`${a.tanggal}T00:00:00+07:00`).toLocaleDateString('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' })}</span>
                        <span className="block text-xl font-extrabold text-[#1B4E80] leading-none tabular">{Number(a.tanggal.slice(8, 10))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${j.warna}`}><Ikon className="w-3 h-3" /> {j.label}</span>
                          <span className={`text-[10px] font-semibold ${dekat ? 'text-[#B45309]' : 'text-[#94A3B8]'}`}>{labelHariRelatif(a.tanggal)}</span>
                        </span>
                        <span className="block text-sm font-extrabold text-[#1F2A37] mt-1">{a.judul}</span>
                        {a.deskripsi && <span className="block text-xs text-[#4B5A70] mt-0.5 whitespace-pre-wrap">{a.deskripsi}</span>}
                        <span className="block text-[11px] text-[#94A3B8] mt-1">{tanggalPanjang(a.tanggal)}{a.jam_mulai ? ` · ${jamPendek(a.jam_mulai)}` : ''}{a.materi?.chapter_number ? ` · Bab ${a.materi.chapter_number}` : ''}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {lalu.length > 0 && (
              <details className="mt-4">
                <summary className="text-xs font-bold text-[#2E7BC4] cursor-pointer">Agenda minggu lalu ({lalu.length})</summary>
                <ul className="mt-2 space-y-1.5 opacity-75">
                  {lalu.map((a) => <li key={a.id} className="text-xs text-[#4B5A70]">{tanggalPanjang(a.tanggal)} — <strong>{a.judul}</strong></li>)}
                </ul>
              </details>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
