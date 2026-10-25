import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { tanggalIni, waktuRelatif } from '@/lib/waktu';
import { Users, UserCheck, School, ArrowRight, Sparkles, Hourglass, Megaphone, Eye, AlertTriangle, Star } from 'lucide-react';

export const metadata: Metadata = { title: 'Ringkasan Admin' };

export default async function AdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const awalHari = new Date(`${tanggalIni()}T00:00:00+07:00`);
  const sebulan = new Date(Date.now() - 30 * 86400000).toISOString();

  const [usersRes, kelasRes, anggotaRes, pengumumanRes, pengumumanBulanRes, tabRes] = await Promise.all([
    supabase.from('users').select('id, email, full_name, role, status_approval, kelas_diminta, created_at').order('created_at', { ascending: false }),
    supabase.from('kelas').select('id, nama').order('nama'),
    supabase.from('kelas_anggota').select('kelas_id, user_id, peran'),
    supabase.from('pengumuman').select('id, judul, penting, nama_pembuat, peran_pembuat, created_at').order('created_at', { ascending: false }).limit(4),
    supabase.from('pengumuman').select('id', { count: 'exact', head: true }).gte('created_at', sebulan),
    supabase.from('tab_switch_logs').select('id_siswa, created_at, siswa:id_siswa(full_name, class_name)').gte('created_at', awalHari.toISOString()).limit(1000),
  ]);

  const users = usersRes.data ?? [];
  const saya = users.find((u) => u.id === user.id);
  const kelas = kelasRes.data ?? [];
  const anggota = anggotaRes.data ?? [];
  const menunggu = users.filter((u) => u.status_approval === 'PENDING');
  const namaKelas = (id: string | null) => kelas.find((k) => k.id === id)?.nama;
  const guruAktif = users.filter((u) => u.role === 'guru' && u.status_approval === 'APPROVED');
  const ringkasKelas = kelas.map((k) => ({
    ...k,
    siswa: anggota.filter((a) => a.kelas_id === k.id && a.peran === 'siswa').length,
    guru: anggota.filter((a) => a.kelas_id === k.id && a.peran === 'guru').map((a) => users.find((u) => u.id === a.user_id)?.full_name).filter(Boolean) as string[],
  }));
  const tanpaGuru = ringkasKelas.filter((k) => !k.guru.length).length;
  const siswaTanpaKelas = users.filter((u) => u.role === 'siswa' && u.status_approval === 'APPROVED' && !anggota.some((a) => a.user_id === u.id && a.peran === 'siswa')).length;

  const tab = (tabRes.data ?? []) as unknown as { id_siswa: string; created_at: string; siswa: { full_name: string | null; class_name: string | null } | null }[];
  const tabPerSiswa = Array.from(
    tab.reduce((m, l) => {
      const s = m.get(l.id_siswa) ?? { nama: l.siswa?.full_name || 'Siswa', kelas: l.siswa?.class_name || '-', n: 0, terakhir: l.created_at };
      s.n += 1;
      if (l.created_at > s.terakhir) s.terakhir = l.created_at;
      return m.set(l.id_siswa, s);
    }, new Map<string, { nama: string; kelas: string; n: number; terakhir: string }>()).values()
  ).sort((a, b) => b.n - a.n);

  const kartu = [
    { label: 'Menunggu persetujuan', nilai: menunggu.length, icon: Hourglass, href: '/admin/pengguna?status=PENDING', warna: 'from-[#FFB454] to-[#E37A12]' },
    { label: 'Guru aktif', nilai: guruAktif.length, icon: UserCheck, href: '/admin/pengguna?peran=guru', warna: 'from-[#7C8CF8] to-[#4F5BD5]' },
    { label: 'Kelas', nilai: kelas.length, icon: School, href: '/admin/kelas', warna: 'from-[#34C98A] to-[#15885A]' },
    { label: 'Kelas tanpa guru', nilai: tanpaGuru, icon: AlertTriangle, href: '/admin/kelas', warna: 'from-[#F27E6B] to-[#C2412E]' },
    { label: 'Pengumuman 30 hari', nilai: pengumumanBulanRes.count ?? 0, icon: Megaphone, href: '/admin/pengumuman', warna: 'from-[#5FA8E8] to-[#2E7BC4]' },
    { label: 'Keluar tab hari ini', nilai: tab.length, icon: Eye, href: '/admin/keluar-tab', warna: 'from-[#F0932B] to-[#C2412E]' },
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
            Kelola akun, kelas, jadwal mengajar, dan pengumuman sekolah. Materi, soal, dan penilaian dikelola guru.
          </p>
        </section>

        {usersRes.error && (
          <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold">
            Data gagal dimuat. Muat ulang halaman ini. Jika berlanjut, pastikan migrasi database terbaru sudah dijalankan.
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="glass-card p-6 anim-rise" style={{ ['--i' as string]: 7 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><Users className="w-4 h-4" /> Menunggu Persetujuan</h2>
              <Link href="/admin/pengguna?status=PENDING" className="text-xs font-bold text-[#2E7BC4] hover:underline flex items-center gap-1">Kelola <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            {menunggu.length === 0 ? (
              <p className="text-sm text-[#66748C] py-6 flex items-center justify-center gap-1.5"><UserCheck className="w-4 h-4 text-[#15885A]" /> Tidak ada akun yang menunggu.</p>
            ) : (
              <ul className="space-y-2">
                {menunggu.slice(0, 5).map((u) => (
                  <li key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-[#FBD38D]">
                    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FFB454] to-[#F0932B] text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                      {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#1F2A37] truncate">{u.full_name || u.email}</span>
                      <span className="block text-[11px] text-[#66748C] truncate">
                        Daftar sebagai {u.role}{namaKelas(u.kelas_diminta) ? ` · minta kelas ${namaKelas(u.kelas_diminta)}` : ''} · {waktuRelatif(u.created_at)}
                      </span>
                    </span>
                  </li>
                ))}
                {menunggu.length > 5 && <li className="text-xs text-[#66748C] text-center pt-1">+{menunggu.length - 5} akun lainnya</li>}
              </ul>
            )}
          </section>

          <section className="glass-card p-6 anim-rise" style={{ ['--i' as string]: 8 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><School className="w-4 h-4" /> Kelas</h2>
              <Link href="/admin/kelas" className="text-xs font-bold text-[#2E7BC4] hover:underline flex items-center gap-1">Kelola kelas <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            {ringkasKelas.length === 0 ? (
              <p className="text-sm text-[#66748C] py-6 text-center">Belum ada kelas. Buat kelas lalu masukkan guru dan siswa.</p>
            ) : (
              <ul className="divide-y divide-[#E6EEF7]">
                {ringkasKelas.map((k) => (
                  <li key={k.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-[#1B4E80]">{k.nama}</span>
                    <span className="text-xs text-[#66748C] text-right">
                      {k.siswa} siswa · {k.guru.length ? k.guru.join(', ') : <span className="text-[#C2412E] font-bold">belum ada guru</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {siswaTanpaKelas > 0 && (
              <p className="mt-3 text-[11px] font-semibold text-[#B45309] bg-[#FFF8EC] border border-[#FBD38D] rounded-lg px-3 py-2">
                {siswaTanpaKelas} siswa aktif belum masuk kelas mana pun.
              </p>
            )}
          </section>

          <section className="glass-card p-6 anim-rise" style={{ ['--i' as string]: 9 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><Megaphone className="w-4 h-4" /> Pengumuman Terbaru</h2>
              <Link href="/admin/pengumuman" className="text-xs font-bold text-[#2E7BC4] hover:underline flex items-center gap-1">Semua <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            {(pengumumanRes.data ?? []).length === 0 ? (
              <p className="text-sm text-[#66748C] py-6 text-center">Belum ada pengumuman.</p>
            ) : (
              <ul className="space-y-2">
                {(pengumumanRes.data ?? []).map((p) => (
                  <li key={p.id} className="p-3 rounded-xl bg-white/80 border border-[#E6EEF7]">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-[#1F2A37]">
                      {p.penting && <Star className="w-3.5 h-3.5 text-[#C2412E] shrink-0" />}
                      <span className="truncate">{p.judul}</span>
                    </span>
                    <span className="block text-[11px] text-[#66748C] mt-0.5">
                      {p.nama_pembuat} <span className="uppercase font-bold">· {p.peran_pembuat}</span> · {waktuRelatif(p.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="glass-card p-6 anim-rise" style={{ ['--i' as string]: 10 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><Eye className="w-4 h-4" /> Keluar Tab Hari Ini</h2>
              <Link href="/admin/keluar-tab" className="text-xs font-bold text-[#2E7BC4] hover:underline flex items-center gap-1">Monitor <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            {tabPerSiswa.length === 0 ? (
              <p className="text-sm text-[#66748C] py-6 text-center">Belum ada siswa yang keluar tab hari ini.</p>
            ) : (
              <ul className="space-y-2">
                {tabPerSiswa.slice(0, 5).map((s) => (
                  <li key={s.nama + s.terakhir} className="flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-[#FECACA]">
                    <span className="w-9 h-9 rounded-xl bg-[#FDEAE7] text-[#C2412E] text-sm font-extrabold flex items-center justify-center shrink-0 tabular">{s.n}×</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#1F2A37] truncate">{s.nama}</span>
                      <span className="block text-[11px] text-[#66748C]">Kelas {s.kelas} · terakhir {waktuRelatif(s.terakhir)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
