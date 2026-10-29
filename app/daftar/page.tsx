'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Spinner } from '@/components/ui/skeleton';
import { KONTAK_ADMIN } from '@/lib/akses';
import { AlertCircle, ArrowLeft, Eye, EyeOff, GraduationCap, Hourglass, Presentation, UserPlus } from 'lucide-react';

const inputClass =
  'input-field w-full px-3.5 py-3 rounded-xl bg-[#F8FBFF] text-sm text-[#1F2A37] placeholder:text-[#94A3B8] focus:bg-white';

function pesanDaftar(err: { message?: string; code?: string; status?: number }): string {
  const m = err.message || '';
  if (err.code === 'user_already_exists' || /already registered|already exists/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk, atau gunakan "Lupa kata sandi" bila lupa.';
  if (err.code === 'signup_disabled' || /signups? not allowed|disabled/i.test(m)) return 'Pendaftaran sedang ditutup. Hubungi admin sekolah untuk dibuatkan akun.';
  if (err.code === 'weak_password' || /password/i.test(m)) return 'Kata sandi terlalu lemah. Gunakan minimal 8 karakter dengan campuran huruf dan angka.';
  if (err.status === 429 || /rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  if (/email/i.test(m)) return 'Alamat email tidak valid.';
  if (/fetch|network/i.test(m)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  return m || 'Pendaftaran gagal. Silakan coba lagi.';
}

export default function DaftarPage() {
  const supabase = createClient();
  const [peran, setPeran] = useState<'siswa' | 'guru'>('siswa');
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [nomor, setNomor] = useState('');
  const [kelasId, setKelasId] = useState('');
  const [sandi, setSandi] = useState('');
  const [ulang, setUlang] = useState('');
  const [lihat, setLihat] = useState(false);
  const [kelas, setKelas] = useState<{ id: string; nama: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<'menunggu' | 'cek-email' | null>(null);

  useEffect(() => {
    supabase.from('kelas').select('id, nama').order('nama').then(({ data }) => setKelas((data ?? []) as { id: string; nama: string }[]));
  }, [supabase]);

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nama.trim().length < 3) return setError('Tulis nama lengkap (minimal 3 huruf).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Alamat email tidak valid.');
    if (sandi.length < 8) return setError('Kata sandi minimal 8 karakter.');
    if (sandi !== ulang) return setError('Konfirmasi kata sandi tidak sama.');
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: sandi,
        options: { data: { full_name: nama.trim(), peran, nomor_induk: nomor.trim() || null, kelas_id: peran === 'siswa' ? kelasId || null : null } },
      });
      if (err) return setError(pesanDaftar(err));
      // Akun baru belum disetujui: sesi tidak dipakai
      if (data.session) await supabase.auth.signOut();
      setSelesai(data.session ? 'menunggu' : 'cek-email');
    } catch (err: any) {
      setError(pesanDaftar(err ?? {}));
    } finally {
      setLoading(false);
    }
  };

  if (selesai) {
    return (
      <AuthCard
        title="Pendaftaran terkirim!"
        subtitle={
          selesai === 'menunggu'
            ? 'Akunmu sudah dibuat dan sekarang menunggu persetujuan admin sekolah. Setelah disetujui, kamu bisa masuk dan langsung bergabung ke kelas.'
            : 'Kami mengirim email konfirmasi. Buka tautannya, lalu tunggu persetujuan admin sekolah sebelum masuk.'
        }
      >
        <div className="anim-rise">
          <div className="w-14 h-14 rounded-2xl bg-[#FFF1DD] flex items-center justify-center mb-5">
            <Hourglass className="w-7 h-7 text-[#E37A12]" />
          </div>
          <p className="text-xs text-[#66748C] leading-relaxed mb-6">
            Jika setelah 1×24 jam akun belum disetujui, hubungi admin sekolah{KONTAK_ADMIN ? ` (${KONTAK_ADMIN})` : ''}.
          </p>
          <Link href="/login" className="btn-press w-full py-3 px-4 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center">
            Ke Halaman Masuk
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Buat akun baru" subtitle="Daftar sebagai siswa atau guru. Akun aktif setelah disetujui admin sekolah.">
      <form onSubmit={kirim} noValidate className="space-y-4">
        <div className="surface-inset grid grid-cols-2 gap-1 p-1 rounded-xl" role="radiogroup" aria-label="Daftar sebagai">
          {([
            ['siswa', 'Siswa', GraduationCap],
            ['guru', 'Guru', Presentation],
          ] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={peran === k}
              onClick={() => setPeran(k)}
              className={`btn-press py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 ${
                peran === k
                  ? 'bg-white text-[#1B4E80] shadow-[0_1px_3px_rgba(27,78,128,0.08),0_0_0_1px_rgba(27,78,128,0.04)]'
                  : 'text-[#66748C] hover:text-[#1B4E80]'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-medium flex gap-2 anim-shake">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <div>
          <label htmlFor="d-nama" className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">Nama Lengkap</label>
          <input id="d-nama" autoComplete="name" value={nama} onChange={(e) => setNama(e.target.value)} maxLength={100} placeholder="Sesuai data sekolah" className={inputClass} />
        </div>
        <div>
          <label htmlFor="d-email" className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">Alamat Email</label>
          <input id="d-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@siswa.sekolah.id" className={inputClass} />
        </div>
        <div className={`grid gap-3 ${peran === 'siswa' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <label htmlFor="d-nomor" className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">{peran === 'siswa' ? 'NIS' : 'NIP / NUPTK'} <span className="normal-case font-normal text-[#94A3B8]">(opsional)</span></label>
            <input id="d-nomor" inputMode="numeric" value={nomor} onChange={(e) => setNomor(e.target.value)} maxLength={30} className={`${inputClass} tabular`} />
          </div>
          {peran === 'siswa' && (
            <div>
              <label htmlFor="d-kelas" className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">Kelas</label>
              <select id="d-kelas" value={kelasId} onChange={(e) => setKelasId(e.target.value)} className={inputClass}>
                <option value="">Belum tahu</option>
                {kelas.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="d-sandi" className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">Kata Sandi</label>
            <div className="relative">
              <input id="d-sandi" type={lihat ? 'text' : 'password'} autoComplete="new-password" value={sandi} onChange={(e) => setSandi(e.target.value)} placeholder="Min. 8 karakter" className={`${inputClass} pr-10`} />
              <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#2E7BC4]">
                {lihat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="d-ulang" className="block text-xs font-bold text-[#1F2A37] mb-1.5 uppercase tracking-wide">Ulangi</label>
            <input id="d-ulang" type={lihat ? 'text' : 'password'} autoComplete="new-password" value={ulang} onChange={(e) => setUlang(e.target.value)} className={inputClass} />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-press w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#2E7BC4] to-[#2468A9] hover:from-[#1B4E80] hover:to-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 disabled:opacity-70">
          {loading ? <Spinner /> : <UserPlus className="w-4 h-4" />}
          {loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}
        </button>
        <Link href="/login" className="flex items-center justify-center gap-2 text-sm font-semibold text-[#66748C] hover:text-[#2E7BC4] pt-1">
          <ArrowLeft className="w-4 h-4" /> Sudah punya akun? Masuk
        </Link>
      </form>
    </AuthCard>
  );
}
