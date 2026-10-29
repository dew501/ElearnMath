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
        <section className="hero-navy p-6 md:p-8 mb-6 flex flex-col sm:flex-row sm:items-center gap-6 relative anim-rise">
          <span className="font-mono absolute right-4 -bottom-8 text-[160px] font-extrabold text-white/[0.06] select-none leading-none pointer-events-none" aria-hidden="true">∫</span>
          <div className="flex-1 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-xs font-bold text-[#FFCA80] mb-3">
              <Sparkles className="w-3.5 h-3.5" /> {sapaan()}
            </div>
            <h1 className="text-2xl md:text-[30px] font-extrabold tracking-[-0.02em] text-white leading-tight">Halo, {d.nama}!</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs">
              {d.kelas ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/14 border border-white/25 text-white font-bold backdrop-blur-sm"><School className="w-3.5 h-3.5 text-[#FFCA80]" /> Kelas {d.kelas.nama}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF1DD] border border-[#FBD38D] text-[#9A4E04] font-bold"><AlertTriangle className="w-3.5 h-3.5" /> Belum masuk kelas — hubungi admin</span>
              )}
              {d.guru.length > 0 && <span className="text-[#C8E1FA]">Guru pengampu: <strong className="text-white">{d.guru.join(', ')}</strong></span>}
            </div>
          </div>
          {d.materi.length > 0 && (
            <div className="relative z-10 self-center bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3 border border-white shadow-[0_14px_30px_-8px_rgba(6,19,36,0.42)]">
              <ScoreRing value={babSelesai} max={d.materi.length} size={98} caption="Bab tuntas" tone="green" />
            </div>
          )}
        </section>

        {lanjut && (
          <Link href={lanjut.l.href} className="group relative overflow-hidden glass-card card-hover p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 border-[#9AC5EE] bg-gradient-to-r from-white via-[#F7FBFF] to-[#EBF5FF] anim-rise" style={{ ['--i' as string]: 1 }}>
            <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#FFB454] via-[#256DB3] to-[#0E2A48]" aria-hidden="true" />
            <span className="flex items-center gap-4 flex-1 min-w-0 pl-1">
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2E7ECF] to-[#0E2A48] text-white flex items-center justify-center shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_10px_20px_-4px_rgba(14,42,72,0.4)]"><Rocket className="w-6 h-6 text-[#FFCA80]" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-extrabold text-[#256DB3]">Lanjutkan belajar</span>
                <span className="block text-base sm:text-lg font-extrabold text-[#0E2A48] line-clamp-2 sm:truncate">Bab {lanjut.m.chapter_number}: {lanjut.m.title}</span>
              </span>
            </span>
            <span className="btn-primary shrink-0 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-bold">
              {lanjut.l.teks} <ArrowRight className="w-4 h-4 transition-transform duration-150 ease-[var(--ease-out)] sm:group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="glass-card p-5 sm:p-6 anim-rise" style={{ ['--i' as string]: 2 }}>
            <div className="flex items-center justify-between mb-3.5 pb-3 border-b border-[#E3EEF9]">
              <h2 className="text-sm font-extrabold text-[#0E2A48] flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#E8F3FF] text-[#1D60A4] flex items-center justify-center"><CalendarDays className="w-4 h-4" /></span>
                Jadwal Hari Ini · {HARI[hariIni()]}
              </h2>
              <Link href="/siswa/jadwal" className="text-xs font-bold text-[#256DB3] hover:text-[#0E2A48] hover:underline">Jadwal lengkap</Link>
            </div>
            {jadwalHariIni.length === 0 ? (
              <p className="text-sm text-[#5A6B82] py-5 text-center">{d.kelas ? 'Tidak ada pelajaran matematika hari ini.' : 'Jadwal tampil setelah kamu masuk kelas.'}</p>
            ) : (
              <ul className="space-y-2.5">
                {jadwalHariIni.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#F5FAFF] border border-[#CFE3F7] border-l-4 border-l-[#256DB3]">
                    <span className="text-xs font-extrabold text-[#133B63] bg-white px-2.5 py-1 rounded-lg border border-[#CFE3F7] tabular flex items-center gap-1 shrink-0 shadow-sm"><Clock className="w-3.5 h-3.5 text-[#256DB3]" /> {jamPendek(j.jam_mulai)}–{jamPendek(j.jam_selesai)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[#0E2A48]">{j.mapel}</span>
                      <span className="block text-xs font-medium text-[#5A6B82] truncate">{j.guru?.full_name ?? ''}{j.ruang ? ` · ${j.ruang}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {agenda.length > 0 && (
              <>
                <h3 className="text-xs font-extrabold text-[#0E2A48] mt-4 mb-2">Agenda &amp; tenggat terdekat</h3>
                <ul className="space-y-1.5">
                  {agenda.map((a) => {
                    const j = JENIS_AGENDA[a.jenis] ?? JENIS_AGENDA.lainnya;
                    const Ikon = j.ikon;
                    return (
                      <li key={a.id} className="flex items-center gap-2 text-xs">
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full shrink-0 ${j.warna}`}><Ikon className="w-3 h-3" /> {labelHariRelatif(a.tanggal)}</span>
                        <span className="font-semibold text-[#162232] truncate">{a.judul}{a.jam_mulai ? ` · ${jamPendek(a.jam_mulai)}` : ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="glass-card p-5 sm:p-6 anim-rise" style={{ ['--i' as string]: 3 }}>
            <div className="flex items-center justify-between mb-3.5 pb-3 border-b border-[#E3EEF9]">
              <h2 className="text-sm font-extrabold text-[#0E2A48] flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#FFF2E0] text-[#D97208] flex items-center justify-center"><Megaphone className="w-4 h-4" /></span>
                Pengumuman Terbaru
              </h2>
              <Link href="/siswa/pengumuman" className="text-xs font-bold text-[#256DB3] hover:text-[#0E2A48] hover:underline">Semua</Link>
            </div>
            {pengumuman.length === 0 ? (
              <p className="text-sm text-[#5A6B82] py-5 text-center">Belum ada pengumuman.</p>
            ) : (
              <ul className="space-y-2.5">
                {pengumuman.map((p) => (
                  <li key={p.id}>
                    <Link href="/siswa/pengumuman" className={`block p-3.5 rounded-xl bg-[#F8FBFF] border hover:border-[#5FA8E8] hover:bg-white transition-colors ${p.penting ? 'border-[#F5C2BA] border-l-4 border-l-[#E04B37]' : 'border-[#D5E6F7] border-l-4 border-l-[#256DB3]'}`}>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-[#0E2A48]">{p.penting && <Star className="w-3.5 h-3.5 text-[#C2412E] shrink-0" />}<span className="truncate">{p.judul}</span></span>
                      <span className="block text-xs text-[#5A6B82] line-clamp-1 mt-0.5">{p.isi}</span>
                      <span className="block text-[11px] font-medium text-[#8798AE] mt-1">{p.nama_pembuat} · {waktuRelatif(p.created_at)}</span>
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
