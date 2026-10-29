'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { alasanTolak, berandaUntuk, isAlasanTolak, KONTAK_ADMIN, PESAN_TOLAK } from '@/lib/akses';
import { Spinner } from '@/components/ui/skeleton';
import { BookOpen, Award, CheckCircle2, ArrowRight, Mail, Lock, Eye, EyeOff, AlertCircle, Sparkles } from 'lucide-react';

function pesanGagalMasuk(err: { message?: string; code?: string; status?: number } | null): string {
  const msg = err?.message || '';
  if (err?.code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'Email atau kata sandi salah. Silakan coba kembali.';
  }
  if (err?.code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'Email akun ini belum dikonfirmasi. Hubungi Admin sekolah.';
  }
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) {
    return 'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.';
  }
  if (/fetch|network/i.test(msg)) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  }
  return msg || 'Terjadi kesalahan saat masuk ke sistem.';
}

const FITUR = [
  { icon: BookOpen, warna: 'text-[#FFB454]', teks: 'Materi Interaktif & Video Pembahasan' },
  { icon: CheckCircle2, warna: 'text-[#7CE3B1]', teks: 'LKPD & Latihan Mandiri Terstruktur' },
  { icon: Award, warna: 'text-[#FFB454]', teks: 'Penilaian Fleksibel & Umpan Balik Guru' },
];

const inputClass =
  'input-field w-full pl-10 pr-4 py-3 rounded-xl bg-[#F8FBFF] text-sm text-[#1F2A37] placeholder:text-[#94A3B8] focus:bg-white';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);

  // Pesan dari halaman lain: akun belum boleh masuk, atau kata sandi baru saja diubah.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (isAlasanTolak(status)) {
      setError(PESAN_TOLAK[status]);
      supabase.auth.signOut();
    }
    if (params.get('reset') === 'berhasil') {
      setInfo('Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru.');
    }
  }, [supabase]);

  const tampilkanError = (pesan: string) => {
    setError(pesan);
    setErrorKey((k) => k + 1);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        tampilkanError(pesanGagalMasuk(authError));
        return;
      }

      if (data?.user) {
        // Cek peran & status persetujuan di public.users
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('role, status_approval')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError) {
          await supabase.auth.signOut();
          tampilkanError('Gagal memeriksa data akun. Silakan coba lagi.');
          return;
        }

        const alasan = alasanTolak(profile);
        if (alasan) {
          await supabase.auth.signOut();
          tampilkanError(PESAN_TOLAK[alasan]);
          return;
        }

        // Catat waktu masuk untuk pemantauan aktivitas (gagal pun tidak menghalangi masuk)
        await supabase.rpc('catat_aktivitas', { p_jenis: 'masuk' }).then(() => {}, () => {});
        router.push(berandaUntuk(profile!.role));
        router.refresh();
      }
    } catch (err: any) {
      tampilkanError(pesanGagalMasuk(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-[1000px] grid grid-cols-1 md:grid-cols-2 bg-white/95 backdrop-blur-xl rounded-[28px] overflow-hidden shadow-[0_1px_0_#ffffff_inset,0_0_0_1px_rgba(27,78,128,0.08),0_32px_80px_-14px_rgba(27,78,128,0.2)] border border-white anim-pop">
        {/* Kolom Kiri: Cover Card Gradient Biru ElearnMath */}
        <div className="relative px-7 py-7 md:p-12 bg-gradient-to-br from-[#2E7BC4] via-[#2365A5] to-[#174470] text-white flex flex-col justify-between overflow-hidden">
          {/* Kertas berpetak & simbol matematika */}
          <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:26px_26px] [mask-image:linear-gradient(to_bottom,#000,transparent_88%)]" aria-hidden="true" />
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full pointer-events-none blur-xl" />
          <div className="absolute -bottom-16 -left-16 w-60 h-60 bg-[#FFB454]/25 rounded-full pointer-events-none blur-xl" />
          <span className="glyph glyph-light hidden md:block" style={{ top: '10%', right: '10%', fontSize: 56 }} aria-hidden="true">π</span>
          <span className="glyph glyph-light hidden md:block" style={{ bottom: '18%', right: '14%', fontSize: 44, ['--delay' as string]: '-8s' }} aria-hidden="true">∑</span>

          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 md:px-3.5 py-1 md:py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 shadow-[0_1px_0_rgba(255,255,255,0.2)_inset] text-[11px] md:text-xs font-bold uppercase tracking-wider mb-3 md:mb-6 text-[#EAF6FF]">
              <Sparkles className="w-3.5 h-3.5 text-[#FFB454]" /> E-LEARNING MATEMATIKA INTERAKTIF
            </div>

            <h1 className="text-2xl md:text-[34px] font-extrabold leading-[1.18] md:mb-3.5 tracking-[-0.02em]">
              Belajar Matematika Jadi Lebih Mudah &amp; Terarah
            </h1>

            <p className="hidden md:block text-sm text-[#EAF6FF]/90 leading-relaxed mb-8">
              Akses materi komprehensif, pengerjaan LKPD mandiri terstruktur, serta latihan dan evaluasi akhir dengan umpan balik langsung.
            </p>

            <div className="hidden md:block space-y-2.5">
              {FITUR.map(({ icon: Icon, warna, teks }, i) => (
                <div
                  key={teks}
                  className="anim-rise flex items-center gap-3 p-3 rounded-2xl bg-white/[0.11] border border-white/[0.18] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] backdrop-blur-md text-sm font-semibold transition-colors duration-150 hover:bg-white/[0.16]"
                  style={{ ['--i' as string]: i + 1 }}
                >
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <Icon className={`w-4 h-4 ${warna}`} />
                  </div>
                  <span>{teks}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 pt-8 mt-6 border-t border-white/15 hidden md:flex items-center justify-between gap-4 text-xs text-[#EAF6FF]/70">
            <span>&copy; 2026 elearnMath. Seluruh hak cipta dilindungi.</span>
            <span className="hidden md:inline font-mono text-[#EAF6FF]/85 bg-white/10 border border-white/15 rounded-lg px-2.5 py-1" aria-hidden="true">x̄ = Σx / n</span>
          </div>
        </div>

        {/* Kolom Kanan: Form Otentikasi Supabase */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="mb-6">
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-[#3687D4] to-[#1B4E80] text-white flex items-center justify-center text-2xl font-black mb-4 shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_10px_22px_-4px_rgba(27,78,128,0.35)]">
              e
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-md bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-xs text-white flex items-center justify-center font-black ring-1 ring-white/80">π</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-[-0.015em] text-[#1B4E80]">
              Masuk ke elearn<span className="text-[#F0932B]">Math</span>
            </h2>
            <p className="text-sm text-[#66748C] mt-1">
              Silakan masukkan akun Anda untuk melanjutkan belajar.
            </p>
          </div>

          {info && (
            <div role="status" className="mb-5 p-3.5 rounded-xl bg-[#E4F8EE] border border-[#BBF7D0] text-[#166534] text-xs font-semibold leading-relaxed flex gap-2 anim-rise">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {info}
            </div>
          )}

          {error && (
            <div key={errorKey} role="alert" className="mb-5 p-3.5 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-medium leading-relaxed flex gap-2 anim-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">
                Alamat Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@siswa.sekolah.id"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-[#1F2A37] uppercase tracking-wide">
                  Kata Sandi
                </label>
                <Link href="/lupa-password" className="text-xs font-semibold text-[#2E7BC4] hover:text-[#1B4E80] hover:underline underline-offset-2">
                  Lupa kata sandi?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="btn-press absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#2E7BC4] hover:bg-[#EAF6FF]"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-press group w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2263A3] hover:from-[#2468A9] hover:to-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_10px_22px_-4px_rgba(46,123,196,0.38)] disabled:opacity-70"
            >
              {loading ? <Spinner /> : null}
              {loading ? 'Memverifikasi...' : 'Masuk Sekarang'}
              {!loading && <ArrowRight className="w-4 h-4 transition-transform duration-150 ease-[var(--ease-out)] sm:group-hover:translate-x-0.5" />}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-[#66748C] leading-relaxed">
            Belum memiliki akun?{' '}
            <Link href="/daftar" className="font-bold text-[#2E7BC4] hover:text-[#1B4E80] hover:underline underline-offset-2">
              Daftar di sini
            </Link>
            . Akun baru aktif setelah disetujui Admin Sekolah.
            {KONTAK_ADMIN && (
              <div className="mt-1.5 font-semibold text-[#1B4E80]">Kontak Admin: {KONTAK_ADMIN}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
