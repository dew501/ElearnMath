'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { Check, Save, RotateCcw, Award, MessageSquare, User, Filter } from 'lucide-react';

export default function GuruKoreksiPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'lkpd' | 'latihan'>('lkpd');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSub, setSelectedSub] = useState<any | null>(null);

  // Safe State Map untuk input nilai dan feedback tanpa error undefined key
  const [scores, setScores] = useState<Record<string, number | ''>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [allowRetake, setAllowRetake] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadSubmissions() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      if (activeTab === 'lkpd') {
        const { data } = await supabase
          .from('jawaban_lkpd')
          .select(`
            id,
            id_siswa,
            id_materi,
            file_answers_json,
            status,
            score,
            feedback,
            allow_retake,
            created_at,
            siswa:id_siswa (
              full_name,
              class_name,
              email
            ),
            materi:id_materi (
              title,
              chapter_number
            )
          `)
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          setSubmissions(data);
          setSelectedSub(data[0]);
          setAllowRetake(Boolean(data[0].allow_retake));
        } else {
          // Dummy data jika tabel masih kosong
          const mock = [
            {
              id: 'mock-1',
              id_siswa: 's1',
              id_materi: 'm1',
              status: 'submitted',
              score: 85,
              feedback: 'Penjelasan konsep sudah sangat baik.',
              allow_retake: false,
              created_at: new Date().toISOString(),
              file_answers_json: {
                answers: {
                  q1: 'B',
                  q2: 'Mean adalah nilai rata-rata yang dihitung dari total semua nilai dibagi jumlah data. Sedangkan median adalah nilai tengah setelah seluruh data diurutkan dari yang terkecil.',
                },
              },
              siswa: { full_name: 'Ahmad Faiz', class_name: 'VII-A' },
              materi: { title: 'Mengenal Statistika & Ukuran Pemusatan', chapter_number: 1 },
            },
          ];
          setSubmissions(mock);
          setSelectedSub(mock[0]);
          setAllowRetake(false);
        }
      } else {
        const { data } = await supabase
          .from('pengerjaan_latihan')
          .select(`
            id,
            id_siswa,
            id_materi,
            score,
            answers_json,
            feedback,
            completed_at,
            siswa:id_siswa (
              full_name,
              class_name,
              email
            ),
            materi:id_materi (
              title,
              chapter_number
            )
          `)
          .order('completed_at', { ascending: false });

        setSubmissions(data || []);
        if (data && data.length > 0) {
          setSelectedSub(data[0]);
        }
      }

      setLoading(false);
    }

    loadSubmissions();
  }, [activeTab, router, supabase]);

  const handleSelectSubmission = (sub: any) => {
    setSelectedSub(sub);
    setAllowRetake(Boolean(sub.allow_retake));
    setSuccessMsg(null);
  };

  const handleScoreChange = (id: string, val: string) => {
    const num = val === '' ? '' : Math.min(100, Math.max(0, Number(val)));
    setScores((prev) => ({ ...prev, [id]: num }));
  };

  const handleFeedbackChange = (id: string, text: string) => {
    setFeedbacks((prev) => ({ ...prev, [id]: text }));
  };

  const handleSaveCorrection = async () => {
    if (!selectedSub) return;
    setSaving(true);
    setSuccessMsg(null);

    const subId = selectedSub.id;
    const finalScore = scores[subId] !== undefined && scores[subId] !== '' 
      ? Number(scores[subId]) 
      : selectedSub.score ?? 80;
    const finalFeedback = feedbacks[subId] ?? selectedSub.feedback ?? '';

    if (activeTab === 'lkpd') {
      await supabase
        .from('jawaban_lkpd')
        .update({
          score: finalScore,
          feedback: finalFeedback,
          status: 'graded',
          allow_retake: allowRetake,
          graded_at: new Date().toISOString(),
        })
        .eq('id', subId);
    } else {
      await supabase
        .from('pengerjaan_latihan')
        .update({
          score: finalScore,
          feedback: finalFeedback,
        })
        .eq('id', subId);
    }

    setSuccessMsg('Penilaian dan umpan balik berhasil diterbitkan ke siswa!');
    setSaving(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Panel Koreksi & Penilaian Guru" userRole="guru" userName="Guru Matematika" />

      <div className="flex-1 p-6 md:p-8 max-w-[1200px] w-full mx-auto">
        {/* Header Tabs */}
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80]">
              Penilaian &amp; Koreksi Tugas Siswa
            </h1>
            <p className="text-xs text-[#66748C]">
              Tinjau jawaban mandiri siswa, berikan skor objektif 0-100, dan sertakan catatan evaluasi.
            </p>
          </div>

          <div className="flex gap-2 p-1.5 bg-white border border-[#DCEAF7] rounded-xl shadow-sm">
            <button
              onClick={() => setActiveTab('lkpd')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'lkpd'
                  ? 'bg-[#2E7BC4] text-white shadow-sm'
                  : 'text-[#66748C] hover:text-[#1B4E80]'
              }`}
            >
              Lembar LKPD Siswa
            </button>
            <button
              onClick={() => setActiveTab('latihan')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'latihan'
                  ? 'bg-[#2E7BC4] text-white shadow-sm'
                  : 'text-[#66748C] hover:text-[#1B4E80]'
              }`}
            >
              Latihan Soal Siswa
            </button>
          </div>
        </div>

        {/* Notifikasi Simpan Berhasil */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-[#E4F8EE] border border-[#BBF7D0] text-[#166534] text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-[#22B573]" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Kolom 1: Daftar Pengumpulan Siswa */}
          <div className="glass-card p-5 lg:col-span-1 h-[680px] flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#DCEAF7]">
              <span className="text-xs font-bold text-[#1B4E80] uppercase tracking-wide">
                Antrean Submission ({submissions.length})
              </span>
              <Filter className="w-4 h-4 text-[#66748C]" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {submissions.map((sub) => {
                const isSelected = selectedSub?.id === sub.id;
                return (
                  <div
                    key={sub.id}
                    onClick={() => handleSelectSubmission(sub)}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#EAF6FF] border-[#2E7BC4] shadow-sm'
                        : 'bg-white/80 border-[#DCEAF7] hover:bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-[#1F2A37]">
                        {sub.siswa?.full_name || 'Siswa'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D3ECFF] text-[#1B4E80]">
                        {sub.siswa?.class_name || 'VII-A'}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#66748C] line-clamp-1 mb-2">
                      {sub.materi?.title || 'Bab 1 - Statistika'}
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                      <span className={`font-bold ${sub.score !== null ? 'text-[#22B573]' : 'text-[#F0932B]'}`}>
                        {sub.score !== null ? `Nilai: ${sub.score}` : 'Menunggu Koreksi'}
                      </span>
                      <span className="text-[#94A3B8]">
                        {new Date(sub.created_at || sub.completed_at || Date.now()).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kolom 2 & 3: Lembar Evaluasi & Form Nilai */}
          <div className="glass-card p-6 md:p-8 lg:col-span-2 flex flex-col justify-between">
            {selectedSub ? (
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b border-[#DCEAF7] pb-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-[#1B4E80]">
                      Lembar Jawaban: {selectedSub.siswa?.full_name}
                    </h2>
                    <p className="text-xs text-[#66748C] mt-0.5">
                      Kelas: <strong>{selectedSub.siswa?.class_name}</strong> &bull; Modul:{' '}
                      <strong>{selectedSub.materi?.title}</strong>
                    </p>
                  </div>

                  {activeTab === 'lkpd' && (
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-[#DCEAF7] text-xs font-bold text-[#1B4E80]">
                      <input
                        type="checkbox"
                        checked={allowRetake}
                        onChange={(e) => setAllowRetake(e.target.checked)}
                        className="rounded text-[#2E7BC4]"
                      />
                      <span>Izin Pengerjaan Ulang (Retake)</span>
                    </label>
                  )}
                </div>

                {/* Rincian Jawaban Siswa */}
                <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                  <div className="p-4 bg-white/90 border border-[#DCEAF7] rounded-xl">
                    <span className="text-xs font-bold text-[#2E7BC4] block mb-1">
                      Butir Soal #1 (Pilihan Ganda):
                    </span>
                    <p className="text-xs text-[#66748C] mb-2">
                      Contoh data kuantitatif kontinu dalam statistika.
                    </p>
                    <div className="text-xs font-semibold p-2.5 rounded-lg bg-[#EAF6FF] text-[#1B4E80]">
                      Jawaban Siswa: <strong>{selectedSub.file_answers_json?.answers?.q1 || selectedSub.answers_json?.answers?.q1 || 'B'}</strong> (Tepat)
                    </div>
                  </div>

                  <div className="p-4 bg-white/90 border border-[#DCEAF7] rounded-xl">
                    <span className="text-xs font-bold text-[#2E7BC4] block mb-1">
                      Butir Soal #2 (Uraian / Essay):
                    </span>
                    <p className="text-xs text-[#66748C] mb-2">
                      Jelaskan perbedaan utama antara Nilai Rata-rata (Mean) dan Nilai Tengah (Median)!
                    </p>
                    <div className="text-xs p-3 rounded-lg bg-gray-50 border border-gray-100 text-[#1F2A37] leading-relaxed">
                      {selectedSub.file_answers_json?.answers?.q2 || selectedSub.answers_json?.answers?.q2 || 'Siswa belum menyertakan jawaban essay.'}
                    </div>
                  </div>
                </div>

                {/* Form Input Nilai 0-100 & Feedback Guru (Safe Lookups) */}
                <div className="p-5 bg-white border border-[#DCEAF7] rounded-2xl shadow-sm">
                  <h3 className="text-sm font-bold text-[#1B4E80] mb-3 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#F0932B]" /> Keputusan Nilai Akhir &amp; Umpan Balik Guru
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-xs font-bold text-[#1F2A37] block mb-1">
                        Nilai Akhir (0 - 100)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={
                          scores[selectedSub.id] !== undefined
                            ? scores[selectedSub.id]
                            : selectedSub.score ?? ''
                        }
                        onChange={(e) => handleScoreChange(selectedSub.id, e.target.value)}
                        placeholder="Contoh: 85"
                        className="w-full px-3.5 py-2 rounded-xl border border-[#DCEAF7] text-sm font-bold text-[#1B4E80] focus:outline-none focus:border-[#2E7BC4]"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="text-xs font-bold text-[#1F2A37] block mb-1">
                        Catatan &amp; Umpan Balik Personal Siswa
                      </label>
                      <input
                        type="text"
                        value={
                          feedbacks[selectedSub.id] !== undefined
                            ? feedbacks[selectedSub.id]
                            : selectedSub.feedback ?? ''
                        }
                        onChange={(e) => handleFeedbackChange(selectedSub.id, e.target.value)}
                        placeholder="Berikan apresiasi dan arahan perbaikan langkah perhitungan..."
                        className="w-full px-3.5 py-2 rounded-xl border border-[#DCEAF7] text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4]"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleSaveCorrection}
                      disabled={saving}
                      className="px-6 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Menerbitkan Nilai...' : 'Simpan & Terbitkan Nilai'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#66748C]">
                Silakan pilih salah satu submission siswa di kolom sebelah kiri.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
