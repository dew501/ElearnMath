'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { Lock, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react';

type Fase = 'memeriksa' | 'form' | 'tidak-valid';

function pesanGagal(err: { message?: string; code?: string }): string {
  const msg = err.message || '';
  if (err.code === 'same_password' || /different from the old/i.test(msg)) return 'Kata sandi baru harus berbeda dari kata sandi lama.';
  if (err.code === 'weak_password' || /weak|at least/i.test(msg)) return 'Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan campuran huruf dan angka.';
  if (/session|jwt|expired/i.test(msg)) return 'Sesi reset sudah berakhir. Minta tautan baru dari halaman lupa kata sandi.';
  return msg || 'Kata sandi gagal diubah.';
}

export default function AturUlangPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const sudahDicek = useRef(false);

  const [fase, setFase] = useState<Fase>('memeriksa');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [lihat, setLihat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tautan dari email membawa ?code=...; client Supabase menukarnya otomatis menjadi sesi pemulihan
  // saat halaman dimuat (detectSessionInUrl). getSession() menunggu proses itu selesai.
  useEffect(() => {
    if (sudahDicek.current) return;
    sudahDicek.current = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setFase('form');
        return;
      }
      // Cadangan bila penukaran otomatis tidak berjalan
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        setFase(err ? 'tidak-valid' : 'form');
        return;
      }
      setFase('tidak-valid');
    })();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError('Kata sandi minimal 8 karakter.');
    if (pw !== pw2) return setError('Konfirmasi kata sandi tidak sama.');
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    if (err) {
      setLoading(false);
      setError(pesanGagal(err));
      return;
    }
    await supabase.auth.signOut();
    router.replace('/login?reset=berhasil');
  };

  const kuat = pw.length >= 12 && /\d/.test(pw) && /[a-z]/i.test(pw) ? 3 : pw.length >= 8 && /\d/.test(pw) ? 2 : pw.length > 0 ? 1 : 0;

  if (fase === 'memeriksa') {
    return (
      <AuthCard title="Atur kata sandi baru" subtitle="Memeriksa tautan reset...">
        <div className="space-y-3" role="status">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-2/3" />
        </div>
      </AuthCard>
    );
  }

  if (fase === 'tidak-valid') {
    return (
      <AuthCard title="Tautan tidak berlaku" subtitle="Tautan reset kata sandi sudah kedaluwarsa, sudah dipakai, atau dibuka di peramban yang berbeda.">
        <Link href="/lupa-password" className="btn-press w-full py-3 px-4 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center">
          Minta Tautan Baru
        </Link>
        <Link href="/login" className="block text-center text-sm font-semibold text-[#66748C] hover:text-[#2E7BC4] pt-4">
          Kembali ke halaman masuk
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Atur kata sandi baru" subtitle="Buat kata sandi baru untuk akun Anda. Setelah disimpan, Anda akan diminta masuk kembali.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-medium flex gap-2 anim-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {[
          { id: 'pw', label: 'Kata Sandi Baru', value: pw, set: setPw, auto: 'new-password' },
          { id: 'pw2', label: 'Ulangi Kata Sandi', value: pw2, set: setPw2, auto: 'new-password' },
        ].map((f) => (
          <div key={f.id}>
            <label htmlFor={f.id} className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">
              {f.label}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id={f.id}
                type={lihat ? 'text' : 'password'}
                autoComplete={f.auto}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-[#DCEAF7] bg-[#F8FAFC] text-sm focus:bg-white focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 transition-all"
              />
              {f.id === 'pw' && (
                <button
                  type="button"
                  onClick={() => setLihat((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#2E7BC4] hover:bg-[#EAF6FF]"
                  aria-label={lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {lihat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2" aria-hidden={kuat === 0}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${kuat >= n ? (kuat === 1 ? 'bg-[#E3543F]' : kuat === 2 ? 'bg-[#F0932B]' : 'bg-[#22B573]') : 'bg-[#E6EEF7]'}`} />
          ))}
          <span className="text-[11px] font-semibold text-[#66748C] w-16 text-right">
            {['', 'Lemah', 'Cukup', 'Kuat'][kuat]}
          </span>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-press w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2468A9] hover:from-[#1B4E80] hover:to-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-70"
        >
          {loading ? <Spinner /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}
        </button>
      </form>
    </AuthCard>
  );
}
