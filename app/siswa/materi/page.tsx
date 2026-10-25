import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { ScoreRing } from '@/components/ui/score-ring';
import { BookOpen, ArrowRight, RotateCcw, MessageSquareText, Check, Sparkles } from 'lucide-react';

export const metadata: Metadata = { title: 'Daftar Modul' };

function sapaan(): string {
  const jam = Number(new Intl.DateTimeFormat('id-ID', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (jam < 11) return 'Selamat pagi';
  if (jam < 15) return 'Selamat siang';
  if (jam < 19) return 'Selamat sore';
  return 'Selamat malam';
}

export default async function DaftarMateriPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const [profileRes, materiRes, lkpdRes, latihanRes, evaluasiRes] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('materi').select('id, chapter_number, title, subbab_json').order('chapter_number', { ascending: true }),
    supabase.from('jawaban_lkpd').select('id_materi, status, score, feedback, allow_retake').eq('id_siswa', user.id),
    supabase.from('pengerjaan_latihan').select('id_materi, score, feedback').eq('id_siswa', user.id),
    supabase.from('pengerjaan_evaluasi').select('id_materi, score').eq('id_siswa', user.id),
  ]);

  const namaSiswa = profileRes.data?.full_name || user.email?.split('@')[0] || 'Siswa';
  const materiList = materiRes.data ?? [];
  const lkpd = new Map((lkpdRes.data ?? []).map((r) => [r.id_materi, r]));
  const latihan = new Map((latihanRes.data ?? []).map((r) => [r.id_materi, r]));
  // Evaluasi tercatat per bab; baris lama tanpa id_materi dianggap berlaku untuk semua bab.
  const evaluasiRows = evaluasiRes.data ?? [];
  const evaluasiUntuk = (idMateri: string) => evaluasiRows.find((r) => r.id_materi === idMateri || r.id_materi === null) ?? null;
  const babSelesai = materiList.filter((m) => lkpd.has(m.id) && latihan.has(m.id) && evaluasiUntuk(m.id)).length;

  // Kabar dari guru: izin kerjakan ulang & nilai yang sudah diberikan
  const kabar = materiList.flatMap((m) => {
    const out: { key: string; jenis: 'ulang' | 'nilai'; teks: string; catatan?: string | null; href: string }[] = [];
    const l = lkpd.get(m.id);
    const t = latihan.get(m.id);
    if (l?.allow_retake) out.push({ key: `u-${m.id}`, jenis: 'ulang', teks: `Guru mengizinkan Anda mengerjakan ulang LKPD Bab ${m.chapter_number}.`, href: `/siswa/pengerjaan/lkpd/${m.id}` });
    else if (l?.status === 'graded') out.push({ key: `l-${m.id}`, jenis: 'nilai', teks: `Nilai LKPD Bab ${m.chapter_number}: ${l.score ?? '-'}`, catatan: l.feedback, href: `/siswa/pengerjaan/lkpd/${m.id}` });
    if (t?.feedback !== null && t?.feedback !== undefined) out.push({ key: `t-${m.id}`, jenis: 'nilai', teks: `Nilai Latihan Bab ${m.chapter_number}: ${t.score ?? '-'}`, catatan: t.feedback, href: `/siswa/pengerjaan/latihan/${m.id}` });
    return out;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Daftar Modul Belajar" userRole="siswa" userName={namaSiswa} />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[960px] w-full mx-auto">
        {/* Sapaan & ringkasan progres */}
        <section className="glass-card p-6 md:p-7 mb-6 flex flex-col sm:flex-row sm:items-center gap-6 overflow-hidden relative anim-rise">
          <span className="absolute -right-4 -top-10 text-[150px] font-extrabold text-[#2E7BC4]/[0.05] select-none leading-none" aria-hidden="true">∫</span>
          <div className="flex-1 relative">
            <div className="text-xs font-bold text-[#F0932B] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" /> {sapaan()}
            </div>
            <h1 className="text-2xl md:text-[28px] font-extrabold text-[#1B4E80] leading-tight">Halo, {namaSiswa}!</h1>
            <p className="text-sm text-[#66748C] mt-1.5 max-w-md">
              Pelajari materi, kumpulkan LKPD, lalu lanjutkan ke latihan dan evaluasi akhir.
            </p>
          </div>
          {materiList.length > 0 && (
            <div className="relative self-center">
              <ScoreRing value={babSelesai} max={materiList.length} size={104} caption="Bab tuntas" tone="green" />
            </div>
          )}
        </section>

        {kabar.length > 0 && (
          <section className="mb-6 anim-rise" style={{ ['--i' as string]: 1 }} aria-label="Kabar dari guru">
            <h2 className="text-xs font-bold text-[#1B4E80] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <MessageSquareText className="w-4 h-4" /> Kabar dari Guru
            </h2>
            <div className="space-y-2.5">
              {kabar.map((k) => (
                <Link
                  key={k.key}
                  href={k.href}
                  className={`card-hover flex items-start gap-3 p-4 rounded-2xl border bg-white/85 backdrop-blur ${k.jenis === 'ulang' ? 'border-[#FBD38D]' : 'border-[#BBF7D0]'}`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.jenis === 'ulang' ? 'bg-[#FFF1DD] text-[#E37A12]' : 'bg-[#E4F8EE] text-[#15885A]'}`}>
                    {k.jenis === 'ulang' ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-[#1F2A37]">{k.teks}</span>
                    {k.catatan && <span className="block text-xs text-[#66748C] mt-0.5 truncate">“{k.catatan}”</span>}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] mt-2.5 shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <h2 className="text-xs font-bold text-[#1B4E80] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <BookOpen className="w-4 h-4" /> Modul Belajar
        </h2>

        {materiRes.error ? (
          <div className="glass-card p-6 text-sm text-[#991B1B]">
            Daftar modul gagal dimuat. Silakan muat ulang halaman ini.
          </div>
        ) : materiList.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-4xl font-extrabold text-[#2E7BC4]/30 mb-2" aria-hidden="true">∅</div>
            <p className="text-sm text-[#66748C]">Belum ada modul yang ditambahkan guru.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {materiList.map((m, i) => {
              const l = lkpd.get(m.id);
              const t = latihan.get(m.id);
              const evaluasi = evaluasiUntuk(m.id);
              const subbab = Array.isArray(m.subbab_json) ? m.subbab_json.length : 0;
              const langkah = !l
                ? { teks: 'Mulai Belajar', href: `/siswa/materi/${m.id}` }
                : l.allow_retake
                ? { teks: 'Kerjakan Ulang LKPD', href: `/siswa/pengerjaan/lkpd/${m.id}` }
                : !t
                ? { teks: 'Lanjut ke Latihan', href: `/siswa/pengerjaan/latihan/${m.id}` }
                : !evaluasi
                ? { teks: 'Lanjut ke Evaluasi', href: `/siswa/pengerjaan/evaluasi/${m.id}` }
                : { teks: 'Tinjau Hasil', href: `/siswa/materi/${m.id}` };
              const chip = (ok: boolean, label: string) => (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${ok ? 'bg-[#E4F8EE] text-[#15885A]' : 'bg-[#F1F5F9] text-[#94A3B8]'}`}>
                  {ok && <Check className="w-3 h-3" strokeWidth={3} />} {label}
                </span>
              );
              return (
                <article
                  key={m.id}
                  className="glass-card card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 anim-rise"
                  style={{ ['--i' as string]: i + 2 }}
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D3ECFF] to-[#EAF6FF] border border-white text-[#1B4E80] flex flex-col items-center justify-center shrink-0 shadow-sm">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#2E7BC4]">Bab</span>
                      <span className="text-xl font-extrabold leading-none tabular">{m.chapter_number}</span>
                    </div>
                    <div className="min-w-0">
                      <Link href={`/siswa/materi/${m.id}`} className="font-extrabold text-[#1B4E80] hover:text-[#2E7BC4] transition-colors line-clamp-2">
                        {m.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {subbab > 0 && <span className="text-[11px] font-semibold text-[#66748C] mr-1">{subbab} subbab</span>}
                        {chip(!!l, 'LKPD')}
                        {chip(!!t, 'Latihan')}
                        {chip(!!evaluasi, 'Evaluasi')}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={langkah.href}
                    className={`btn-press group shrink-0 inline-flex items-center justify-center gap-1.5 text-[13px] font-bold px-4 py-2.5 rounded-xl ${
                      langkah.teks === 'Tinjau Hasil'
                        ? 'bg-white border border-[#DCEAF7] text-[#1B4E80] hover:border-[#2E7BC4]'
                        : 'bg-[#2E7BC4] hover:bg-[#1B4E80] text-white shadow-[0_6px_16px_rgba(46,123,196,0.28)]'
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
