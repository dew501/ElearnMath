import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { ScoreRing } from '@/components/ui/score-ring';
import { JENIS_AGENDA } from '@/components/agenda-jenis';
import { evaluasiUntuk, langkahBerikut, muatDataSiswa } from '@/lib/siswa';
import { HARI, hariIni, jamPendek, labelHariRelatif, tanggalIni, waktuRelatif } from '@/lib/waktu';
import { ArrowRight, Sparkles, School, CalendarDays, Megaphone, MessageSquareText, RotateCcw, Check, Star, Clock, Rocket, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = { title: 'Beranda' };

function sapaan(): string {
  const jam = Number(new Intl.DateTimeFormat('id-ID', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (jam < 11) return 'Selamat pagi';
  if (jam < 15) return 'Selamat siang';
  if (jam < 19) return 'Selamat sore';
  return 'Selamat malam';
}

export default async function BerandaSiswaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const d = await muatDataSiswa(supabase, user.id, user.email);
  const [jadwalRes, agendaRes, pengumumanRes] = await Promise.all([
    d.kelas ? supabase.from('jadwal').select('id, hari, jam_mulai, jam_selesai, mapel, ruang, guru:guru_id(full_name)').eq('kelas_id', d.kelas.id).eq('hari', hariIni()).order('jam_mulai') : Promise.resolve({ data: [] }),
    d.kelas ? supabase.from('agenda').select('id, judul, tanggal, jam_mulai, jenis').eq('kelas_id', d.kelas.id).gte('tanggal', tanggalIni()).order('tanggal').limit(4) : Promise.resolve({ data: [] }),
    supabase.from('pengumuman').select('id, judul, isi, penting, nama_pembuat, created_at').order('created_at', { ascending: false }).limit(3),
  ]);

  const babSelesai = d.materi.filter((m) => langkahBerikut(d, m).selesai).length;
  const lanjut = d.materi.map((m) => ({ m, l: langkahBerikut(d, m) })).find((x) => !x.l.selesai);

  const kabar = d.materi.flatMap((m) => {
    const out: { key: string; jenis: 'ulang' | 'nilai'; teks: string; catatan?: string | null; href: string }[] = [];
    const l = d.kiriman.lkpd.get(m.id);
    const t = d.kiriman.latihan.get(m.id);
    const ev = evaluasiUntuk(d, m.id);
    if (l?.ulang) out.push({ key: `u-${m.id}`, jenis: 'ulang', teks: `Guru mengizinkan Anda mengerjakan ulang LKPD Bab ${m.chapter_number}.`, catatan: l.feedback, href: `/siswa/pengerjaan/lkpd/${m.id}` });
    else if (l?.final) out.push({ key: `l-${m.id}`, jenis: 'nilai', teks: `Nilai LKPD Bab ${m.chapter_number}: ${l.score ?? '-'}`, catatan: l.feedback, href: `/siswa/pengerjaan/lkpd/${m.id}` });
    if (t?.final) out.push({ key: `t-${m.id}`, jenis: 'nilai', teks: `Nilai Latihan Bab ${m.chapter_number}: ${t.score ?? '-'}`, catatan: t.feedback, href: `/siswa/pengerjaan/latihan/${m.id}` });
    if (ev?.final) out.push({ key: `e-${m.id}`, jenis: 'nilai', teks: `Nilai Evaluasi Bab ${m.chapter_number}: ${ev.score ?? '-'}`, catatan: ev.feedback, href: `/siswa/pengerjaan/evaluasi/${m.id}` });
    return out;
  });

  const jadwalHariIni = (jadwalRes.data ?? []) as any[];
  const agenda = (agendaRes.data ?? []) as { id: string; judul: string; tanggal: string; jam_mulai: string | null; jenis: string }[];
  const pengumuman = (pengumumanRes.data ?? []) as { id: string; judul: string; isi: string; penting: boolean; nama_pembuat: string | null; created_at: string }[];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Beranda Siswa" userRole="siswa" userName={d.nama} />
      <SiswaNav />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <section className="glass-card p-6 md:p-7 mb-6 flex flex-col sm:flex-row sm:items-center gap-6 overflow-hidden relative anim-rise">
          <span className="absolute -right-4 -top-10 text-[150px] font-extrabold text-[#2E7BC4]/[0.05] select-none leading-none" aria-hidden="true">∫</span>
          <div className="flex-1 relative">
            <div className="text-xs font-bold text-[#F0932B] uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><Sparkles className="w-3.5 h-3.5" /> {sapaan()}</div>
            <h1 className="text-2xl md:text-[28px] font-extrabold text-[#1B4E80] leading-tight">Halo, {d.nama}!</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {d.kelas ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D3ECFF] text-[#1B4E80] font-bold"><School className="w-3.5 h-3.5" /> Kelas {d.kelas.nama}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF1DD] text-[#B45309] font-bold"><AlertTriangle className="w-3.5 h-3.5" /> Belum masuk kelas — hubungi admin</span>
              )}
              {d.guru.length > 0 && <span className="text-[#66748C]">Guru: <strong className="text-[#1B4E80]">{d.guru.join(', ')}</strong></span>}
            </div>
          </div>
          {d.materi.length > 0 && (
            <div className="relative self-center">
              <ScoreRing value={babSelesai} max={d.materi.length} size={104} caption="Bab tuntas" tone="green" />
            </div>
          )}
        </section>

        {lanjut && (
          <Link href={lanjut.l.href} className="group glass-card card-hover p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 border-2 border-[#BFDBFE] anim-rise" style={{ ['--i' as string]: 1 }}>
            <span className="flex items-center gap-4 flex-1 min-w-0">
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white flex items-center justify-center shrink-0 shadow-md"><Rocket className="w-6 h-6" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] font-bold text-[#2E7BC4] uppercase tracking-wider">Lanjutkan belajar</span>
                <span className="block text-base font-extrabold text-[#1B4E80] line-clamp-2 sm:truncate">Bab {lanjut.m.chapter_number}: {lanjut.m.title}</span>
              </span>
            </span>
            <span className="btn-press shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] text-white text-[13px] font-bold">
              {lanjut.l.teks} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="glass-card p-5 anim-rise" style={{ ['--i' as string]: 2 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Jadwal Hari Ini · {HARI[hariIni()]}</h2>
              <Link href="/siswa/jadwal" className="text-xs font-bold text-[#2E7BC4] hover:underline">Jadwal lengkap</Link>
            </div>
            {jadwalHariIni.length === 0 ? (
              <p className="text-sm text-[#66748C] py-4 text-center">{d.kelas ? 'Tidak ada pelajaran matematika hari ini.' : 'Jadwal tampil setelah kamu masuk kelas.'}</p>
            ) : (
              <ul className="space-y-2">
                {jadwalHariIni.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-[#E6EEF7]">
                    <span className="text-xs font-extrabold text-[#2E7BC4] tabular flex items-center gap-1 shrink-0"><Clock className="w-3.5 h-3.5" /> {jamPendek(j.jam_mulai)}–{jamPendek(j.jam_selesai)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[#1F2A37]">{j.mapel}</span>
                      <span className="block text-[11px] text-[#66748C] truncate">{j.guru?.full_name ?? ''}{j.ruang ? ` · ${j.ruang}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {agenda.length > 0 && (
              <>
                <h3 className="text-xs font-extrabold text-[#1B4E80] mt-4 mb-2">Agenda & tenggat terdekat</h3>
                <ul className="space-y-1.5">
                  {agenda.map((a) => {
                    const j = JENIS_AGENDA[a.jenis] ?? JENIS_AGENDA.lainnya;
                    const Ikon = j.ikon;
                    return (
                      <li key={a.id} className="flex items-center gap-2 text-xs">
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full shrink-0 ${j.warna}`}><Ikon className="w-3 h-3" /> {labelHariRelatif(a.tanggal)}</span>
                        <span className="font-semibold text-[#1F2A37] truncate">{a.judul}{a.jam_mulai ? ` · ${jamPendek(a.jam_mulai)}` : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="glass-card p-5 anim-rise" style={{ ['--i' as string]: 3 }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><Megaphone className="w-4 h-4" /> Pengumuman</h2>
              <Link href="/siswa/pengumuman" className="text-xs font-bold text-[#2E7BC4] hover:underline">Semua</Link>
            </div>
            {pengumuman.length === 0 ? (
              <p className="text-sm text-[#66748C] py-4 text-center">Belum ada pengumuman.</p>
            ) : (
              <ul className="space-y-2">
                {pengumuman.map((p) => (
                  <li key={p.id}>
                    <Link href="/siswa/pengumuman" className={`block p-3 rounded-xl bg-white/80 border hover:border-[#2E7BC4] transition-colors ${p.penting ? 'border-[#FECACA]' : 'border-[#E6EEF7]'}`}>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-[#1F2A37]">{p.penting && <Star className="w-3.5 h-3.5 text-[#C2412E] shrink-0" />}<span className="truncate">{p.judul}</span></span>
                      <span className="block text-[11px] text-[#66748C] line-clamp-1 mt-0.5">{p.isi}</span>
                      <span className="block text-[10px] text-[#94A3B8] mt-0.5">{p.nama_pembuat} · {waktuRelatif(p.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {kabar.length > 0 && (
          <section className="mt-6 anim-rise" style={{ ['--i' as string]: 4 }} aria-label="Kabar dari guru">
            <h2 className="text-xs font-bold text-[#1B4E80] uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><MessageSquareText className="w-4 h-4" /> Kabar dari Guru</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {kabar.slice(0, 6).map((k) => (
                <Link key={k.key} href={k.href} className={`card-hover flex items-start gap-3 p-4 rounded-2xl border bg-white/85 backdrop-blur ${k.jenis === 'ulang' ? 'border-[#FBD38D]' : 'border-[#BBF7D0]'}`}>
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.jenis === 'ulang' ? 'bg-[#FFF1DD] text-[#E37A12]' : 'bg-[#E4F8EE] text-[#15885A]'}`}>
                    {k.jenis === 'ulang' ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-[#1F2A37]">{k.teks}</span>
                    {k.catatan && <span className="block text-xs text-[#66748C] mt-0.5 truncate">&ldquo;{k.catatan}&rdquo;</span>}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] mt-2.5 shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
