'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { formatTanggal, pesanGalat } from '@/lib/pengerjaan';
import { buatAkun, keCsv, parseCsv, sandiAcak, unduhTeks, type PeranAkun } from '@/lib/akun';
import {
  Search, Check, X, PencilLine, Inbox, AlertTriangle, UserCheck, UserPlus, Upload, Download, Trash2, KeyRound, Copy, Wand2, School,
} from 'lucide-react';

interface Pengguna {
  id: string;
  email: string | null;
  full_name: string | null;
  class_name: string | null;
  role: string | null;
  status_approval: string | null;
  nomor_induk: string | null;
  kelas_diminta: string | null;
  created_at: string | null;
}
interface Kelas {
  id: string;
  nama: string;
}

const STATUS: Record<string, { label: string; kelas: string }> = {
  APPROVED: { label: 'Disetujui', kelas: 'bg-[#E4F8EE] border border-[#B5EBD0] text-[#15885A]' },
  PENDING: { label: 'Menunggu', kelas: 'bg-[#FFF1DD] border border-[#FBD38D] text-[#B45309]' },
  REJECTED: { label: 'Ditolak / nonaktif', kelas: 'bg-[#FDEAE7] border border-[#FECACA] text-[#C2412E]' },
};
const PERAN: PeranAkun[] = ['siswa', 'guru', 'admin'];
const kapital = (s: string) => s[0].toUpperCase() + s.slice(1);

const selectClass =
  'input-field px-3 py-2 rounded-xl text-xs font-semibold text-[#1B4E80]';
const inputClass =
  'input-field w-full px-3.5 py-2.5 rounded-xl text-sm text-[#1F2A37]';
const tombolUtama = 'btn-primary px-5 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2';
const tombolBatal = 'btn-secondary px-5 py-2.5 rounded-xl font-bold text-sm';

function Galat({ teks }: { teks: string | null }) {
  if (!teks) return null;
  return (
    <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake">
      <AlertTriangle className="w-4 h-4 shrink-0" /> {teks}
    </div>
  );
}

function SalinTeks({ teks }: { teks: string }) {
  const [tersalin, setTersalin] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(teks).then(() => { setTersalin(true); setTimeout(() => setTersalin(false), 1500); })}
      className="inline-flex items-center gap-1 text-xs font-bold text-[#2E7BC4] hover:underline"
    >
      <Copy className="w-3.5 h-3.5" /> {tersalin ? 'Tersalin' : 'Salin'}
    </button>
  );
}

export default function KelolaPenggunaPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saya, setSaya] = useState<{ id: string; nama: string } | null>(null);
  const [daftar, setDaftar] = useState<Pengguna[]>([]);
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [anggota, setAnggota] = useState<{ kelas_id: string; user_id: string; peran: string }[]>([]);
  const [layanan, setLayanan] = useState<boolean | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState('');
  const [peran, setPeran] = useState('semua');
  const [status, setStatus] = useState('semua');
  const [filterKelas, setFilterKelas] = useState('semua');
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [setujuiSemua, setSetujuiSemua] = useState(false);
  const [edit, setEdit] = useState<(Pengguna & { kelasBaru: string }) | null>(null);
  const [tambah, setTambah] = useState(false);
  const [impor, setImpor] = useState(false);
  const [hapus, setHapus] = useState<{ u: Pengguna; jumlah?: number } | null>(null);
  const [akunDibuat, setAkunDibuat] = useState<{ email: string; sandi: string; nama: string } | null>(null);

  const toastOk = (text: string) => setToast({ id: Date.now(), tone: 'success', text });
  const toastGagal = (text: string) => setToast({ id: Date.now(), tone: 'error', text });

  const muat = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    const [u, k, a] = await Promise.all([
      supabase.from('users').select('id, email, full_name, class_name, role, status_approval, nomor_induk, kelas_diminta, created_at').order('created_at', { ascending: false }),
      supabase.from('kelas').select('id, nama').order('nama'),
      supabase.from('kelas_anggota').select('kelas_id, user_id, peran'),
    ]);
    setGalat(u.error ? pesanGalat(u.error) : null);
    const list = (u.data ?? []) as Pengguna[];
    setDaftar(list);
    setKelas((k.data ?? []) as Kelas[]);
    setAnggota((a.data ?? []) as typeof anggota);
    const me = list.find((x) => x.id === user.id);
    setSaya({ id: user.id, nama: me?.full_name || user.email?.split('@')[0] || 'Admin' });
    setMemuat(false);
  }, [router, supabase]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('status')) setStatus(q.get('status')!);
    if (q.get('peran')) setPeran(q.get('peran')!);
    muat();
    fetch('/api/admin/pengguna').then((r) => r.json()).then((j) => setLayanan(!!j.tersedia)).catch(() => setLayanan(false));
  }, [muat]);

  const namaKelas = (id: string | null) => kelas.find((k) => k.id === id)?.nama;
  const kelasSiswa = (id: string) => anggota.find((a) => a.user_id === id && a.peran === 'siswa')?.kelas_id ?? '';
  const kelasGuru = (id: string) => anggota.filter((a) => a.user_id === id && a.peran === 'guru').map((a) => namaKelas(a.kelas_id)).filter(Boolean) as string[];

  const tersaring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return daftar
      .filter((u) => (peran === 'semua' || u.role === peran) && (status === 'semua' || (u.status_approval ?? 'PENDING') === status))
      .filter((u) => {
        if (filterKelas === 'semua') return true;
        if (filterKelas === 'tanpa') return u.role === 'siswa' && !kelasSiswa(u.id);
        return anggota.some((a) => a.user_id === u.id && a.kelas_id === filterKelas);
      })
      .filter((u) => !k || `${u.full_name ?? ''} ${u.email ?? ''} ${u.class_name ?? ''} ${u.nomor_induk ?? ''}`.toLowerCase().includes(k))
      .sort((a, b) => Number(b.status_approval === 'PENDING') - Number(a.status_approval === 'PENDING'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daftar, cari, peran, status, filterKelas, anggota]);
  const jumlahMenunggu = daftar.filter((u) => u.status_approval === 'PENDING').length;

  const setujui = async (u: Pengguna) => {
    setSibuk(u.id);
    const { error } = await supabase.rpc('setujui_pengguna', { p_user: u.id, p_kelas: null });
    setSibuk(null);
    if (error) return toastGagal(pesanGalat(error));
    toastOk(`${u.full_name || u.email} disetujui${u.kelas_diminta && namaKelas(u.kelas_diminta) ? ` dan masuk kelas ${namaKelas(u.kelas_diminta)}` : ''}.`);
    muat();
  };

  const tolak = async (u: Pengguna) => {
    setSibuk(u.id);
    const { data, error } = await supabase.from('users').update({ status_approval: 'REJECTED' }).eq('id', u.id).select('id');
    setSibuk(null);
    if (error || !data?.length) return toastGagal(error ? pesanGalat(error) : 'Gagal menyimpan: akun Anda tidak memiliki izin.');
    setDaftar((d) => d.map((x) => (x.id === u.id ? { ...x, status_approval: 'REJECTED' } : x)));
    toastOk(`${u.full_name || u.email} ${u.status_approval === 'APPROVED' ? 'dinonaktifkan' : 'ditolak'} dan tidak bisa masuk.`);
  };

  const setujuiSemuaMenunggu = async () => {
    setSibuk('semua');
    const { data, error } = await supabase.rpc('setujui_semua_menunggu');
    setSibuk(null);
    setSetujuiSemua(false);
    if (error) return toastGagal(pesanGalat(error));
    toastOk(`${data ?? 0} akun disetujui; yang memilih kelas langsung dimasukkan ke kelasnya.`);
    muat();
  };

  const simpanEdit = async () => {
    if (!edit) return;
    const asli = daftar.find((u) => u.id === edit.id);
    if (!asli) return;
    setSibuk(edit.id);
    const diriSendiri = edit.id === saya?.id;
    const kelasLama = kelasSiswa(edit.id);
    // Lepas/pindah kelas siswa dulu (sebelum peran berubah)
    if (asli.role === 'siswa' && (edit.role !== 'siswa' || edit.kelasBaru !== kelasLama)) {
      const { error } = await supabase.rpc('atur_kelas_siswa', { p_siswa: edit.id, p_kelas: edit.role === 'siswa' ? edit.kelasBaru || null : null });
      if (error) {
        setSibuk(null);
        return toastGagal(pesanGalat(error));
      }
    }
    const patch: Partial<Pengguna> = { full_name: edit.full_name?.trim() || null, nomor_induk: edit.nomor_induk?.trim() || null };
    if (!diriSendiri) Object.assign(patch, { role: edit.role, status_approval: edit.status_approval });
    const { data, error } = await supabase.from('users').update(patch).eq('id', edit.id).select('id');
    if (!error && asli.role !== 'siswa' && edit.role === 'siswa' && edit.kelasBaru) {
      await supabase.rpc('atur_kelas_siswa', { p_siswa: edit.id, p_kelas: edit.kelasBaru });
    }
    setSibuk(null);
    if (error || !data?.length) return toastGagal(error ? pesanGalat(error) : 'Gagal menyimpan: akun Anda tidak memiliki izin.');
    toastOk(`Data ${edit.full_name || edit.email} diperbarui.`);
    setEdit(null);
    muat();
  };

  const unduhDaftar = () => {
    unduhTeks(
      `pengguna-elearnmath-${new Date().toISOString().slice(0, 10)}.csv`,
      keCsv([
        ['nama', 'email', 'peran', 'status', 'kelas', 'nomor_induk', 'terdaftar'],
        ...tersaring.map((u) => [u.full_name, u.email, u.role, STATUS[u.status_approval ?? 'PENDING']?.label, u.role === 'guru' ? kelasGuru(u.id).join(' / ') : u.class_name, u.nomor_induk, formatTanggal(u.created_at)]),
      ])
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Kelola Pengguna" userRole="admin" userName={saya?.nama ?? '…'} />
      <StaffNav role="admin" />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <div className="hero-navy p-6 md:p-7 mb-5 flex items-end justify-between gap-4 flex-wrap anim-rise">
          <div className="relative z-10">
            <span className="inline-block text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.12] border border-white/20 text-[#FFD28E] mb-2">Manajemen Akun</span>
            <h1 className="text-2xl md:text-[28px] font-extrabold text-white tracking-[-0.02em]">Kelola Pengguna</h1>
            <p className="text-xs md:text-sm text-[#D2E6FA]/90 mt-1">Daftarkan akun siswa & guru, setujui pendaftaran, atur peran, kelas, dan status akun.</p>
          </div>
          <div className="relative z-10 flex flex-wrap gap-2">
            {jumlahMenunggu > 0 && (
              <button type="button" onClick={() => setSetujuiSemua(true)} className="btn-emerald inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold">
                <UserCheck className="w-4 h-4" /> Setujui {jumlahMenunggu} akun menunggu
              </button>
            )}
            <button type="button" onClick={() => setImpor(true)} className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.12] border border-white/25 text-white text-sm font-bold hover:bg-white/20 backdrop-blur-md">
              <Upload className="w-4 h-4" /> Impor CSV
            </button>
            <button type="button" onClick={() => setTambah(true)} className="btn-amber inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold">
              <UserPlus className="w-4 h-4" /> Tambah Akun
            </button>
          </div>
        </div>

        <div className="glass-card p-4 mb-5 flex flex-wrap gap-2 items-center anim-rise" style={{ ['--i' as string]: 1 }}>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, email, kelas, atau NIS/NIP..." aria-label="Cari pengguna" className="input-field w-full pl-9 pr-3 py-2 rounded-xl text-xs text-[#1F2A37]" />
          </div>
          <select value={peran} onChange={(e) => setPeran(e.target.value)} className={selectClass} aria-label="Filter peran">
            <option value="semua">Semua peran</option>
            {PERAN.map((p) => <option key={p} value={p}>{kapital(p)}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass} aria-label="Filter status">
            <option value="semua">Semua status</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterKelas} onChange={(e) => setFilterKelas(e.target.value)} className={selectClass} aria-label="Filter kelas">
            <option value="semua">Semua kelas</option>
            <option value="tanpa">Siswa tanpa kelas</option>
            {kelas.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
          <button type="button" onClick={unduhDaftar} className="btn-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#2E7BC4] hover:bg-[#EAF6FF]">
            <Download className="w-3.5 h-3.5" /> Unduh CSV
          </button>
        </div>

        {galat && (
          <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {galat}
          </div>
        )}

        {memuat ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-4 flex gap-3 items-center">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : tersaring.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#1B4E80]">Tidak ada pengguna yang cocok.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#94A3B8] px-1">{tersaring.length} pengguna</p>
            {tersaring.map((u, i) => {
              const st = STATUS[u.status_approval ?? 'PENDING'] ?? STATUS.PENDING;
              const diriSendiri = u.id === saya?.id;
              const kelasTeks = u.role === 'guru' ? (kelasGuru(u.id).length ? `Mengampu ${kelasGuru(u.id).join(', ')}` : 'Belum mengampu kelas') : u.class_name ? `Kelas ${u.class_name}` : u.role === 'siswa' ? 'Belum masuk kelas' : '';
              return (
                <article key={u.id} className={`glass-card p-4 flex flex-col md:flex-row md:items-center gap-3 anim-rise ${u.status_approval === 'PENDING' ? 'ring-1 ring-[#FBD38D]' : ''}`} style={{ ['--i' as string]: Math.min(i, 8) }}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2E7ECF] to-[#133E6B] text-white text-sm font-extrabold flex items-center justify-center shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_4px_10px_-2px_rgba(19,62,107,0.35)] shrink-0">
                      {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#1F2A37] truncate">{u.full_name || '(tanpa nama)'}</span>
                        {diriSendiri && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[#EAF6FF] border border-[#BFDBFE] text-[#2E7BC4]">Anda</span>}
                        {u.status_approval === 'PENDING' && u.kelas_diminta && namaKelas(u.kelas_diminta) && (
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[#FFF1DD] border border-[#FBD38D] text-[#B45309] inline-flex items-center gap-1">
                            <School className="w-3 h-3" /> minta kelas {namaKelas(u.kelas_diminta)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#66748C] truncate">
                        {u.email}{kelasTeks ? ` · ${kelasTeks}` : ''}{u.nomor_induk ? ` · ${u.role === 'siswa' ? 'NIS' : 'NIP'} ${u.nomor_induk}` : ''} · Terdaftar {formatTanggal(u.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#EAF5FF] border border-[#BFDBFE] text-[#113355] uppercase tracking-wide">{u.role ?? '-'}</span>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${st.kelas}`}>{st.label}</span>
                    {!diriSendiri && u.status_approval !== 'APPROVED' && (
                      <button type="button" disabled={sibuk === u.id} onClick={() => setujui(u)} className="btn-emerald inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold">
                        {sibuk === u.id ? <Spinner className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} Setujui
                      </button>
                    )}
                    {!diriSendiri && u.status_approval !== 'REJECTED' && (
                      <button type="button" disabled={sibuk === u.id} onClick={() => tolak(u)} className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7] disabled:opacity-60">
                        <X className="w-3.5 h-3.5" /> {u.status_approval === 'APPROVED' ? 'Nonaktifkan' : 'Tolak'}
                      </button>
                    )}
                    <button type="button" onClick={() => setEdit({ ...u, kelasBaru: kelasSiswa(u.id) })} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold">
                      <PencilLine className="w-3.5 h-3.5" /> Ubah
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Ubah pengguna */}
      <Modal
        open={edit !== null}
        busy={sibuk !== null}
        lebar="lg"
        onClose={() => setEdit(null)}
        title="Ubah data pengguna"
        actions={
          <>
            <button type="button" onClick={() => setEdit(null)} className={tombolBatal}>Batal</button>
            <button type="button" onClick={simpanEdit} disabled={sibuk !== null} className={tombolUtama}>
              {sibuk !== null && <Spinner />} Simpan
            </button>
          </>
        }
      >
        {edit && (
          <UbahPengguna
            edit={edit}
            setEdit={setEdit}
            kelas={kelas}
            kelasGuru={kelasGuru(edit.id)}
            diriSendiri={edit.id === saya?.id}
            layanan={layanan}
            onHapus={() => setHapus({ u: edit })}
            onToast={(t, ok) => (ok ? toastOk(t) : toastGagal(t))}
          />
        )}
      </Modal>

      {/* Hapus akun */}
      <Modal
        open={hapus !== null}
        busy={sibuk === 'hapus'}
        onClose={() => setHapus(null)}
        title={hapus?.jumlah ? 'Hapus akun beserta datanya?' : 'Hapus akun ini?'}
        icon={<div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center"><Trash2 className="w-6 h-6 text-[#C2412E]" /></div>}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} disabled={sibuk === 'hapus'} className={tombolBatal}>Batal</button>
            <button
              type="button"
              disabled={sibuk === 'hapus'}
              onClick={async () => {
                if (!hapus) return;
                setSibuk('hapus');
                const r = await fetch('/api/admin/pengguna', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: hapus.u.id, paksa: !!hapus.jumlah }) });
                const j = await r.json().catch(() => ({}));
                setSibuk(null);
                if (r.status === 409 && j.jumlah) return setHapus({ u: hapus.u, jumlah: j.jumlah });
                if (!r.ok) {
                  setHapus(null);
                  return toastGagal(j.pesan || 'Akun gagal dihapus.');
                }
                setHapus(null);
                setEdit(null);
                toastOk(`Akun ${hapus.u.full_name || hapus.u.email} dihapus permanen.`);
                muat();
              }}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {sibuk === 'hapus' && <Spinner />} {hapus?.jumlah ? `Hapus beserta ${hapus.jumlah} pengumpulan` : 'Ya, Hapus Akun'}
            </button>
          </>
        }
      >
        {hapus?.jumlah ? (
          <p>
            <strong>{hapus.u.full_name}</strong> punya <strong>{hapus.jumlah} pengumpulan tugas</strong> beserta nilainya. Semuanya akan ikut terhapus permanen. Jika hanya ingin memblokir akses, gunakan <strong>Nonaktifkan</strong>.
          </p>
        ) : (
          <p>
            Akun <strong>{hapus?.u.full_name || hapus?.u.email}</strong> akan dihapus permanen dan tidak bisa masuk lagi. Jika hanya ingin memblokir akses sementara, gunakan <strong>Nonaktifkan</strong>.
          </p>
        )}
      </Modal>

      {/* Setujui semua */}
      <Modal
        open={setujuiSemua}
        busy={sibuk === 'semua'}
        onClose={() => setSetujuiSemua(false)}
        title={`Setujui ${jumlahMenunggu} akun?`}
        icon={<div className="w-12 h-12 rounded-2xl bg-[#E4F8EE] flex items-center justify-center"><UserCheck className="w-6 h-6 text-[#15885A]" /></div>}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setSetujuiSemua(false)} className={tombolBatal}>Batal</button>
            <button type="button" onClick={setujuiSemuaMenunggu} disabled={sibuk === 'semua'} className="btn-press px-5 py-2.5 rounded-xl bg-[#22B573] hover:bg-[#15885A] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {sibuk === 'semua' && <Spinner />} Ya, Setujui Semua
            </button>
          </>
        }
      >
        Semua akun berstatus <strong>Menunggu</strong> akan bisa masuk ke aplikasi, dan siswa yang memilih kelas saat mendaftar langsung dimasukkan ke kelas itu. Pastikan akun-akun itu memang milik warga sekolah Anda.
      </Modal>

      <TambahAkun
        open={tambah}
        onClose={() => setTambah(false)}
        kelas={kelas}
        layanan={layanan}
        onSelesai={(info) => {
          setTambah(false);
          setAkunDibuat(info);
          muat();
        }}
      />

      <ImporAkun open={impor} onClose={() => { setImpor(false); muat(); }} kelas={kelas} layanan={layanan} />

      <Modal
        open={akunDibuat !== null}
        onClose={() => setAkunDibuat(null)}
        title="Akun berhasil dibuat"
        icon={<div className="w-12 h-12 rounded-2xl bg-[#E4F8EE] flex items-center justify-center"><UserCheck className="w-6 h-6 text-[#15885A]" /></div>}
        actions={<button type="button" data-autofocus onClick={() => setAkunDibuat(null)} className={tombolUtama}>Selesai</button>}
      >
        {akunDibuat && (
          <div className="space-y-3">
            <p>Akun <strong>{akunDibuat.nama}</strong> sudah aktif. Sampaikan data masuk berikut kepada pemiliknya, lalu minta ia mengganti kata sandi di menu <strong>Profil</strong>.</p>
            <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#DCEAF7] font-mono text-sm text-[#1B4E80] space-y-1">
              <div className="flex justify-between gap-2"><span>Email: {akunDibuat.email}</span><SalinTeks teks={akunDibuat.email} /></div>
              <div className="flex justify-between gap-2"><span>Sandi: {akunDibuat.sandi}</span><SalinTeks teks={akunDibuat.sandi} /></div>
            </div>
          </div>
        )}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function UbahPengguna({
  edit, setEdit, kelas, kelasGuru, diriSendiri, layanan, onHapus, onToast,
}: {
  edit: Pengguna & { kelasBaru: string };
  setEdit: (e: Pengguna & { kelasBaru: string }) => void;
  kelas: Kelas[];
  kelasGuru: string[];
  diriSendiri: boolean;
  layanan: boolean | null;
  onHapus: () => void;
  onToast: (t: string, ok: boolean) => void;
}) {
  const [sandi, setSandi] = useState('');
  const [mengatur, setMengatur] = useState(false);
  const [sandiBaru, setSandiBaru] = useState<string | null>(null);

  const aturSandi = async () => {
    if (sandi.length < 8) return onToast('Kata sandi baru minimal 8 karakter.', false);
    setMengatur(true);
    const r = await fetch('/api/admin/pengguna', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aksi: 'reset_sandi', id: edit.id, password: sandi }) });
    const j = await r.json().catch(() => ({}));
    setMengatur(false);
    if (!r.ok) return onToast(j.pesan || 'Kata sandi gagal diatur.', false);
    setSandiBaru(sandi);
    setSandi('');
    onToast('Kata sandi baru tersimpan.', true);
  };

  return (
    <div className="space-y-4 text-[#1F2A37]">
      <p className="text-xs text-[#66748C]">{edit.email}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="e-nama" className="block text-xs font-bold mb-1.5">Nama lengkap</label>
          <input id="e-nama" data-autofocus value={edit.full_name ?? ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="e-nomor" className="block text-xs font-bold mb-1.5">{edit.role === 'siswa' ? 'NIS / NISN' : 'NIP / NUPTK'}</label>
          <input id="e-nomor" value={edit.nomor_induk ?? ''} onChange={(e) => setEdit({ ...edit, nomor_induk: e.target.value })} className={`${inputClass} tabular`} />
        </div>
      </div>
      {diriSendiri ? (
        <p className="text-xs text-[#B45309] bg-[#FFF8EC] border border-[#FBD38D] rounded-lg px-3 py-2">
          Peran dan status akun Anda sendiri tidak bisa diubah dari sini agar Anda tidak terkunci.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="e-peran" className="block text-xs font-bold mb-1.5">Peran</label>
            <select id="e-peran" value={edit.role ?? 'siswa'} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className={inputClass}>
              {PERAN.map((p) => <option key={p} value={p}>{kapital(p)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="e-status" className="block text-xs font-bold mb-1.5">Status</label>
            <select id="e-status" value={edit.status_approval ?? 'PENDING'} onChange={(e) => setEdit({ ...edit, status_approval: e.target.value })} className={inputClass}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      )}
      {edit.role === 'siswa' ? (
        <div>
          <label htmlFor="e-kelas" className="block text-xs font-bold mb-1.5">Kelas</label>
          <select id="e-kelas" value={edit.kelasBaru} onChange={(e) => setEdit({ ...edit, kelasBaru: e.target.value })} className={inputClass}>
            <option value="">— Belum masuk kelas —</option>
            {kelas.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
          </select>
        </div>
      ) : edit.role === 'guru' ? (
        <p className="text-xs text-[#66748C]">
          Kelas diampu: <strong className="text-[#1B4E80]">{kelasGuru.length ? kelasGuru.join(', ') : 'belum ada'}</strong>. Atur di menu <strong>Kelas</strong>.
        </p>
      ) : null}

      <div className="border-t border-[#E6EEF7] pt-4 space-y-3">
        <h3 className="text-xs font-extrabold text-[#1B4E80] flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Atur ulang kata sandi</h3>
        {layanan ? (
          <>
            <div className="flex gap-2">
              <input aria-label="Kata sandi baru" value={sandi} onChange={(e) => setSandi(e.target.value)} placeholder="Kata sandi baru (min. 8 karakter)" className={`${inputClass} font-mono`} />
              <button type="button" onClick={() => setSandi(sandiAcak())} title="Buat otomatis" aria-label="Buat kata sandi otomatis" className="btn-press px-3 rounded-xl border border-[#DCEAF7] text-[#2E7BC4] hover:bg-[#EAF6FF]"><Wand2 className="w-4 h-4" /></button>
              <button type="button" onClick={aturSandi} disabled={mengatur || !sandi} className="btn-press px-4 rounded-xl bg-[#1B4E80] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">{mengatur && <Spinner className="w-3.5 h-3.5" />} Atur</button>
            </div>
            {sandiBaru && (
              <p className="text-xs text-[#15885A] font-semibold flex items-center gap-2">Sandi baru: <span className="font-mono">{sandiBaru}</span> <SalinTeks teks={sandiBaru} /></p>
            )}
          </>
        ) : (
          <p className="text-xs text-[#66748C] leading-relaxed">
            Fitur ini membutuhkan <span className="font-mono">SUPABASE_SECRET_KEY</span> di server (hubungi pengelola). Sementara itu, pengguna bisa memakai &ldquo;Lupa kata sandi?&rdquo; di halaman masuk.
          </p>
        )}
      </div>

      {!diriSendiri && (
        <div className="border-t border-[#E6EEF7] pt-4">
          {layanan ? (
            <button type="button" onClick={onHapus} className="btn-press inline-flex items-center gap-1.5 text-xs font-bold text-[#C2412E] hover:underline">
              <Trash2 className="w-4 h-4" /> Hapus akun ini secara permanen
            </button>
          ) : (
            <p className="text-xs text-[#66748C]">Untuk memblokir akun, ubah status menjadi &ldquo;Ditolak / nonaktif&rdquo;. Hapus permanen membutuhkan secret key di server.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TambahAkun({
  open, onClose, kelas, layanan, onSelesai,
}: {
  open: boolean;
  onClose: () => void;
  kelas: Kelas[];
  layanan: boolean | null;
  onSelesai: (info: { email: string; sandi: string; nama: string }) => void;
}) {
  const supabase = createClient();
  const kosong = { nama: '', email: '', peran: 'siswa' as PeranAkun, nomor: '', kelas: '', kelasGuru: [] as string[], sandi: '' };
  const [f, setF] = useState(kosong);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    if (open) {
      setF({ ...kosong, sandi: sandiAcak() });
      setGalat(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const simpan = async () => {
    setGalat(null);
    if (f.nama.trim().length < 3) return setGalat('Tulis nama lengkap (minimal 3 huruf).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setGalat('Format email tidak valid.');
    if (f.sandi.length < 8) return setGalat('Kata sandi awal minimal 8 karakter.');
    setSibuk(true);
    const r = await buatAkun(supabase, {
      full_name: f.nama.trim(),
      email: f.email.trim().toLowerCase(),
      password: f.sandi,
      role: f.peran,
      nomor_induk: f.nomor.trim() || null,
      kelas_id: f.peran === 'siswa' ? f.kelas || null : null,
      kelas_ids: f.peran === 'guru' ? f.kelasGuru : [],
    }, { lewatApi: layanan !== false });
    setSibuk(false);
    if (!r.ok) return setGalat(r.pesan);
    onSelesai({ email: f.email.trim().toLowerCase(), sandi: f.sandi, nama: f.nama.trim() });
  };

  return (
    <Modal
      open={open}
      busy={sibuk}
      lebar="lg"
      onClose={onClose}
      title="Tambah Akun"
      actions={
        <>
          <button type="button" onClick={onClose} disabled={sibuk} className={tombolBatal}>Batal</button>
          <button type="button" onClick={simpan} disabled={sibuk} className={tombolUtama}>{sibuk ? <Spinner /> : <UserPlus className="w-4 h-4" />} Buat Akun</button>
        </>
      }
    >
      <div className="space-y-4 text-[#1F2A37]">
        <div className="surface-inset grid grid-cols-3 gap-1 p-1 rounded-xl" role="radiogroup" aria-label="Peran akun">
          {PERAN.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={f.peran === p} onClick={() => setF({ ...f, peran: p })} className={`btn-press py-2 rounded-lg text-xs font-bold ${f.peran === p ? 'bg-white text-[#1B4E80] shadow-[0_2px_6px_rgba(27,78,128,0.08)]' : 'text-[#66748C] hover:text-[#1B4E80]'}`}>
              {kapital(p)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="t-nama" className="block text-xs font-bold mb-1.5">Nama lengkap</label>
            <input id="t-nama" data-autofocus value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="t-email" className="block text-xs font-bold mb-1.5">Email</label>
            <input id="t-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label htmlFor="t-nomor" className="block text-xs font-bold mb-1.5">{f.peran === 'siswa' ? 'NIS / NISN' : 'NIP / NUPTK'} <span className="font-normal text-[#94A3B8]">(opsional)</span></label>
            <input id="t-nomor" value={f.nomor} onChange={(e) => setF({ ...f, nomor: e.target.value })} className={`${inputClass} tabular`} />
          </div>
          <div>
            <label htmlFor="t-sandi" className="block text-xs font-bold mb-1.5">Kata sandi awal</label>
            <div className="flex gap-2">
              <input id="t-sandi" value={f.sandi} onChange={(e) => setF({ ...f, sandi: e.target.value })} className={`${inputClass} font-mono`} />
              <button type="button" onClick={() => setF({ ...f, sandi: sandiAcak() })} aria-label="Buat kata sandi otomatis" title="Buat otomatis" className="btn-press px-3 rounded-xl border border-[#DCEAF7] text-[#2E7BC4] hover:bg-[#EAF6FF]"><Wand2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
        {f.peran === 'siswa' && (
          <div>
            <label htmlFor="t-kelas" className="block text-xs font-bold mb-1.5">Kelas</label>
            <select id="t-kelas" value={f.kelas} onChange={(e) => setF({ ...f, kelas: e.target.value })} className={inputClass}>
              <option value="">— Belum masuk kelas —</option>
              {kelas.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </div>
        )}
        {f.peran === 'guru' && (
          <fieldset>
            <legend className="block text-xs font-bold mb-1.5">Kelas yang diampu</legend>
            <div className="flex flex-wrap gap-2">
              {kelas.length === 0 && <p className="text-xs text-[#66748C]">Belum ada kelas.</p>}
              {kelas.map((k) => {
                const dipilih = f.kelasGuru.includes(k.id);
                return (
                  <label key={k.id} className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${dipilih ? 'border-[#2E7BC4] bg-[#EAF6FF] text-[#1B4E80]' : 'border-[#DCEAF7] text-[#66748C]'}`}>
                    <input type="checkbox" checked={dipilih} onChange={() => setF({ ...f, kelasGuru: dipilih ? f.kelasGuru.filter((x) => x !== k.id) : [...f.kelasGuru, k.id] })} className="w-4 h-4 accent-[#2E7BC4]" />
                    {k.nama}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {layanan === false && (
          <p className="text-xs text-[#66748C] bg-[#F4F9FF] border border-[#DCEAF7] rounded-lg px-3 py-2">
            Secret key belum dipasang, jadi akun dibuat lewat pendaftaran biasa lalu otomatis disetujui. Pastikan &ldquo;Enable signup&rdquo; di Supabase menyala.
          </p>
        )}
        <Galat teks={galat} />
      </div>
    </Modal>
  );
}

interface BarisImpor {
  baris: number;
  nama: string;
  email: string;
  peran: PeranAkun;
  kelasNama: string;
  kelasId: string | null;
  nomor: string;
  sandi: string;
  galat: string | null;
  hasil?: 'ok' | string;
}

function ImporAkun({ open, onClose, kelas, layanan }: { open: boolean; onClose: () => void; kelas: Kelas[]; layanan: boolean | null }) {
  const supabase = createClient();
  const [teks, setTeks] = useState('');
  const [baris, setBaris] = useState<BarisImpor[]>([]);
  const [jalan, setJalan] = useState(false);
  const [progres, setProgres] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (open) {
      setTeks('');
      setBaris([]);
      setProgres(0);
      setTotal(0);
    }
  }, [open]);

  const periksa = (isi: string) => {
    const data = parseCsv(isi);
    if (!data.length) return setBaris([]);
    const kepala = data[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    const kol = (...nama: string[]) => kepala.findIndex((h) => nama.includes(h));
    const iNama = kol('nama', 'nama_lengkap', 'full_name');
    const iEmail = kol('email', 'surel');
    const iPeran = kol('peran', 'role');
    const iKelas = kol('kelas', 'class', 'class_name');
    const iNomor = kol('nomor_induk', 'nis', 'nisn', 'nip');
    const iSandi = kol('kata_sandi', 'sandi', 'password');
    const terlihat = new Set<string>();
    setBaris(
      data.slice(1).map((r, i) => {
        const email = (r[iEmail] ?? '').toLowerCase();
        const peranMentah = (r[iPeran] ?? 'siswa').toLowerCase();
        const peran: PeranAkun = peranMentah === 'guru' ? 'guru' : peranMentah === 'admin' ? 'admin' : 'siswa';
        const kelasNama = r[iKelas] ?? '';
        const k = kelas.find((x) => x.nama.toLowerCase() === kelasNama.trim().toLowerCase());
        const sandi = r[iSandi] || sandiAcak();
        let galat: string | null = null;
        if (iNama < 0 || iEmail < 0) galat = 'Kolom "nama" dan "email" wajib ada di baris judul.';
        else if ((r[iNama] ?? '').length < 3) galat = 'Nama terlalu pendek.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) galat = 'Email tidak valid.';
        else if (terlihat.has(email)) galat = 'Email ganda di berkas.';
        else if (kelasNama && !k) galat = `Kelas "${kelasNama}" tidak ditemukan.`;
        else if (sandi.length < 8) galat = 'Kata sandi minimal 8 karakter.';
        terlihat.add(email);
        return { baris: i + 2, nama: r[iNama] ?? '', email, peran, kelasNama, kelasId: k?.id ?? null, nomor: r[iNomor] ?? '', sandi, galat };
      })
    );
  };

  const valid = baris.filter((b) => !b.galat && !b.hasil);
  const mulai = async () => {
    setJalan(true);
    setTotal(valid.length);
    setProgres(0);
    let n = 0;
    for (const b of valid) {
      const r = await buatAkun(supabase, {
        full_name: b.nama,
        email: b.email,
        password: b.sandi,
        role: b.peran,
        nomor_induk: b.nomor || null,
        kelas_id: b.peran === 'siswa' ? b.kelasId : null,
        kelas_ids: b.peran === 'guru' && b.kelasId ? [b.kelasId] : [],
      }, { lewatApi: layanan !== false });
      n++;
      setProgres(n);
      setBaris((d) => d.map((x) => (x.baris === b.baris ? { ...x, hasil: r.ok ? 'ok' : r.pesan } : x)));
    }
    setJalan(false);
  };

  const unduhHasil = () =>
    unduhTeks(
      'hasil-impor-akun.csv',
      keCsv([
        ['nama', 'email', 'peran', 'kelas', 'nomor_induk', 'kata_sandi', 'status'],
        ...baris.map((b) => [b.nama, b.email, b.peran, b.kelasNama, b.nomor, b.hasil === 'ok' ? b.sandi : '', b.hasil === 'ok' ? 'berhasil' : b.hasil || b.galat || 'belum diproses']),
      ])
    );

  const templat = () =>
    unduhTeks('templat-impor-akun.csv', keCsv([
      ['nama', 'email', 'peran', 'kelas', 'nomor_induk', 'kata_sandi'],
      ['Contoh Siswa Satu', 'siswa1@sekolah.sch.id', 'siswa', kelas[0]?.nama ?? 'VII-A', '2425001', ''],
      ['Contoh Guru Satu', 'guru1@sekolah.sch.id', 'guru', kelas[0]?.nama ?? 'VII-A', '', ''],
    ]));

  const selesai = baris.filter((b) => b.hasil).length;
  return (
    <Modal
      open={open}
      busy={jalan}
      lebar="lg"
      onClose={onClose}
      title="Impor Akun dari CSV"
      actions={
        <>
          {selesai > 0 && <button type="button" onClick={unduhHasil} className={tombolBatal}><Download className="w-4 h-4 inline mr-1" /> Unduh hasil + kata sandi</button>}
          <button type="button" onClick={onClose} disabled={jalan} className={tombolBatal}>Tutup</button>
          <button type="button" onClick={mulai} disabled={jalan || !valid.length} className={tombolUtama}>
            {jalan ? <><Spinner /> Mengimpor {progres}/{total}</> : <>Impor {valid.length} akun</>}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-[#1F2A37]">
        <p className="text-xs text-[#66748C] leading-relaxed">
          Format kolom: <span className="font-mono">nama, email, peran, kelas, nomor_induk, kata_sandi</span>. Peran: siswa/guru/admin. Kata sandi kosong akan dibuat otomatis.{' '}
          <button type="button" onClick={templat} className="font-bold text-[#2E7BC4] hover:underline">Unduh templat</button>
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Pilih berkas CSV"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const isi = await f.text();
            setTeks(isi);
            periksa(isi);
          }}
          className="block w-full text-xs file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-[#EAF6FF] file:text-[#1B4E80] file:font-bold"
        />
        <textarea aria-label="Isi CSV" rows={4} value={teks} onChange={(e) => { setTeks(e.target.value); periksa(e.target.value); }} placeholder="…atau tempel isi CSV di sini" className={`${inputClass} font-mono text-xs resize-y`} />
        {baris.length > 0 && (
          <div className="max-h-[300px] overflow-auto rounded-xl border border-[#E6EEF7]">
            <table className="w-full text-xs">
              <thead className="bg-[#F4F9FF] text-[#1B4E80] sticky top-0">
                <tr><th className="text-left p-2">#</th><th className="text-left p-2">Nama</th><th className="text-left p-2">Email</th><th className="text-left p-2">Peran</th><th className="text-left p-2">Kelas</th><th className="text-left p-2">Status</th></tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.baris} className="border-t border-[#F1F5F9]">
                    <td className="p-2 text-[#94A3B8] tabular">{b.baris}</td>
                    <td className="p-2">{b.nama}</td>
                    <td className="p-2">{b.email}</td>
                    <td className="p-2">{b.peran}</td>
                    <td className="p-2">{b.kelasNama || '-'}</td>
                    <td className={`p-2 font-semibold ${b.hasil === 'ok' ? 'text-[#15885A]' : b.hasil || b.galat ? 'text-[#C2412E]' : 'text-[#66748C]'}`}>
                      {b.hasil === 'ok' ? 'Berhasil' : b.hasil || b.galat || 'Siap'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
