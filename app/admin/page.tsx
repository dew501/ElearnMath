import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Users, UserCheck, GraduationCap, BookOpenText, ListChecks, ClipboardCheck, ArrowRight, Sparkles, Hourglass } from 'lucide-react';

export const metadata: Metadata = { title: 'Ringkasan Admin' };

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [usersRes, materiRes, soalRes, lkpdRes, latihanRes, evaluasiRes] = await Promise.all([
    supabase.from('users').select('id, email, full_name, class_name, role, status_approval, created_at').order('created_at', { ascending: false }),
    supabase.from('materi').select('id', { count: 'exact', head: true }),
    supabase.from('questions').select('id', { count: 'exact', head: true }),
    supabase.from('jawaban_lkpd').select('status, allow_retake'),
    supabase.from('pengerjaan_latihan').select('feedback'),
    supabase.from('pengerjaan_evaluasi').select('id', { count: 'exact', head: true }),
  ]);

  const users = usersRes.data ?? [];
  const saya = users.find((u) => u.id === user.id);
  const siswa = users.filter((u) => u.role === 'siswa');
  const menunggu = users.filter((u) => u.status_approval === 'PENDING');
  const lkpd = lkpdRes.data ?? [];
  const latihan = latihanRes.data ?? [];
  const lkpdMenunggu = lkpd.filter((r) => r.status !== 'graded' && !r.allow_retake).length;
  const latihanMenunggu = latihan.filter((r) => r.feedback === null).length;

  const kartu = [
    { label: 'Siswa aktif', nilai: siswa.filter((u) => u.status_approval === 'APPROVED').length, icon: GraduationCap, href: '/admin/pengguna?peran=siswa', warna: 'from-[#5FA8E8] to-[#2E7BC4]' },
    { label: 'Menunggu persetujuan', nilai: menunggu.length, icon: Hourglass, href: '/admin/pengguna?status=PENDING', warna: 'from-[#FFB454] to-[#E37A12]' },
    { label: 'Guru', nilai: users.filter((u) => u.role === 'guru').length, icon: UserCheck, href: '/admin/pengguna?peran=guru', warna: 'from-[#7C8CF8] to-[#4F5BD5]' },
    { label: 'Bab materi', nilai: materiRes.count ?? 0, icon: BookOpenText, href: '/guru/materi', warna: 'from-[#34C98A] to-[#15885A]' },
    { label: 'Soal di bank', nilai: soalRes.count ?? 0, icon: ListChecks, href: '/guru/soal', warna: 'from-[#5FA8E8] to-[#1B4E80]' },
    { label: 'Pengumpulan evaluasi', nilai: evaluasiRes.count ?? 0, icon: ClipboardCheck, href: '/guru/koreksi', warna: 'from-[#F27E6B] to-[#C2412E]' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Ringkasan Admin" userRole="admin" userName={saya?.full_name || user.email?.split('@')[0] || 'Admin'} />
      <StaffNav role="admin" />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <section className="glass-card p-6 md:p-7 mb-6 relative overflow-hidden anim-rise">
          <span className="absolute -right-2 -top-10 text-[150px] font-extrabold text-[#2E7BC4]/[0.05] select-none leading-none" aria-hidden="true">Σ</span>
          <div className="text-xs font-bold text-[#F0932B] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Panel Admin
          </div>
          <h1 className="text-2xl md:text-[28px] font-extrabold text-[#1B4E80]">Halo, {saya?.full_name || 'Admin'}!</h1>
          <p className="text-sm text-[#66748C] mt-1.5 max-w-xl">
            Pantau akun, materi, dan pengumpulan tugas. Akun siswa baru perlu disetujui sebelum bisa masuk.
          </p>
        </section>

        {usersRes.error && (
          <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold">
            Data pengguna gagal dimuat. Muat ulang halaman ini.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {kartu.map(({ label, nilai, icon: Icon, href, warna }, i) => (
            <Link key={label} href={href} className="glass-card card-hover p-5 flex items-center gap-4 anim-rise" style={{ ['--i' as string]: i + 1 }}>
              <span className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${warna} text-white flex items-center justify-center shadow-md shrink-0`}>
                <Icon className="w-6 h-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-extrabold text-[#1B4E80] leading-none tabular">{nilai}</span>
                <span className="block text-xs font-semibold text-[#66748C] mt-1">{label}</span>
              </span>
            </Link>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <section className="glass-card p-6 anim-rise" style={{ ['--i' as string]: 7 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2">
                <Users className="w-4 h-4" /> Menunggu Persetujuan
              </h2>
              <Link href="/admin/pengguna?status=PENDING" className="text-xs font-bold text-[#2E7BC4] hover:underline flex items-center gap-1">
                Kelola <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {menunggu.length === 0 ? (
              <p className="text-sm text-[#66748C] py-6 text-center">Tidak ada akun yang menunggu. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {menunggu.slice(0, 5).map((u) => (
                  <li key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-[#FBD38D]">
                    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                      {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#1F2A37] truncate">{u.full_name || u.email}</span>
                      <span className="block text-[11px] text-[#66748C] truncate">{u.email}</span>
                    </span>
                  </li>
                ))}
                {menunggu.length > 5 && <li className="text-xs text-[#66748C] text-center pt-1">+{menunggu.length - 5} akun lainnya</li>}
              </ul>
            )}
          </section>

          <section className="glass-card p-6 anim-rise" style={{ ['--i' as string]: 8 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4" /> Belum Dinilai Guru
              </h2>
              <Link href="/guru/koreksi" className="text-xs font-bold text-[#2E7BC4] hover:underline flex items-center gap-1">
                Ke panel koreksi <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {[
                { label: 'LKPD', menunggu: lkpdMenunggu, total: lkpd.length },
                { label: 'Latihan', menunggu: latihanMenunggu, total: latihan.length },
              ].map((r) => (
                <div key={r.label}>
                  <div className="flex justify-between text-xs font-semibold text-[#4B5A70] mb-1.5">
                    <span>{r.label}</span>
                    <span className="tabular">{r.total - r.menunggu} / {r.total} dinilai</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#E6EEF7] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#34C98A] to-[#15885A] transition-[width] duration-700" style={{ width: `${r.total ? ((r.total - r.menunggu) / r.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-[#94A3B8]">Evaluasi dinilai otomatis untuk pilihan ganda; guru dapat menyesuaikan nilainya di tab Evaluasi.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
