import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Check, Minus, ShieldCheck, Users, ArrowRight, Lock } from 'lucide-react';

export const metadata: Metadata = { title: 'Hak Akses' };

const FITUR: { grup: string; item: [string, boolean, boolean, boolean][] }[] = [
  {
    grup: 'Akun & sekolah',
    item: [
      ['Mendaftar akun sendiri (menunggu persetujuan)', true, true, false],
      ['Menambah, menyetujui, menonaktifkan, dan menghapus akun', false, false, true],
      ['Mengatur peran (siswa/guru/admin) & kelas pengguna', false, false, true],
      ['Membuat kelas dan mengatur anggota kelas', false, false, true],
      ['Mengatur jadwal mengajar', false, false, true],
      ['Mengubah profil & kata sandi sendiri', true, true, true],
    ],
  },
  {
    grup: 'Pembelajaran',
    item: [
      ['Membaca materi yang sudah terbit untuk kelasnya', true, true, false],
      ['Menambah/mengubah materi, mengatur terbit & kelas tujuan', false, true, false],
      ['Menyusun LKPD bertahap & bank soal (kunci, rubrik)', false, true, false],
      ['Mengerjakan & mengumpulkan LKPD, latihan, evaluasi', true, false, false],
      ['Melihat kunci jawaban & rubrik', false, true, false],
    ],
  },
  {
    grup: 'Penilaian & pemantauan',
    item: [
      ['Koreksi dengan AI, memvalidasi & menerbitkan nilai', false, true, false],
      ['Mengizinkan pengerjaan ulang / menghapus pengumpulan', false, true, false],
      ['Melihat nilai & catatan guru miliknya sendiri', true, false, false],
      ['Rekap nilai kelas & ekspor Excel', false, true, false],
      ['Memantau aktivitas, status online, dan keluar tab', false, true, true],
    ],
  },
  {
    grup: 'Komunikasi',
    item: [
      ['Membaca pengumuman & agenda kelasnya', true, true, true],
      ['Membuat pengumuman & agenda untuk kelas yang diampu', false, true, false],
      ['Membuat pengumuman seluruh sekolah & melihat semua pengumuman', false, false, true],
      ['Menerima notifikasi (lonceng)', true, true, true],
    ],
  },
];

export default async function HakAksesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: saya }, { data: semua }] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('users').select('role, status_approval'),
  ]);
  const hitung = (r: string) => (semua ?? []).filter((u) => u.role === r && u.status_approval === 'APPROVED').length;
  const Tanda = ({ ya }: { ya: boolean }) =>
    ya ? (
      <span className="inline-flex w-6 h-6 rounded-lg bg-[#E4F8EE] text-[#15885A] items-center justify-center" aria-label="Boleh"><Check className="w-4 h-4" strokeWidth={3} /></span>
    ) : (
      <span className="inline-flex w-6 h-6 rounded-lg bg-[#F1F5F9] text-[#CBD5E1] items-center justify-center" aria-label="Tidak"><Minus className="w-4 h-4" /></span>
    );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Hak Akses" userRole="admin" userName={saya?.full_name || 'Admin'} />
      <StaffNav role="admin" />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1000px] w-full mx-auto">
        <div className="hero-navy p-6 md:p-7 mb-5 anim-rise">
          <div className="relative z-10">
            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.12] border border-white/20 text-[#7CE3B1] mb-2">Keamanan &amp; RLS</span>
            <h1 className="text-2xl md:text-[28px] font-extrabold text-white tracking-[-0.02em] flex items-center gap-2.5"><ShieldCheck className="w-6 h-6 text-[#7CE3B1]" /> Hak Akses Peran</h1>
            <p className="text-xs md:text-sm text-[#D2E6FA]/90 mt-1 max-w-2xl leading-relaxed">
              Setiap akun memiliki satu peran. Menu, halaman, dan data dibatasi sesuai peran, baik di aplikasi maupun di database (Row Level Security), sehingga tidak bisa ditembus dengan mengetik alamat halaman.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
          {([
            ['Siswa', hitung('siswa'), 'Belajar materi, mengerjakan tugas, melihat nilai.', 'from-[#5FA8E8] to-[#2E7BC4]'],
            ['Guru', hitung('guru'), 'Mengelola materi, LKPD, soal, penilaian, dan memantau siswa.', 'from-[#194B7C] to-[#0E2A48]'],
            ['Admin', hitung('admin'), 'Mengelola akun, kelas, jadwal, hak akses, dan pengumuman sekolah.', 'from-[#FFB454] to-[#E37A12]'],
          ] as const).map(([nama, n, ket]) => (
            <div key={nama} className="bento-stat p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-[#113355]">{nama}</span>
                <span className="text-xs font-bold text-[#113355] bg-[#EAF5FF] border border-[#BFDBFE] px-2.5 py-0.5 rounded-full flex items-center gap-1 tabular"><Users className="w-3.5 h-3.5 text-[#2E7BC4]" /> {n} aktif</span>
              </div>
              <p className="text-xs text-[#5B6B82] mt-2 leading-relaxed">{ket}</p>
            </div>
          ))}
        </div>

        <div className="glass-card overflow-hidden anim-rise">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F5F9FD] text-[#5A6B82] text-xs border-b border-[#E1EAF4]">
                  <th className="text-left px-4 py-3.5 font-extrabold uppercase tracking-wider text-xs">Fitur</th>
                  <th className="px-3 py-3.5 font-extrabold w-20 uppercase tracking-wider text-xs">Siswa</th>
                  <th className="px-3 py-3.5 font-extrabold w-20 uppercase tracking-wider text-xs">Guru</th>
                  <th className="px-3 py-3.5 font-extrabold w-20 uppercase tracking-wider text-xs">Admin</th>
                </tr>
              </thead>
              <tbody>
                {FITUR.map((g) => (
                  <React.Fragment key={g.grup}>
                    <tr><td colSpan={4} className="px-4 pt-4 pb-1 text-xs font-extrabold text-[#F0932B] uppercase tracking-wider">{g.grup}</td></tr>
                    {g.item.map(([nama, s, gu, a]) => (
                      <tr key={nama} className="border-t border-[#F1F5F9] hover:bg-[#F8FBFF]/80 transition-colors duration-150">
                        <td className="px-4 py-2.5 text-[#1F2A37] text-xs sm:text-sm">{nama}</td>
                        <td className="text-center"><Tanda ya={s} /></td>
                        <td className="text-center"><Tanda ya={gu} /></td>
                        <td className="text-center"><Tanda ya={a} /></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <Link href="/admin/pengguna" className="group glass-card card-hover p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#EAF6FF] text-[#2E7BC4] flex items-center justify-center"><Users className="w-5 h-5" /></span>
            <span className="flex-1">
              <span className="block text-sm font-extrabold text-[#1B4E80]">Ubah peran pengguna</span>
              <span className="block text-xs text-[#66748C]">Pengguna → Ubah → Peran</span>
            </span>
            <ArrowRight className="w-4 h-4 text-[#94A3B8] transition-transform duration-150 ease-[var(--ease-out)] sm:group-hover:translate-x-0.5" />
          </Link>
          <div className="glass-card p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#FFF1DD] text-[#E37A12] flex items-center justify-center"><Lock className="w-5 h-5" /></span>
            <span className="text-xs text-[#66748C] leading-relaxed">
              Akun berstatus <strong>Menunggu</strong> atau <strong>Ditolak/nonaktif</strong> tidak bisa masuk sama sekali. Admin tidak bisa mengubah peran & status akunnya sendiri.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
