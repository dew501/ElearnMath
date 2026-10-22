'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { LockBanner } from '@/components/lock-banner';
import { ArrowLeft, Clock, AlertTriangle, Send, CheckCircle2 } from 'lucide-react';

interface PengerjaanProps {
  params: {
    type: 'lkpd' | 'latihan' | 'evaluasi';
    id: string;
  };
}

export default function PengerjaanPage({ params }: PengerjaanProps) {
  const router = useRouter();
  const supabase = createClient();
  const { type, id } = params;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState<{ title: string; desc: string; link: string; btn: string } | null>(null);

  // Soal & Jawaban
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tabSwitches, setTabSwitches] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  useEffect(() => {
    async function initCheckAndLoad() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // 1. Verifikasi Prasyarat Penguncian
      if (type === 'latihan') {
        const { data: lkpdRecord } = await supabase
          .from('jawaban_lkpd')
          .select('id')
          .eq('id_siswa', user.id)
          .eq('id_materi', id)
          .maybeSingle();

        if (!lkpdRecord) {
          setIsLocked(true);
          setLockReason({
            title: 'Modul Latihan Masih Terkunci',
            desc: 'Anda wajib mengumpulkan Lembar Kerja Peserta Didik (LKPD) materi ini terlebih dahulu sebelum dapat membuka dan mengerjakan latihan soal.',
            link: `/siswa/pengerjaan/lkpd/${id}`,
            btn: '📖 Buka Modul LKPD Sekarang →',
          });
          setLoading(false);
          return;
        }
      }

      if (type === 'evaluasi') {
        const { data: latihanRecord } = await supabase
          .from('pengerjaan_latihan')
          .select('id')
          .eq('id_siswa', user.id)
          .maybeSingle();

        if (!latihanRecord) {
          setIsLocked(true);
          setLockReason({
            title: 'Modul Evaluasi Akhir Masih Terkunci',
            desc: 'Anda wajib menyelesaikan lembar Latihan Soal terlebih dahulu sebelum membuka dan mengerjakan lembar Evaluasi Akhir Bab.',
            link: `/siswa/pengerjaan/latihan/${id}`,
            btn: '📖 Buka Modul Latihan Sekarang →',
          });
          setLoading(false);
          return;
        }
      }

      // 2. Muat Bank Soal
      const { data: questionData } = await supabase
        .from('questions')
        .select('*')
        .eq('category', type)
        .order('urutan', { ascending: true });

      if (questionData && questionData.length > 0) {
        setQuestions(questionData);
      } else {
        // Data Soal Default/Fallback interaktif
        setQuestions([
          {
            id: 'q1',
            urutan: 1,
            tipe: 'pg',
            pertanyaan: 'Manakah di bawah ini yang merupakan contoh dari data kuantitatif kontinu?',
            opsi_a: 'Jumlah mobil yang lewat di jalan tol',
            opsi_b: 'Berat badan siswa kelas VII (misal: 45,5 kg)',
            opsi_c: 'Warna kesukaan siswa dalam satu kelas',
            opsi_d: 'Tingkat kepuasan siswa terhadap fasilitas sekolah',
            kunci_jawaban: 'B',
            bobot: 50,
          },
          {
            id: 'q2',
            urutan: 2,
            tipe: 'essay',
            pertanyaan: 'Jelaskan perbedaan utama antara Nilai Rata-rata (Mean) dan Nilai Tengah (Median) beserta contoh kasusnya!',
            bobot: 50,
          },
        ]);
      }

      setLoading(false);
    }

    initCheckAndLoad();
  }, [type, id, router, supabase]);

  // Anti-Cheat: Deteksi Perpindahan Tab (Tab Switch Log)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && !isDone && !isLocked) {
        setTabSwitches((prev) => prev + 1);
        setShowWarning(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('tab_switch_logs').insert({
            id_siswa: user.id,
            category: type,
            switch_count: tabSwitches + 1,
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDone, isLocked, type, tabSwitches, supabase]);

  const handleSelectAnswer = (questionId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Hitung skor otomatis untuk PG
    let calculatedScore = 0;
    questions.forEach((q) => {
      if (q.tipe === 'pg' && answers[q.id]?.toUpperCase() === q.kunci_jawaban?.toUpperCase()) {
        calculatedScore += Number(q.bobot || 50);
      }
    });

    if (type === 'lkpd') {
      await supabase.from('jawaban_lkpd').upsert({
        id_siswa: user.id,
        id_materi: id,
        file_answers_json: { answers },
        status: 'submitted',
        score: calculatedScore > 0 ? calculatedScore : null,
      });
    } else if (type === 'latihan') {
      await supabase.from('pengerjaan_latihan').upsert({
        id_siswa: user.id,
        id_materi: id,
        answers_json: { answers },
        score: calculatedScore,
      });
    } else {
      await supabase.from('pengerjaan_evaluasi').insert({
        id_siswa: user.id,
        answers_json: { answers },
        score: calculatedScore,
      });
    }

    setFinalScore(calculatedScore);
    setIsDone(true);
    setSubmitting(false);
  };

  const titles: Record<string, string> = {
    lkpd: 'Lembar Kerja Peserta Didik (LKPD)',
    latihan: 'Latihan Mandiri Interaktif',
    evaluasi: 'Evaluasi Akhir Pemahaman Matematika',
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm font-semibold text-[#1B4E80]">
        Memuat lembar pengerjaan...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={titles[type] || 'Pengerjaan Modul'} userRole="siswa" userName="Siswa" />

      <div className="flex-1 p-6 md:p-8 max-w-[860px] w-full mx-auto">
        <div className="mb-5 flex justify-between items-center">
          <Link
            href={`/siswa/materi/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-[10px] bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] hover:bg-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Materi
          </Link>

          {/* Tab Switch Counter Warning */}
          {tabSwitches > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FDEAE7] border border-[#FECACA] rounded-full text-xs font-bold text-[#E3543F]">
              <AlertTriangle className="w-3.5 h-3.5" />
              Keluar Tab: {tabSwitches}x
            </div>
          )}
        </div>

        {/* Modal / Toast Peringatan Tab Switch */}
        {showWarning && (
          <div className="mb-5 p-4 rounded-2xl bg-[#FFF1DD] border-2 border-[#FFB454] flex items-center justify-between text-xs font-bold text-[#92400E]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#F0932B]" />
              <span>Peringatan: Sistem mendeteksi perpindahan tab peramban. Aktivitas dicatat demi integritas pengerjaan.</span>
            </div>
            <button
              onClick={() => setShowWarning(false)}
              className="px-2.5 py-1 bg-white rounded-lg border border-[#F0932B] text-[#92400E]"
            >
              Saya Mengerti
            </button>
          </div>
        )}

        {/* JIKA MODUL TERKUNCI OLEH PRASYARAT (LKPD -> LATIHAN / LATIHAN -> EVALUASI) */}
        {isLocked && lockReason ? (
          <div className="glass-card p-6 md:p-8">
            <LockBanner
              title={lockReason.title}
              description={<p>{lockReason.desc}</p>}
              actionText={lockReason.btn}
              actionHref={lockReason.link}
            />
          </div>
        ) : isDone ? (
          /* TAMPILAN SELESAI */
          <div className="glass-card p-8 md:p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#E4F8EE] text-[#22B573] flex items-center justify-center mx-auto mb-4 text-3xl">
              ✓
            </div>
            <h2 className="text-2xl font-extrabold text-[#1B4E80] mb-2">
              Pengumpulan Berhasil!
            </h2>
            <p className="text-sm text-[#66748C] max-w-md mx-auto mb-6">
              Lembar jawaban Anda telah tersimpan dengan aman di basis data Supabase. Guru akan meninjau jawaban essay Anda.
            </p>
            {finalScore !== null && (
              <div className="inline-block px-6 py-3 rounded-2xl bg-[#EAF6FF] border border-[#DCEAF7] mb-8">
                <div className="text-xs font-semibold text-[#66748C]">Skor Pilihan Ganda</div>
                <div className="text-3xl font-black text-[#2E7BC4]">{finalScore} / 100</div>
              </div>
            )}
            <div>
              <Link
                href={`/siswa/materi/${id}`}
                className="px-6 py-3 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm shadow-md transition-all"
              >
                Kembali ke Halaman Materi &rarr;
              </Link>
            </div>
          </div>
        ) : (
          /* FORM LEMBAR PENGERJAAN */
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="glass-card p-6 md:p-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-[#2E7BC4] uppercase tracking-wider">
                  Lembar Penugasan Siswa
                </span>
                <span className="text-xs font-semibold text-[#66748C] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Bebas Waktu
                </span>
              </div>
              <h1 className="text-2xl font-extrabold text-[#1B4E80] mb-2">
                {titles[type]}
              </h1>
              <p className="text-xs text-[#66748C]">
                Bacalah setiap butir pertanyaan dengan seksama dan berikan jawaban terbaik Anda.
              </p>
            </div>

            {/* List Soal */}
            {questions.map((q, idx) => (
              <div key={q.id} className="glass-card p-6 md:p-8">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EAF6FF] text-[#1B4E80]">
                    Soal #{q.urutan || idx + 1} &bull; {q.tipe === 'pg' ? 'Pilihan Ganda' : 'Uraian / Essay'}
                  </span>
                  <span className="text-xs font-semibold text-[#66748C]">
                    Bobot: {q.bobot || 50} Poin
                  </span>
                </div>

                <div className="text-sm md:text-[15px] font-semibold text-[#1F2A37] mb-5 leading-relaxed">
                  {q.pertanyaan}
                </div>

                {/* Input Jawaban PG */}
                {q.tipe === 'pg' ? (
                  <div className="space-y-2.5">
                    {['A', 'B', 'C', 'D'].map((optKey) => {
                      const optText = q[`opsi_${optKey.toLowerCase()}`];
                      if (!optText) return null;
                      const isSelected = answers[q.id] === optKey;

                      return (
                        <label
                          key={optKey}
                          onClick={() => handleSelectAnswer(q.id, optKey)}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border text-xs md:text-sm cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[#EAF6FF] border-[#2E7BC4] text-[#1B4E80] font-bold shadow-sm'
                              : 'bg-white/80 border-[#DCEAF7] text-[#1F2A37] hover:bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question_${q.id}`}
                            value={optKey}
                            checked={isSelected}
                            onChange={() => handleSelectAnswer(q.id, optKey)}
                            className="hidden"
                          />
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isSelected
                                ? 'bg-[#2E7BC4] text-white'
                                : 'bg-gray-100 text-[#66748C]'
                            }`}
                          >
                            {optKey}
                          </div>
                          <span className="flex-1">{optText}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  /* Input Jawaban Essay */
                  <div>
                    <textarea
                      rows={5}
                      required
                      value={answers[q.id] || ''}
                      onChange={(e) => handleSelectAnswer(q.id, e.target.value)}
                      placeholder="Ketikkan uraian langkah perhitungan dan penjelasan Anda di sini..."
                      className="w-full p-4 rounded-xl border border-[#DCEAF7] bg-white/90 text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-2 focus:ring-[#2E7BC4]/20 transition-all"
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Tombol Simpan & Kirim */}
            <div className="glass-card p-6 flex justify-between items-center">
              <span className="text-xs text-[#66748C]">
                Pastikan seluruh jawaban telah terisi sebelum mengumpulkan.
              </span>
              <button
                type="submit"
                disabled={submitting}
                className="py-3 px-6 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Kumpulkan Jawaban Sekarang'}
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
