'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { SiswaNav } from '@/components/siswa-nav';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { formatTanggal, pesanGalat } from '@/lib/pengerjaan';
import { IdCard, KeyRound, Save, Eye, EyeOff, School, Mail, CalendarClock, ShieldCheck, AlertTriangle } from 'lucide-react';

type Peran = 'siswa' | 'guru' | 'admin';
interface Profil {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Peran;
  class_name: string | null;
  nomor_induk: string | null;
  created_at: string | null;
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 transition-all';

export default function ProfilPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profil, setProfil] = useState<Profil | null>(null);
  const [kelas, setKelas] = useState<string[]>([]);
  const [guruKelas, setGuruKelas] = useState<string[]>([]);
  const [nama, setNama] = useState('');
  const [nomor, setNomor] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [lihat, setLihat] = useState(false);
  const [gantiSibuk, setGantiSibuk] = useState(false);
  const [galatSandi, setGalatSandi] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const { data } = await supabase
        .from('users')
        .select('id, email, full_name, role, class_name, nomor_induk, created_at')
        .eq('id', user.id)
        .maybeSingle();
      const p = (data ?? { id: user.id, email: user.email ?? null, full_name: null, role: 'siswa', class_name: null, nomor_induk: null, created_at: null }) as Profil;
      setProfil(p);
      setNama(p.full_name ?? '');
      setNomor(p.nomor_induk ?? '');
      // Kelas: siswa → kelasnya + guru pengampu; guru → kelas yang diampu
      const { data: ang } = await supabase.from('kelas_anggota').select('kelas_id, peran, kelas:kelas_id(nama)').eq('user_id', user.id);
      const namaKelas = ((ang ?? []) as any[]).map((a) => a.kelas?.nama).filter(Boolean) as string[];
      setKelas(namaKelas);
      if (p.role === 'siswa' && ang?.length) {
        const { data: guru } = await supabase
          .from('kelas_anggota')
          .select('user:user_id(full_name)')
          .eq('kelas_id', (ang[0] as any).kelas_id)
          .eq('peran', 'guru');
        setGuruKelas(((guru ?? []) as any[]).map((g) => g.user?.full_name).filter(Boolean));
      }
    })();
  }, [router, supabase]);

  const simpanProfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setGalat(null);
    if (!nama.trim()) return setGalat('Nama tidak boleh kosong.');
    setMenyimpan(true);
    const { error } = await supabase.rpc('ubah_profil', { p_nama: nama.trim(), p_nomor_induk: nomor.trim() || null });
    setMenyimpan(false);
    if (error) return setGalat(pesanGalat(error));
    setProfil((p) => (p ? { ...p, full_name: nama.trim(), nomor_induk: nomor.trim() || null } : p));
    setToast({ id: Date.now(), tone: 'success', text: 'Profil tersimpan.' });
  };

  const gantiSandi = async (e: React.FormEvent) => {
    e.preventDefault();
    setGalatSandi(null);
    if (!lama) return setGalatSandi('Isi kata sandi lama terlebih dahulu.');
    if (baru.length < 8) return setGalatSandi('Kata sandi baru minimal 8 karakter.');
    if (baru !== ulang) return setGalatSandi('Konfirmasi kata sandi baru tidak sama.');
    if (baru === lama) return setGalatSandi('Kata sandi baru harus berbeda dari kata sandi lama.');
    if (!profil?.email) return setGalatSandi('Email akun tidak ditemukan.');
    setGantiSibuk(true);
    // Pastikan kata sandi lama benar sebelum mengganti
    const cek = await supabase.auth.signInWithPassword({ email: profil.email, password: lama });
    if (cek.error) {
      setGantiSibuk(false);
      return setGalatSandi(/invalid/i.test(cek.error.message) ? 'Kata sandi lama salah.' : cek.error.message);
    }
    const { error } = await supabase.auth.updateUser({ password: baru });
    setGantiSibuk(false);
    if (error) {
      return setGalatSandi(
        error.code === 'same_password' ? 'Kata sandi baru harus berbeda dari kata sandi lama.' : error.code === 'weak_password' ? 'Kata sandi terlalu lemah.' : error.message
      );
    }
    setLama('');
    setBaru('');
    setUlang('');
    setToast({ id: Date.now(), tone: 'success', text: 'Kata sandi berhasil diganti. Gunakan kata sandi baru saat masuk berikutnya.' });
  };

  const kuat = baru.length >= 12 && /\d/.test(baru) && /[a-z]/i.test(baru) ? 3 : baru.length >= 8 && /\d/.test(baru) ? 2 : baru.length > 0 ? 1 : 0;
  const labelNomor = profil?.role === 'siswa' ? 'NIS / NISN' : 'NIP / NUPTK';
  const berubah = profil && (nama.trim() !== (profil.full_name ?? '') || nomor.trim() !== (profil.nomor_induk ?? ''));

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Profil Saya" userRole={profil?.role ?? null} userName={profil?.full_name ?? '…'} />
      {profil?.role === 'siswa' ? <SiswaNav aktif="-" /> : <StaffNav role={profil ? (profil.role as 'guru' | 'admin') : null} />}

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[960px] w-full mx-auto">
        {!profil ? (
          <div className="glass-card p-6 space-y-3">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <div className="space-y-5">
            <section className="glass-card p-6 md:p-7 flex flex-col sm:flex-row gap-5 sm:items-center relative overflow-hidden anim-rise">
              <span className="absolute -right-3 -top-10 text-[140px] font-extrabold text-[#2E7BC4]/[0.05] select-none leading-none" aria-hidden="true">∞</span>
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-white text-3xl font-extrabold flex items-center justify-center shadow-lg shrink-0">
                {(profil.full_name || profil.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 relative">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-extrabold text-[#1B4E80] truncate">{profil.full_name || '(tanpa nama)'}</h1>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#D3ECFF] text-[#1B4E80] uppercase tracking-wide">{profil.role}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[#4B5A70]">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#94A3B8]" /> {profil.email}</span>
                  {profil.role !== 'admin' && (
                    <span className="flex items-center gap-1.5">
                      <School className="w-3.5 h-3.5 text-[#94A3B8]" />
                      {profil.role === 'siswa' ? `Kelas ${kelas[0] ?? profil.class_name ?? '— belum ada'}` : kelas.length ? `Mengampu ${kelas.join(', ')}` : 'Belum mengampu kelas'}
                    </span>
                  )}
                  {profil.nomor_induk && <span className="flex items-center gap-1.5"><IdCard className="w-3.5 h-3.5 text-[#94A3B8]" /> {labelNomor}: {profil.nomor_induk}</span>}
                  {profil.created_at && <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-[#94A3B8]" /> Terdaftar {formatTanggal(profil.created_at)}</span>}
                </div>
                {profil.role === 'siswa' && (
                  <p className="text-xs text-[#66748C] mt-2">
                    {guruKelas.length ? <>Guru pengampu: <strong className="text-[#1B4E80]">{guruKelas.join(', ')}</strong></> : 'Guru pengampu belum ditentukan.'}
                  </p>
                )}
              </div>
            </section>

            {profil.role === 'siswa' && !kelas.length && (
              <div className="p-4 rounded-2xl bg-[#FFF8EC] border border-[#FBD38D] text-xs font-semibold text-[#92400E] flex items-center gap-2 anim-rise">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Kamu belum dimasukkan ke kelas. Hubungi admin sekolah agar bisa melihat jadwal dan materi khusus kelas.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <form onSubmit={simpanProfil} className="glass-card p-6 md:p-7 space-y-4 anim-rise" style={{ ['--i' as string]: 1 }}>
                <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><IdCard className="w-4 h-4" /> Data Diri</h2>
                <div>
                  <label htmlFor="p-nama" className="block text-xs font-bold text-[#1F2A37] mb-1.5">Nama lengkap</label>
                  <input id="p-nama" value={nama} onChange={(e) => setNama(e.target.value)} maxLength={100} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="p-nomor" className="block text-xs font-bold text-[#1F2A37] mb-1.5">{labelNomor} <span className="font-normal text-[#94A3B8]">(opsional)</span></label>
                  <input id="p-nomor" value={nomor} onChange={(e) => setNomor(e.target.value)} maxLength={30} inputMode="numeric" className={`${inputClass} tabular`} />
                </div>
                <div>
                  <span className="block text-xs font-bold text-[#1F2A37] mb-1.5">Email</span>
                  <div className="px-3.5 py-2.5 rounded-xl border border-[#E6EEF7] bg-[#F8FAFC] text-sm text-[#66748C]">{profil.email}</div>
                  <p className="text-[11px] text-[#94A3B8] mt-1">Email, peran, dan kelas diatur oleh admin sekolah.</p>
                </div>
                {galat && (
                  <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {galat}
                  </div>
                )}
                <button type="submit" disabled={menyimpan || !berubah} className="btn-press w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                  {menyimpan ? <Spinner /> : <Save className="w-4 h-4" />} Simpan Data Diri
                </button>
              </form>

              <form onSubmit={gantiSandi} noValidate className="glass-card p-6 md:p-7 space-y-4 anim-rise" style={{ ['--i' as string]: 2 }}>
                <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><KeyRound className="w-4 h-4" /> Ganti Kata Sandi</h2>
                {[
                  { id: 'p-lama', label: 'Kata sandi lama', v: lama, set: setLama, auto: 'current-password' },
                  { id: 'p-baru', label: 'Kata sandi baru', v: baru, set: setBaru, auto: 'new-password' },
                  { id: 'p-ulang', label: 'Ulangi kata sandi baru', v: ulang, set: setUlang, auto: 'new-password' },
                ].map((f) => (
                  <div key={f.id}>
                    <label htmlFor={f.id} className="block text-xs font-bold text-[#1F2A37] mb-1.5">{f.label}</label>
                    <div className="relative">
                      <input id={f.id} type={lihat ? 'text' : 'password'} autoComplete={f.auto} value={f.v} onChange={(e) => f.set(e.target.value)} className={`${inputClass} pr-11`} />
                      {f.id === 'p-lama' && (
                        <button type="button" onClick={() => setLihat((x) => !x)} aria-label={lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#2E7BC4] hover:bg-[#EAF6FF]">
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
                  <span className="text-[11px] font-semibold text-[#66748C] w-14 text-right">{['', 'Lemah', 'Cukup', 'Kuat'][kuat]}</span>
                </div>
                {galatSandi && (
                  <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {galatSandi}
                  </div>
                )}
                <button type="submit" disabled={gantiSibuk} className="btn-press w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#1B4E80] hover:bg-[#123a61] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                  {gantiSibuk ? <Spinner /> : <ShieldCheck className="w-4 h-4" />} Ganti Kata Sandi
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
