'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { JadwalMingguan, type EntriJadwal } from '@/components/jadwal-mingguan';
import { pesanGalat } from '@/lib/pengerjaan';
import { UUID_RE } from '@/lib/akses';
import { useProfil } from '@/lib/use-profil';
import { ArrowLeft, UserCheck, Users, Plus, X, Search, Hourglass, Check, CalendarDays, AlertTriangle } from 'lucide-react';

interface Pengguna {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  status_approval: string | null;
  nomor_induk: string | null;
  kelas_diminta: string | null;
}

export default function AnggotaKelasPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const profil = useProfil();
  const valid = UUID_RE.test(params.id);
  const [kelas, setKelas] = useState<{ id: string; nama: string; tingkat: string | null; tahun_ajaran: string | null } | null>(null);
  const [semuaKelas, setSemuaKelas] = useState<{ id: string; nama: string }[]>([]);
  const [users, setUsers] = useState<Pengguna[]>([]);
  const [anggota, setAnggota] = useState<{ kelas_id: string; user_id: string; peran: string }[]>([]);
  const [jadwal, setJadwal] = useState<EntriJadwal[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [guruBaru, setGuruBaru] = useState('');
  const [tambahSiswa, setTambahSiswa] = useState(false);
  const [pilihan, setPilihan] = useState<string[]>([]);
  const [cari, setCari] = useState('');
  const [sibuk, setSibuk] = useState<string | null>(null);

  const ok = (text: string) => setToast({ id: Date.now(), tone: 'success', text });
  const gagal = (text: string) => setToast({ id: Date.now(), tone: 'error', text });

  const muat = useCallback(async () => {
    if (!valid) return setMemuat(false);
    const [k, sk, u, a, j] = await Promise.all([
      supabase.from('kelas').select('id, nama, tingkat, tahun_ajaran').eq('id', params.id).maybeSingle(),
      supabase.from('kelas').select('id, nama').order('nama'),
      supabase.from('users').select('id, full_name, email, role, status_approval, nomor_induk, kelas_diminta').order('full_name'),
      supabase.from('kelas_anggota').select('kelas_id, user_id, peran'),
      supabase.from('jadwal').select('id, hari, jam_mulai, jam_selesai, mapel, ruang, guru:guru_id(full_name)').eq('kelas_id', params.id),
    ]);
    setKelas(k.data ?? null);
    setSemuaKelas((sk.data ?? []) as { id: string; nama: string }[]);
    setUsers((u.data ?? []) as Pengguna[]);
    setAnggota((a.data ?? []) as typeof anggota);
    setJadwal(((j.data ?? []) as any[]).map((x) => ({ ...x, guru_nama: x.guru?.full_name ?? null })));
    setMemuat(false);
  }, [supabase, params.id, valid]);

  useEffect(() => {
    muat();
  }, [muat]);

  const di = (uid: string) => anggota.find((a) => a.user_id === uid && a.peran === 'siswa')?.kelas_id;
  const namaKelas = (id?: string) => semuaKelas.find((k) => k.id === id)?.nama;
  const guruKelas = users.filter((u) => anggota.some((a) => a.kelas_id === params.id && a.user_id === u.id && a.peran === 'guru'));
  const siswaKelas = users.filter((u) => anggota.some((a) => a.kelas_id === params.id && a.user_id === u.id && a.peran === 'siswa'));
  const calonGuru = users.filter((u) => u.role === 'guru' && u.status_approval === 'APPROVED' && !guruKelas.some((g) => g.id === u.id));
  const pendaftar = users.filter((u) => u.status_approval === 'PENDING' && u.kelas_diminta === params.id);
  const calonSiswa = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return users
      .filter((u) => u.role === 'siswa' && u.status_approval === 'APPROVED' && di(u.id) !== params.id)
      .filter((u) => !q || `${u.full_name} ${u.email} ${u.nomor_induk ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => Number(!!di(a.id)) - Number(!!di(b.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, anggota, cari, params.id]);

  const tambahGuru = async () => {
    if (!guruBaru) return;
    setSibuk('guru');
    const { error } = await supabase.from('kelas_anggota').insert({ kelas_id: params.id, user_id: guruBaru, peran: 'guru' });
    setSibuk(null);
    if (error) return gagal(pesanGalat(error));
    ok('Guru pengampu ditambahkan.');
    setGuruBaru('');
    muat();
  };
  const lepasGuru = async (uid: string) => {
    setSibuk(uid);
    const { error } = await supabase.from('kelas_anggota').delete().eq('kelas_id', params.id).eq('user_id', uid);
    setSibuk(null);
    if (error) return gagal(pesanGalat(error));
    ok('Guru dilepas dari kelas.');
    muat();
  };
  const keluarkanSiswa = async (uid: string) => {
    setSibuk(uid);
    const { error } = await supabase.rpc('atur_kelas_siswa', { p_siswa: uid, p_kelas: null });
    setSibuk(null);
    if (error) return gagal(pesanGalat(error));
    ok('Siswa dikeluarkan dari kelas.');
    muat();
  };
  const masukkanSiswa = async () => {
    setSibuk('tambah');
    let gagalN = 0;
    for (const uid of pilihan) {
      const { error } = await supabase.rpc('atur_kelas_siswa', { p_siswa: uid, p_kelas: params.id });
      if (error) gagalN++;
    }
    setSibuk(null);
    setTambahSiswa(false);
    setPilihan([]);
    if (gagalN) gagal(`${gagalN} siswa gagal dimasukkan.`);
    else ok(`${pilihan.length} siswa dimasukkan ke kelas ${kelas?.nama}.`);
    muat();
  };
  const setujuiPendaftar = async (uid: string) => {
    setSibuk(uid);
    const { error } = await supabase.rpc('setujui_pengguna', { p_user: uid, p_kelas: params.id });
    setSibuk(null);
    if (error) return gagal(pesanGalat(error));
    ok('Pendaftar disetujui dan masuk kelas ini.');
    muat();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={kelas ? `Kelas ${kelas.nama}` : 'Anggota Kelas'} userRole="admin" userName={profil?.nama ?? '…'} />
      <StaffNav role="admin" />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <Link href="/admin/kelas" className="btn-press inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white/80 border border-[#DCEAF7] text-[#66748C] hover:text-[#2E7BC4] mb-5">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar Kelas
        </Link>

        {memuat ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : !kelas ? (
          <div className="glass-card p-10 text-center">
            <p className="text-sm font-semibold text-[#1B4E80]">Kelas tidak ditemukan.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="glass-card p-6 anim-rise">
              <h1 className="text-2xl font-extrabold text-[#1B4E80]">Kelas {kelas.nama}</h1>
              <p className="text-xs text-[#66748C] mt-1">
                {[kelas.tingkat && `Tingkat ${kelas.tingkat}`, kelas.tahun_ajaran].filter(Boolean).join(' · ')} · {siswaKelas.length} siswa · {guruKelas.length} guru pengampu
              </p>
            </section>

            {pendaftar.length > 0 && (
              <section className="glass-card p-5 border border-[#FBD38D] anim-rise">
                <h2 className="text-sm font-extrabold text-[#B45309] flex items-center gap-2 mb-3"><Hourglass className="w-4 h-4" /> Pendaftar yang memilih kelas ini</h2>
                <ul className="space-y-2">
                  {pendaftar.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/80">
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-[#1F2A37] truncate">{u.full_name}</span>
                        <span className="block text-[11px] text-[#66748C] truncate">{u.email} · {u.role}</span>
                      </span>
                      <button type="button" disabled={sibuk === u.id} onClick={() => setujuiPendaftar(u.id)} className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#22B573] text-white text-xs font-bold disabled:opacity-60">
                        {sibuk === u.id ? <Spinner className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} Setujui & masukkan
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.4fr] gap-5">
              <section className="glass-card p-5 anim-rise" style={{ ['--i' as string]: 1 }}>
                <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2 mb-3"><UserCheck className="w-4 h-4" /> Guru Pengampu</h2>
                {guruKelas.length === 0 ? (
                  <p className="text-xs text-[#C2412E] font-semibold mb-3 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Belum ada guru. Guru pengampu menerima notifikasi tugas dari siswa kelas ini.</p>
                ) : (
                  <ul className="space-y-2 mb-3">
                    {guruKelas.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/80 border border-[#E6EEF7]">
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-[#1F2A37] truncate">{g.full_name}</span>
                          <span className="block text-[11px] text-[#66748C] truncate">{g.email}</span>
                        </span>
                        <button type="button" disabled={sibuk === g.id} onClick={() => lepasGuru(g.id)} aria-label={`Lepas ${g.full_name}`} className="btn-press w-8 h-8 rounded-lg flex items-center justify-center text-[#C2412E] hover:bg-[#FDEAE7] disabled:opacity-50"><X className="w-4 h-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <select value={guruBaru} onChange={(e) => setGuruBaru(e.target.value)} aria-label="Pilih guru" className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80]">
                    <option value="">Pilih guru…</option>
                    {calonGuru.map((g) => <option key={g.id} value={g.id}>{g.full_name}</option>)}
                  </select>
                  <button type="button" onClick={tambahGuru} disabled={!guruBaru || sibuk === 'guru'} className="btn-press inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#2E7BC4] text-white text-xs font-bold disabled:opacity-50">
                    {sibuk === 'guru' ? <Spinner className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} Tambah
                  </button>
                </div>
              </section>

              <section className="glass-card p-5 anim-rise" style={{ ['--i' as string]: 2 }}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><Users className="w-4 h-4" /> Siswa ({siswaKelas.length})</h2>
                  <button type="button" onClick={() => { setPilihan([]); setCari(''); setTambahSiswa(true); }} className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2E7BC4] text-white text-xs font-bold">
                    <Plus className="w-3.5 h-3.5" /> Tambah Siswa
                  </button>
                </div>
                {siswaKelas.length === 0 ? (
                  <p className="text-xs text-[#66748C] py-6 text-center">Belum ada siswa di kelas ini.</p>
                ) : (
                  <ul className="divide-y divide-[#E6EEF7] max-h-[420px] overflow-y-auto">
                    {siswaKelas.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-2.5">
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-[#1F2A37] truncate">{s.full_name}</span>
                          <span className="block text-[11px] text-[#66748C] truncate">{s.nomor_induk ? `NIS ${s.nomor_induk} · ` : ''}{s.email}</span>
                        </span>
                        <button type="button" disabled={sibuk === s.id} onClick={() => keluarkanSiswa(s.id)} className="btn-press shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7] disabled:opacity-50">
                          <X className="w-3.5 h-3.5" /> Keluarkan
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="glass-card p-5 anim-rise" style={{ ['--i' as string]: 3 }}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-extrabold text-[#1B4E80] flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Jadwal Pelajaran Kelas</h2>
                <Link href={`/admin/jadwal?kelas=${kelas.id}`} className="text-xs font-bold text-[#2E7BC4] hover:underline">Atur jadwal</Link>
              </div>
              <JadwalMingguan entri={jadwal} tampil="kelas" kosong="Belum ada jadwal untuk kelas ini." />
            </section>
          </div>
        )}
      </div>

      <Modal
        open={tambahSiswa}
        busy={sibuk === 'tambah'}
        lebar="lg"
        onClose={() => setTambahSiswa(false)}
        title={`Tambah siswa ke ${kelas?.nama ?? 'kelas'}`}
        actions={
          <>
            <button type="button" onClick={() => setTambahSiswa(false)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">Batal</button>
            <button type="button" onClick={masukkanSiswa} disabled={!pilihan.length || sibuk === 'tambah'} className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {sibuk === 'tambah' && <Spinner />} Masukkan {pilihan.length || ''} siswa
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" data-autofocus value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, email, atau NIS..." aria-label="Cari siswa" className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DCEAF7] text-sm" />
          </div>
          <p className="text-[11px] text-[#66748C]">Siswa yang sudah di kelas lain akan dipindahkan ke kelas ini.</p>
          <ul className="max-h-[340px] overflow-y-auto divide-y divide-[#F1F5F9] rounded-xl border border-[#E6EEF7]">
            {calonSiswa.length === 0 && <li className="p-4 text-xs text-[#66748C] text-center">Tidak ada siswa yang cocok.</li>}
            {calonSiswa.map((s) => {
              const dipilih = pilihan.includes(s.id);
              const lama = namaKelas(di(s.id));
              return (
                <li key={s.id}>
                  <label className={`flex items-center gap-3 p-3 cursor-pointer ${dipilih ? 'bg-[#EAF6FF]' : 'hover:bg-[#F8FBFF]'}`}>
                    <input type="checkbox" checked={dipilih} onChange={() => setPilihan((p) => (dipilih ? p.filter((x) => x !== s.id) : [...p, s.id]))} className="w-4 h-4 accent-[#2E7BC4]" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-[#1F2A37] truncate">{s.full_name}</span>
                      <span className="block text-[11px] text-[#66748C] truncate">{s.email}</span>
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${lama ? 'bg-[#FFF1DD] text-[#B45309]' : 'bg-[#F1F5F9] text-[#66748C]'}`}>{lama ? `di ${lama}` : 'tanpa kelas'}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
