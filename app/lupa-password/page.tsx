'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Spinner } from '@/components/ui/skeleton';
import { KONTAK_ADMIN } from '@/lib/akses';
import { ArrowLeft, Mail, MailCheck, AlertCircle } from 'lucide-react';

export default function LupaPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [terkirim, setTerkirim] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/atur-ulang-password`,
      });
      if (err) {
        setError(
          err.status === 429 || /rate limit|seconds/i.test(err.message)
            ? 'Permintaan terlalu sering. Tunggu sekitar 1 menit lalu coba lagi.'
            : /fetch|network/i.test(err.message)
            ? 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'
            : `Tautan gagal dikirim: ${err.message}`
        );
        return;
      }
      setTerkirim(true);
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={terkirim ? 'Cek email Anda' : 'Lupa kata sandi?'}
      subtitle={
        terkirim
          ? `Jika ${email.trim()} terdaftar, tautan untuk membuat kata sandi baru sudah dikirim. Buka tautan itu di perangkat & peramban ini.`
          : 'Masukkan email akun Anda. Kami akan mengirim tautan untuk membuat kata sandi baru.'
      }
    >
      {terkirim ? (
        <div className="anim-rise">
          <div className="w-14 h-14 rounded-2xl bg-[#E4F8EE] flex items-center justify-center mb-5">
            <MailCheck className="w-7 h-7 text-[#15885A]" />
          </div>
          <p className="text-xs text-[#66748C] leading-relaxed mb-6">
            Tidak menerima email dalam beberapa menit? Periksa folder spam, atau hubungi Admin sekolah
            {KONTAK_ADMIN ? ` (${KONTAK_ADMIN})` : ''}.
          </p>
          <Link href="/login" className="btn-press inline-flex items-center gap-2 text-sm font-bold text-[#2E7BC4] hover:text-[#1B4E80]">
            <ArrowLeft className="w-4 h-4" /> Kembali ke halaman masuk
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-medium flex gap-2 anim-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
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
                className="input-field w-full pl-10 pr-4 py-3 rounded-xl bg-[#F8FBFF] text-sm focus:bg-white"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-press w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2263A3] hover:from-[#2468A9] hover:to-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_10px_22px_-4px_rgba(46,123,196,0.38)] disabled:opacity-70"
          >
            {loading && <Spinner />}
            {loading ? 'Mengirim...' : 'Kirim Tautan Reset'}
          </button>
          <Link href="/login" className="flex items-center justify-center gap-2 text-sm font-semibold text-[#66748C] hover:text-[#2E7BC4] pt-2">
            <ArrowLeft className="w-4 h-4" /> Kembali ke halaman masuk
          </Link>
        </form>
      )}
    </AuthCard>
  );
}
