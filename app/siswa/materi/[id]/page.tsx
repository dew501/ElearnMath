import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { SiswaNav } from '@/components/siswa-nav';
import { LockBanner } from '@/components/lock-banner';
import { CatatAktivitas } from '@/components/catat-aktivitas';
import { ProgressSteps, type Langkah } from '@/components/ui/progress-steps';
import { UUID_RE } from '@/lib/akses';
import { bersihkanHtml } from '@/lib/konten';
import { MediaMateri } from '@/components/media-materi';
import { ArrowLeft, BookOpen, Play, RotateCcw, Award, ArrowRight, ChevronLeft, ChevronRight, ClipboardList, ListChecks, Lock } from 'lucide-react';

export const metadata: Metadata = { title: 'Materi Belajar' };

interface PageProps {
  params: { id: string };
  searchParams: { bagian?: string };
}

const tombolNonaktif = 'inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2.5 rounded-xl bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed border border-[#E2E8F0]';
const tombolSekunder = 'btn-press inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2.5 rounded-xl bg-white border border-[#DCEAF7] text-[#4B5A70] hover:text-[#2E7BC4] hover:border-[#BFDBFE] shadow-sm';
const tombolUtama = 'btn-press group text-[13px] font-bold px-4 py-2.5 rounded-xl bg-[#2E7BC4] text-white hover:bg-[#1B4E80] shadow-[0_6px_16px_rgba(46,123,196,0.28)] inline-flex items-center gap-1.5';

const adaIsi = (html: string) => !!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || html.includes('<img');

export default async function MateriPage({ params, searchParams }: PageProps) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('users').select('full_name').eq('id', user.id).maybeSingle();
  const namaSiswa = profile?.full_name || user.email?.split('@')[0] || 'Siswa';

  const bab = Number.parseInt(params.id, 10);
  let materiQuery = null;
  if (UUID_RE.test(params.id)) materiQuery = supabase.from('materi').select('*').eq('id', params.id);
  else if (Number.isFinite(bab) && String(bab) === params.id) materiQuery = supabase.from('materi').select('*').eq('chapter_number', bab);
  const materiRes = materiQuery ? await materiQuery.limit(1) : null;
  const materi = materiRes?.data?.[0];

  if (!materi) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar title="Materi Belajar" userRole="siswa" userName={namaSiswa} />
        <SiswaNav />
        <div className="flex-1 p-6 md:p-8 max-w-[920px] w-full mx-auto">
          <div className="glass-card p-8 md:p-10 text-center anim-rise">
            <div className="text-5xl font-extrabold text-[#2E7BC4]/25 mb-3" aria-hidden="true">∅</div>
            <h1 className="text-xl font-extrabold text-[#1B4E80] mb-2">{materiRes?.error ? 'Materi gagal dimuat' : 'Materi belum tersedia'}</h1>
            <p className="text-sm text-[#66748C] mb-6 max-w-sm mx-auto">
              {materiRes?.error ? 'Terjadi gangguan saat memuat materi. Silakan muat ulang halaman ini.' : 'Materi ini belum dibuka guru untuk kelasmu, atau alamatnya tidak valid.'}
            </p>
            <Link href="/siswa/materi" className={`${tombolUtama} inline-flex`}><ArrowLeft className="w-3.5 h-3.5" /> Lihat Daftar Modul</Link>
          </div>
        </div>
      </div>
    );
  }

  const [lkpdRes, latihanRes, evaluasiRes] = await Promise.all([
    supabase.from('jawaban_lkpd').select('id, status, score, allow_retake').eq('id_siswa', user.id).eq('id_materi', materi.id).limit(1),
    supabase.from('pengerjaan_latihan').select('id, score, feedback').eq('id_siswa', user.id).eq('id_materi', materi.id).limit(1),
    supabase.from('pengerjaan_evaluasi').select('id, score, dinilai_at').eq('id_siswa', user.id).or(`id_materi.eq.${materi.id},id_materi.is.null`).limit(1),
  ]);
  const statusGagal = Boolean(lkpdRes.error || latihanRes.error || evaluasiRes.error);
  const lkpd = lkpdRes.data?.[0];
  const latihan = latihanRes.data?.[0];
  const evaluasi = evaluasiRes.data?.[0];
  const isLkpdSubmitted = Boolean(lkpd);
  const bolehUlangLkpd = Boolean(lkpd?.allow_retake);
  const base = `/siswa/pengerjaan`;

  // Isi per bagian (subbab); materi lama tanpa bagian ditampilkan sebagai satu bagian
  const semuaBagian: { judul: string; konten: string }[] = Array.isArray(materi.bagian_json) && materi.bagian_json.length
    ? materi.bagian_json.map((b: any) => ({ judul: String(b?.judul ?? ''), konten: String(b?.konten ?? '') }))
    : [{ judul: materi.title, konten: materi.content_html ?? '' }];
  const bagian = semuaBagian.filter((b) => adaIsi(b.konten));
  const total = Math.max(bagian.length, 1);
  const n = Math.min(Math.max(Number.parseInt(searchParams.bagian ?? '1', 10) || 1, 1), total);
  const aktif = bagian[n - 1];
  const kontenHtml = aktif ? bersihkanHtml(aktif.konten) : '';
  const akhir = n === total;
  const href = (i: number) => `/siswa/materi/${materi.id}?bagian=${i}`;

  const langkah: Langkah[] = [
    {
      label: 'LKPD',
      href: `${base}/lkpd/${materi.id}`,
      status: !lkpd ? 'aktif' : bolehUlangLkpd ? 'ulang' : 'selesai',
      keterangan: !lkpd ? 'Belum dikumpulkan' : bolehUlangLkpd ? 'Boleh dikerjakan ulang' : lkpd.status === 'graded' ? `Nilai ${lkpd.score ?? '-'}` : 'Menunggu koreksi',
    },
    {
      label: 'Latihan',
      href: `${base}/latihan/${materi.id}`,
      status: !lkpd ? 'terkunci' : latihan ? 'selesai' : 'aktif',
      keterangan: !lkpd ? 'Kumpulkan LKPD dulu' : !latihan ? 'Siap dikerjakan' : latihan.feedback !== null ? `Nilai ${latihan.score ?? '-'}` : 'Menunggu koreksi',
    },
    {
      label: 'Evaluasi',
      href: `${base}/evaluasi/${materi.id}`,
      status: !latihan ? 'terkunci' : evaluasi ? 'selesai' : 'aktif',
      keterangan: !latihan ? 'Selesaikan latihan dulu' : !evaluasi ? 'Siap dikerjakan' : evaluasi.dinilai_at ? `Nilai ${evaluasi.score ?? '-'}` : 'Menunggu validasi guru',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <CatatAktivitas jenis="buka_materi" idMateri={materi.id} detail={{ bagian: n }} />
      <Navbar title={`Materi Belajar: Bab ${materi.chapter_number}`} userRole="siswa" userName={namaSiswa} />
      <SiswaNav aktif="/siswa/materi" />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <div className="mb-5">
          <Link href="/siswa/materi" className="btn-press inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] hover:bg-white shadow-sm">
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar Modul
          </Link>
        </div>

        <div className="glass-card p-6 md:p-8 mb-5 relative overflow-hidden anim-rise">
          <span className="absolute right-4 -top-6 text-[120px] font-extrabold text-[#2E7BC4]/[0.05] select-none leading-none tabular" aria-hidden="true">{materi.chapter_number}</span>
          <span className="relative inline-block text-[11px] font-bold px-3 py-1 rounded-full bg-[#D3ECFF] text-[#1B4E80] mb-3">Materi Belajar Mandiri #{materi.chapter_number}</span>
          <h1 className="relative text-2xl md:text-[28px] font-extrabold text-[#1B4E80] mb-1.5 leading-tight">{materi.title}</h1>
          <p className="relative text-[13px] text-[#66748C] mb-6">Mata Pelajaran: <strong className="text-[#1F2A37]">Matematika</strong> · {total} subbab</p>
          <div className="relative pt-5 border-t border-[#DCEAF7]"><ProgressSteps langkah={langkah} /></div>
        </div>

        {statusGagal && <div role="alert" className="mb-5 p-3.5 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-medium">Status pengerjaan Anda gagal dimuat. Muat ulang halaman sebelum melanjutkan.</div>}

        {bolehUlangLkpd && (
          <div className="mb-5 p-4 rounded-2xl bg-[#FFF8EC] border border-[#FBD38D] text-[13px] text-[#92400E] flex items-center gap-3 anim-rise">
            <span className="w-9 h-9 rounded-xl bg-white border border-[#FBD38D] flex items-center justify-center shrink-0"><RotateCcw className="w-4 h-4 text-[#E37A12]" /></span>
            <span className="flex-1 font-semibold">Guru mengizinkan Anda mengerjakan ulang LKPD materi ini.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-5 items-start">
          {/* Daftar subbab */}
          <nav aria-label="Daftar subbab" className="glass-card p-4 lg:sticky lg:top-[132px] anim-rise">
            <div className="text-[13px] font-bold text-[#1B4E80] mb-2.5 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-[#2E7BC4]" /> Cakupan Topik</div>
            <ol className="flex lg:flex-col gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1 pb-1 lg:pb-0">
              {bagian.map((b, i) => {
                const ini = i + 1 === n;
                return (
                  <li key={i} className="shrink-0">
                    <Link
                      href={href(i + 1)}
                      aria-current={ini ? 'step' : undefined}
                      className={`flex items-start gap-2 p-2 rounded-xl text-[13px] transition-colors whitespace-nowrap lg:whitespace-normal ${ini ? 'bg-[#2E7BC4] text-white font-bold shadow-sm' : 'text-[#1F2A37] hover:bg-[#F4F9FF]'}`}
                    >
                      <span className={`w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-px tabular ${ini ? 'bg-white text-[#2E7BC4]' : i + 1 < n ? 'bg-[#E4F8EE] text-[#15885A]' : 'bg-[#EAF6FF] text-[#2E7BC4]'}`}>{i + 1}</span>
                      {b.judul || `Subbab ${i + 1}`}
                    </Link>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 hidden lg:block">
              <div className="text-[11px] font-semibold text-[#66748C] mb-1">Bagian {n} dari {total}</div>
              <div className="h-1.5 rounded-full bg-[#E6EEF7] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#5FA8E8] to-[#2E7BC4]" style={{ width: `${(n / total) * 100}%` }} /></div>
            </div>
          </nav>

          <article className="glass-card p-6 md:p-8 anim-rise" style={{ ['--i' as string]: 1 }}>
            <div className="text-[11px] font-bold text-[#2E7BC4] uppercase tracking-wider mb-1">Subbab {n} dari {total}</div>
            <h2 className="text-xl md:text-2xl font-extrabold text-[#1B4E80] mb-5 leading-tight">{aktif?.judul || materi.title}</h2>
            {n === 1 && <MediaMateri url={materi.youtube_url} judul={materi.title} />}
            {kontenHtml ? (
              <div className="materi-content text-[15px] leading-[1.85] text-[#1F2A37] mb-8" dangerouslySetInnerHTML={{ __html: kontenHtml }} />
            ) : (
              <p className="text-sm text-[#66748C] italic mb-8">Isi materi belum ditulis guru.</p>
            )}

            {/* Navigasi antarbagian */}
            <div className="flex justify-between gap-3 border-t border-[#DCEAF7] pt-5">
              {n > 1 ? (
                <Link href={href(n - 1)} className={`${tombolSekunder} inline-flex items-center gap-1 max-w-[48%]`}>
                  <ChevronLeft className="w-4 h-4 shrink-0" /> <span className="truncate">Sebelumnya: {bagian[n - 2]?.judul}</span>
                </Link>
              ) : <span />}
              {!akhir && (
                <Link href={href(n + 1)} className={`${tombolUtama} max-w-[52%]`}>
                  <span className="truncate">Berikutnya: {bagian[n]?.judul}</span> <ChevronRight className="w-4 h-4 shrink-0" />
                </Link>
              )}
            </div>

            {akhir && (
              <div className="mt-6 pt-6 border-t border-[#DCEAF7]">
                {!isLkpdSubmitted && (
                  <LockBanner
                    title="Modul Latihan Masih Terkunci"
                    description={<>Anda wajib menyelesaikan dan mengumpulkan <strong>Lembar Kerja Peserta Didik (LKPD) Bab {materi.chapter_number}</strong> terlebih dahulu sebelum membuka dan mengerjakan lembar Latihan Soal.</>}
                    actionText="Buka LKPD Sekarang"
                    actionHref={`${base}/lkpd/${materi.id}`}
                  />
                )}
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <span className="text-[13.5px] text-[#66748C]">Sudah memahami materi ini? Lanjutkan tugas mandiri:</span>
                  <div className="flex gap-2.5 items-center flex-wrap">
                    <Link href={`${base}/lkpd/${materi.id}`} className={!isLkpdSubmitted || bolehUlangLkpd ? tombolUtama : tombolSekunder}>
                      {!isLkpdSubmitted || bolehUlangLkpd ? <ClipboardList className="w-3.5 h-3.5" /> : <ListChecks className="w-3.5 h-3.5" />} {!isLkpdSubmitted ? 'Buka LKPD Mandiri' : bolehUlangLkpd ? 'Kerjakan Ulang LKPD' : 'Lihat Hasil LKPD'}
                    </Link>
                    {!isLkpdSubmitted ? (
                      <button disabled className={tombolNonaktif} title="Anda harus mengumpulkan LKPD terlebih dahulu untuk membuka Latihan ini."><Lock className="w-3.5 h-3.5" /> Latihan Terkunci</button>
                    ) : latihan ? (
                      <Link href={`${base}/latihan/${materi.id}`} className={tombolSekunder}><ListChecks className="w-3.5 h-3.5" /> Lihat Hasil Latihan</Link>
                    ) : (
                      <Link href={`${base}/latihan/${materi.id}`} className={tombolUtama}><Play className="w-3.5 h-3.5" /> Mulai Latihan Soal <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
                    )}
                    {!latihan ? (
                      <button disabled className={tombolNonaktif} title="Selesaikan Latihan Soal terlebih dahulu untuk membuka Evaluasi Akhir."><Lock className="w-3.5 h-3.5" /> Evaluasi Terkunci</button>
                    ) : evaluasi ? (
                      <Link href={`${base}/evaluasi/${materi.id}`} className={tombolSekunder}><ListChecks className="w-3.5 h-3.5" /> Lihat Hasil Evaluasi</Link>
                    ) : (
                      <Link href={`${base}/evaluasi/${materi.id}`} className={tombolUtama}><Award className="w-3.5 h-3.5" /> Mulai Evaluasi Akhir <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
