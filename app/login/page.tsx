'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BookOpen, Award, CheckCircle2, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        setError(authError.message || 'Email atau kata sandi tidak cocok. Silakan coba kembali.');
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Cek role pengguna di database public.users
        const { data: profile } = await supabase
          .from('users')
          .select('role, status_approval')
          .eq('id', data.user.id)
          .single();

        if (profile?.status_approval === 'REJECTED') {
          await supabase.auth.signOut();
          setError('Pendaftaran akun Anda ditolak oleh Admin sekolah.');
          setLoading(false);
          return;
        }

        if (profile?.role === 'guru') {
          router.push('/guru/koreksi');
        } else {
          router.push('/siswa/materi/1');
        }
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan saat masuk ke sistem.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[1000px] grid grid-cols-1 md:grid-cols-2 bg-white rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(27,78,128,0.12)] border border-[#DCEAF7]">
        {/* Kolom Kiri: Cover Card Gradient Biru ElearnMath */}
        <div className="relative p-8 md:p-12 bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white flex flex-col justify-between overflow-hidden">
          {/* Orbs Cover Glow */}
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full pointer-events-none blur-xl" />
          <div className="absolute -bottom-16 -left-16 w-60 h-60 bg-[#FFB454]/20 rounded-full pointer-events-none blur-xl" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-xs font-bold uppercase tracking-wider mb-6 text-[#EAF6FF]">
              ✨ E-LEARNING MATEMATIKA INTERAKTIF
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-3.5 tracking-tight">
              Belajar Matematika Jadi Lebih Mudah &amp; Terarah
            </h1>

            <p className="text-sm text-[#EAF6FF]/90 leading-relaxed mb-8">
              Akses materi komprehensif, pengerjaan LKPD mandiri terstruktur, serta latihan dan evaluasi akhir dengan umpan balik langsung.
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md text-sm font-semibold">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-[#FFB454]" />
                </div>
                <span>Materi Interaktif &amp; Video Pembahasan</span>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md text-sm font-semibold">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-[#22B573]" />
                </div>
                <span>LKPD &amp; Latihan Mandiri Terstruktur</span>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md text-sm font-semibold">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Award className="w-4 h-4 text-[#FFB454]" />
                </div>
                <span>Penilaian Fleksibel &amp; Umpan Balik Guru</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-8 mt-6 border-t border-white/15 text-xs text-[#EAF6FF]/70">
            &copy; 2026 elearnMath. Seluruh hak cipta dilindungi.
          </div>
        </div>

        {/* Kolom Kanan: Form Otentikasi Supabase */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-white/90">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white flex items-center justify-center text-2xl font-black mb-3.5 shadow-lg shadow-blue-500/30">
              e
            </div>
            <h2 className="text-2xl font-extrabold text-[#1B4E80]">
              Masuk ke elearn<span className="text-[#F0932B]">Math</span>
            </h2>
            <p className="text-sm text-[#66748C] mt-1">
              Silakan masukkan akun Anda untuk melanjutkan belajar.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-medium leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">
                Alamat Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@siswa.sekolah.id"
                className="w-full px-4 py-2.5 rounded-xl border border-[#DCEAF7] bg-[#F8FAFC] text-sm text-[#1F2A37] focus:bg-white focus:outline-none focus:border-[#2E7BC4] focus:ring-2 focus:ring-[#2E7BC4]/20 transition-all"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-[#1F2A37] uppercase tracking-wide">
                  Kata Sandi
                </label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-[#DCEAF7] bg-[#F8FAFC] text-sm text-[#1F2A37] focus:bg-white focus:outline-none focus:border-[#2E7BC4] focus:ring-2 focus:ring-[#2E7BC4]/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all disabled:opacity-60"
            >
              {loading ? 'Memverifikasi...' : 'Masuk Sekarang'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-[#66748C]">
            Belum memiliki akun? Hubungi Admin Sekolah untuk persetujuan akun.
          </div>
        </div>
      </div>
    </div>
  );
}
