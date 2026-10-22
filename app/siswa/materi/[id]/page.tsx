import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { LockBanner } from '@/components/lock-banner';
import { ArrowLeft, BookOpen, Play, CheckCircle } from 'lucide-react';

interface PageProps {
  params: {
    id: string;
  };
}

// Media embed renderer
function renderStudentMediaEmbed(url: string | null, judul: string) {
  if (!url) return null;
  const trimmed = url.trim();

  // 1. YouTube Video
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i
  );
  if (ytMatch) {
    const ytId = ytMatch[1];
    return (
      <div className="bg-white border border-[#DCEAF7] rounded-2xl p-5 mb-6 shadow-[0_4px_15px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] bg-[#FEE2E2] text-[#DC2626] px-2.5 py-1 rounded-full font-bold">
              ▶️ Video Pembelajaran
            </span>
            <strong className="text-sm text-[#1B4E80]">{judul}</strong>
          </div>
        </div>
        <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-xl border border-[#DCEAF7]">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytId}`}
            className="absolute top-0 left-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // 2. Berkas PDF
  if (/\.pdf($|\?)/i.test(trimmed)) {
    return (
      <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-5 mb-6">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="font-bold text-[#92400E] text-sm flex items-center gap-2">
            <span>📄</span> Dokumen Pendukung Materi (PDF)
          </div>
          <a
            href={trimmed}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3.5 py-1.5 bg-[#2E7BC4] text-white rounded-[10px] font-semibold hover:bg-[#1B4E80] transition-colors"
          >
            Unduh / Buka Dokumen &rarr;
          </a>
        </div>
        <iframe
          src={trimmed}
          className="w-full h-[450px] border-0 rounded-xl bg-white"
        />
      </div>
    );
  }

  return null;
}

export default async function MateriPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  // Ambil data materi berdasarkan ID atau chapter_number
  let query = supabase.from('materi').select('*');
  if (params.id.length > 20) {
    query = query.eq('id', params.id);
  } else {
    query = query.eq('chapter_number', parseInt(params.id) || 1);
  }
  const { data: materiList } = await query.limit(1);
  const materi = materiList?.[0];

  // Fallback data demo jika tabel masih kosong saat pertama kali setup
  const currentMateri = materi || {
    id: 'demo-materi-1',
    chapter_number: 1,
    title: 'Mengenal Statistika & Ukuran Pemusatan Data',
    content_html: `
      <p>Statistika adalah cabang ilmu matematika terapan yang berkaitan erat dengan pengumpulan, pengorganisasian, analisis, dan interpretasi data.</p>
      <h3>1. Data Kualitatif vs Kuantitatif</h3>
      <ul>
        <li><strong>Data Kualitatif:</strong> Berupa kategori atau narasi deskriptif (misal: warna favorit, tingkat kepuasan belajar).</li>
        <li><strong>Data Kuantitatif:</strong> Berupa angka atau besaran terukur (misal: tinggi badan, berat badan, nilai ujian).</li>
      </ul>
      <h3>2. Nilai Rata-rata (Mean)</h3>
      <p>Mean diperoleh dari jumlah seluruh nilai pada data dibagi banyaknya frekuensi kemunculan data.</p>
    `,
    subbab_json: [
      'Konsep Dasar Statistika',
      'Pengelompokan Data Kualitatif & Kuantitatif',
      'Menghitung Nilai Rata-rata (Mean)',
      'Aplikasi Statistika dalam Kehidupan Sehari-hari'
    ],
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    created_at: new Date().toISOString(),
  };

  // Cek apakah siswa sudah mengumpulkan LKPD untuk materi ini
  const { data: lkpdCheck } = await supabase
    .from('jawaban_lkpd')
    .select('id, status, score')
    .eq('id_siswa', user.id)
    .eq('id_materi', currentMateri.id)
    .maybeSingle();

  const isLkpdSubmitted = Boolean(lkpdCheck);
  const subbabList: string[] = Array.isArray(currentMateri.subbab_json)
    ? currentMateri.subbab_json
    : [];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        title={`Materi Belajar: Bab ${currentMateri.chapter_number}`}
        userRole="siswa"
        userName={profile?.full_name ?? 'Siswa'}
      />

      <div className="flex-1 p-6 md:p-8 max-w-[920px] w-full mx-auto">
        <div className="mb-5">
          <Link
            href="/siswa/materi/1"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-[10px] bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] hover:bg-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar Modul
          </Link>
        </div>

        {/* Konten Materi Glass-Card Identik ElearnMath */}
        <div className="glass-card p-6 md:p-8">
          <div className="flex justify-between items-center mb-3">
            <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full bg-[#D3ECFF] text-[#1B4E80]">
              Materi Belajar Mandiri #{currentMateri.chapter_number}
            </span>
          </div>

          <h1 className="text-2xl md:text-[26px] font-extrabold text-[#1B4E80] mb-2 leading-tight">
            {currentMateri.title}
          </h1>

          <div className="text-[13px] text-[#66748C] pb-4 mb-6 border-b border-[#DCEAF7]">
            Mata Pelajaran: <strong className="text-[#1F2A37]">Matematika</strong> &bull; Status:{' '}
            <span className="text-[#22B573] font-semibold">Tersedia Terbuka</span>
          </div>

          {/* Cakupan Topik Pembahasan Subbab */}
          {subbabList.length > 0 && (
            <div className="bg-[#EFF6FF] border-l-4 border-[#2E7BC4] rounded-lg p-4 mb-6">
              <div className="text-[13px] font-bold text-[#1B4E80] mb-2 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#2E7BC4]" /> Cakupan Topik Pembahasan:
              </div>
              <ul className="list-disc pl-5 m-0 text-[13px] text-[#1F2A37] space-y-1">
                {subbabList.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Media Video / Dokumen Interaktif */}
          {renderStudentMediaEmbed(currentMateri.youtube_url, currentMateri.title)}

          {/* Uraian Konten HTML */}
          <div
            className="text-[15px] leading-[1.85] text-[#1F2A37] mb-8 space-y-4"
            dangerouslySetInnerHTML={{ __html: currentMateri.content_html }}
          />

          {/* KOMPONEN LOCK BANNER KREM/ORANYE 🔒
              Tampil persis sesuai PHP saat LKPD belum selesai */}
          {!isLkpdSubmitted && (
            <LockBanner
              title="Modul Latihan Masih Terkunci"
              description={
                <>
                  Anda wajib menyelesaikan dan mengumpulkan{' '}
                  <strong>Lembar Kerja Peserta Didik (LKPD) Bab {currentMateri.chapter_number}</strong>{' '}
                  terlebih dahulu sebelum membuka dan mengerjakan lembar Latihan Soal.
                </>
              }
              actionText="📖 Buka Modul LKPD Sekarang →"
              actionHref={`/siswa/pengerjaan/lkpd/${currentMateri.id}`}
            />
          )}

          {/* Footer Baris Aksi */}
          <div className="border-t border-[#DCEAF7] pt-6 flex justify-between items-center flex-wrap gap-4">
            <span className="text-[13.5px] text-[#66748C]">
              Sudah memahami materi ini? Lanjutkan tugas mandiri:
            </span>

            <div className="flex gap-2.5 items-center flex-wrap">
              <Link
                href={`/siswa/pengerjaan/lkpd/${currentMateri.id}`}
                className="text-[13px] font-semibold px-4 py-2 rounded-[10px] bg-white border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] transition-colors shadow-sm"
              >
                {isLkpdSubmitted ? '✓ Tinjau LKPD Mandiri' : 'Buka LKPD Mandiri →'}
              </Link>

              {!isLkpdSubmitted ? (
                <button
                  disabled
                  className="text-[13px] font-semibold px-4 py-2 rounded-[10px] bg-gray-200 text-gray-500 cursor-not-allowed opacity-75 shadow-none"
                  title="Anda harus mengumpulkan LKPD terlebih dahulu untuk membuka Latihan ini."
                >
                  🔒 Latihan Terkunci
                </button>
              ) : (
                <Link
                  href={`/siswa/pengerjaan/latihan/${currentMateri.id}`}
                  className="text-[13px] font-semibold px-4 py-2 rounded-[10px] bg-[#2E7BC4] text-white hover:bg-[#1B4E80] transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Mulai Latihan Soal &rarr;
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
