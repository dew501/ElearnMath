'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { PengumumanKelola } from '@/components/pengumuman-kelola';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfil } from '@/lib/use-profil';
import { jamPendek, labelHariRelatif, tanggalPanjang, waktuRelatif } from '@/lib/waktu';
import { CalendarDays, Megaphone, Inbox } from 'lucide-react';

interface Agenda {
  id: string;
  judul: string;
  deskripsi: string | null;
  tanggal: string;
  jam_mulai: string | null;
  jenis: string;
  created_at: string;
  kelas: { nama: string } | null;
  pembuat: { full_name: string | null; role: string | null } | null;
}

const JENIS_AGENDA: Record<string, string> = { kegiatan: 'Kegiatan', tenggat: 'Tenggat', ujian: 'Ujian', lainnya: 'Lainnya' };

export default function AdminPengumumanPage() {
  const profil = useProfil();
  const [tab, setTab] = useState<'pengumuman' | 'agenda'>('pengumuman');

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Pengumuman" userRole="admin" userName={profil?.nama ?? '…'} />
      <StaffNav role="admin" />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[960px] w-full mx-auto">
        <div className="flex gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm w-fit mb-5" role="tablist" aria-label="Jenis informasi">
          {([
            ['pengumuman', 'Pengumuman', Megaphone],
            ['agenda', 'Agenda dari Guru', CalendarDays],
          ] as const).map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`btn-press flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold ${tab === k ? 'bg-[#1B4E80] text-white' : 'text-[#66748C] hover:text-[#1B4E80]'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        {!profil ? <Skeleton className="h-64 rounded-3xl" /> : tab === 'pengumuman' ? <PengumumanKelola profil={profil} /> : <DaftarAgenda />}
      </div>
    </div>
  );
}

function DaftarAgenda() {
  const supabase = createClient();
  const [daftar, setDaftar] = useState<Agenda[] | null>(null);
  useEffect(() => {
    supabase
      .from('agenda')
      .select('id, judul, deskripsi, tanggal, jam_mulai, jenis, created_at, kelas:kelas_id(nama), pembuat:dibuat_oleh(full_name, role)')
      .order('tanggal', { ascending: false })
      .limit(200)
      .then(({ data }) => setDaftar((data ?? []) as unknown as Agenda[]));
  }, [supabase]);

  if (!daftar) return <Skeleton className="h-64 rounded-3xl" />;
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2 mb-1"><CalendarDays className="w-6 h-6 text-[#F0932B]" /> Agenda dari Guru</h1>
      <p className="text-xs text-[#66748C] mb-5">Kegiatan, tenggat tugas, dan ujian yang dibuat guru untuk kelasnya (dikirim juga ke notifikasi siswa).</p>
      {daftar.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#1B4E80]">Belum ada agenda.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {daftar.map((a) => (
            <li key={a.id} className="glass-card p-4 flex gap-4 items-start">
              <span className="w-14 shrink-0 text-center rounded-2xl bg-[#EAF6FF] border border-[#DCEAF7] py-2">
                <span className="block text-[10px] font-bold text-[#2E7BC4] uppercase">{new Date(`${a.tanggal}T00:00:00+07:00`).toLocaleDateString('id-ID', { month: 'short', timeZone: 'Asia/Jakarta' })}</span>
                <span className="block text-xl font-extrabold text-[#1B4E80] leading-none tabular">{Number(a.tanggal.slice(8, 10))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF1DD] text-[#B45309]">{JENIS_AGENDA[a.jenis] ?? a.jenis}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D3ECFF] text-[#1B4E80]">Kelas {a.kelas?.nama ?? '-'}</span>
                  <span className="text-[10px] font-semibold text-[#94A3B8]">{labelHariRelatif(a.tanggal)}</span>
                </span>
                <span className="block text-sm font-extrabold text-[#1F2A37] mt-1">{a.judul}</span>
                {a.deskripsi && <span className="block text-xs text-[#4B5A70] mt-0.5">{a.deskripsi}</span>}
                <span className="block text-[11px] text-[#94A3B8] mt-1">
                  {tanggalPanjang(a.tanggal)}{a.jam_mulai ? ` · ${jamPendek(a.jam_mulai)}` : ''} · oleh {a.pembuat?.full_name ?? 'guru'} · dibuat {waktuRelatif(a.created_at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
