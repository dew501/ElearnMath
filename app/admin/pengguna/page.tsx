'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { formatTanggal, pesanGalat } from '@/lib/pengerjaan';
import { Search, Check, X, PencilLine, Inbox, AlertTriangle, UserCheck } from 'lucide-react';

interface Pengguna {
  id: string;
  email: string | null;
  full_name: string | null;
  class_name: string | null;
  role: string | null;
  status_approval: string | null;
  created_at: string | null;
}

const STATUS: Record<string, { label: string; kelas: string }> = {
  APPROVED: { label: 'Disetujui', kelas: 'bg-[#E4F8EE] text-[#15885A]' },
  PENDING: { label: 'Menunggu', kelas: 'bg-[#FFF1DD] text-[#B45309]' },
  REJECTED: { label: 'Ditolak', kelas: 'bg-[#FDEAE7] text-[#C2412E]' },
};
const PERAN = ['siswa', 'guru', 'admin'] as const;

const selectClass =
  'px-3 py-2 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10';
const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10';

export default function KelolaPenggunaPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saya, setSaya] = useState<{ id: string; nama: string } | null>(null);
  const [daftar, setDaftar] = useState<Pengguna[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState('');
  const [peran, setPeran] = useState('semua');
  const [status, setStatus] = useState('semua');
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [edit, setEdit] = useState<Pengguna | null>(null);
  const [setujuiSemua, setSetujuiSemua] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('status')) setStatus(q.get('status')!);
    if (q.get('peran')) setPeran(q.get('peran')!);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, class_name, role, status_approval, created_at')
        .order('created_at', { ascending: false });
      if (error) setGalat(pesanGalat(error));
      const list = (data ?? []) as Pengguna[];
      setDaftar(list);
      const me = list.find((u) => u.id === user.id);
      setSaya({ id: user.id, nama: me?.full_name || user.email?.split('@')[0] || 'Admin' });
      setMemuat(false);
    })();
  }, [router, supabase]);

  const tersaring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return daftar
      .filter((u) => (peran === 'semua' || u.role === peran) && (status === 'semua' || (u.status_approval ?? 'PENDING') === status))
      .filter((u) => !k || `${u.full_name ?? ''} ${u.email ?? ''} ${u.class_name ?? ''}`.toLowerCase().includes(k))
      .sort((a, b) => Number(b.status_approval === 'PENDING') - Number(a.status_approval === 'PENDING'));
  }, [daftar, cari, peran, status]);
  const jumlahMenunggu = daftar.filter((u) => u.status_approval === 'PENDING').length;

  const perbarui = async (u: Pengguna, patch: Partial<Pengguna>, pesanOk: string) => {
    setSibuk(u.id);
    const { data, error } = await supabase.from('users').update(patch).eq('id', u.id).select('id');
    setSibuk(null);
    if (error || !data?.length) {
      setToast({ id: Date.now(), tone: 'error', text: error ? pesanGalat(error) : 'Gagal menyimpan: akun Anda tidak memiliki izin.' });
      return false;
    }
    setDaftar((d) => d.map((x) => (x.id === u.id ? { ...x, ...patch } : x)));
    setToast({ id: Date.now(), tone: 'success', text: pesanOk });
    return true;
  };

  const simpanEdit = async () => {
    if (!edit) return;
    const asli = daftar.find((u) => u.id === edit.id);
    if (!asli) return;
    const ok = await perbarui(
      asli,
      { full_name: edit.full_name?.trim() || null, class_name: edit.class_name?.trim() || null, role: edit.role, status_approval: edit.status_approval },
      `Data ${edit.full_name || edit.email} diperbarui.`
    );
    if (ok) setEdit(null);
  };

  const setujuiSemuaMenunggu = async () => {
    setSibuk('semua');
    const { data, error } = await supabase.from('users').update({ status_approval: 'APPROVED' }).eq('status_approval', 'PENDING').select('id');
    setSibuk(null);
    setSetujuiSemua(false);
    if (error) return setToast({ id: Date.now(), tone: 'error', text: pesanGalat(error) });
    const ids = new Set((data ?? []).map((r) => r.id));
    setDaftar((d) => d.map((u) => (ids.has(u.id) ? { ...u, status_approval: 'APPROVED' } : u)));
    setToast({ id: Date.now(), tone: 'success', text: `${ids.size} akun disetujui.` });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Kelola Pengguna" userRole="admin" userName={saya?.nama ?? '…'} />
      <StaffNav role="admin" />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1100px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80]">Kelola Pengguna</h1>
            <p className="text-xs text-[#66748C] mt-1">Setujui akun baru, atur peran guru/siswa, dan lengkapi kelas siswa.</p>
          </div>
          {jumlahMenunggu > 0 && (
            <button
              type="button"
              onClick={() => setSetujuiSemua(true)}
              className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#22B573] hover:bg-[#15885A] text-white text-sm font-bold shadow-[0_6px_16px_rgba(34,181,115,0.3)]"
            >
              <UserCheck className="w-4 h-4" /> Setujui {jumlahMenunggu} akun menunggu
            </button>
          )}
        </div>

        <div className="glass-card p-4 mb-5 flex flex-wrap gap-2 items-center anim-rise" style={{ ['--i' as string]: 1 }}>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama, email, atau kelas..."
              aria-label="Cari pengguna"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DCEAF7] bg-white text-xs focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10"
            />
          </div>
          <select value={peran} onChange={(e) => setPeran(e.target.value)} className={selectClass} aria-label="Filter peran">
            <option value="semua">Semua peran</option>
            {PERAN.map((p) => (
              <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass} aria-label="Filter status">
            <option value="semua">Semua status</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
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
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
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
            {tersaring.map((u, i) => {
              const st = STATUS[u.status_approval ?? 'PENDING'] ?? STATUS.PENDING;
              const diriSendiri = u.id === saya?.id;
              return (
                <article
                  key={u.id}
                  className={`glass-card p-4 flex flex-col md:flex-row md:items-center gap-3 anim-rise ${u.status_approval === 'PENDING' ? 'ring-1 ring-[#FBD38D]' : ''}`}
                  style={{ ['--i' as string]: Math.min(i, 8) }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5FA8E8] to-[#2E7BC4] text-white text-sm font-extrabold flex items-center justify-center shrink-0">
                      {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#1F2A37] truncate">{u.full_name || '(tanpa nama)'}</span>
                        {diriSendiri && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EAF6FF] text-[#2E7BC4]">Anda</span>}
                      </div>
                      <div className="text-[11px] text-[#66748C] truncate">
                        {u.email} {u.class_name ? `· Kelas ${u.class_name}` : ''} · Terdaftar {formatTanggal(u.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#D3ECFF] text-[#1B4E80] uppercase tracking-wide">{u.role ?? '-'}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${st.kelas}`}>{st.label}</span>
                    {!diriSendiri && u.status_approval !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={sibuk === u.id}
                        onClick={() => perbarui(u, { status_approval: 'APPROVED' }, `${u.full_name || u.email} disetujui.`)}
                        className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#22B573] hover:bg-[#15885A] text-white text-xs font-bold disabled:opacity-60"
                      >
                        {sibuk === u.id ? <Spinner className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} Setujui
                      </button>
                    )}
                    {!diriSendiri && u.status_approval !== 'REJECTED' && (
                      <button
                        type="button"
                        disabled={sibuk === u.id}
                        onClick={() => perbarui(u, { status_approval: 'REJECTED' }, `${u.full_name || u.email} ditolak dan tidak bisa masuk.`)}
                        className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7] disabled:opacity-60"
                      >
                        <X className="w-3.5 h-3.5" /> {u.status_approval === 'APPROVED' ? 'Nonaktifkan' : 'Tolak'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEdit({ ...u })}
                      className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#1B4E80] hover:bg-[#EAF6FF]"
                    >
                      <PencilLine className="w-3.5 h-3.5" /> Ubah
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={edit !== null}
        busy={sibuk !== null}
        onClose={() => setEdit(null)}
        title="Ubah data pengguna"
        actions={
          <>
            <button type="button" onClick={() => setEdit(null)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF]">
              Batal
            </button>
            <button type="button" onClick={simpanEdit} disabled={sibuk !== null} className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {sibuk !== null && <Spinner />} Simpan
            </button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3 text-[#1F2A37]">
            <p className="text-xs text-[#66748C]">{edit.email}</p>
            <div>
              <label htmlFor="e-nama" className="block text-xs font-bold mb-1.5">Nama lengkap</label>
              <input id="e-nama" data-autofocus value={edit.full_name ?? ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="e-kelas" className="block text-xs font-bold mb-1.5">Kelas</label>
              <input id="e-kelas" value={edit.class_name ?? ''} onChange={(e) => setEdit({ ...edit, class_name: e.target.value })} placeholder="Contoh: VII-A" className={inputClass} />
            </div>
            {edit.id === saya?.id ? (
              <p className="text-[11px] text-[#B45309] bg-[#FFF8EC] border border-[#FBD38D] rounded-lg px-3 py-2">
                Peran dan status akun Anda sendiri tidak bisa diubah dari sini agar Anda tidak terkunci.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="e-peran" className="block text-xs font-bold mb-1.5">Peran</label>
                  <select id="e-peran" value={edit.role ?? 'siswa'} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className={inputClass}>
                    {PERAN.map((p) => (
                      <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="e-status" className="block text-xs font-bold mb-1.5">Status</label>
                  <select id="e-status" value={edit.status_approval ?? 'PENDING'} onChange={(e) => setEdit({ ...edit, status_approval: e.target.value })} className={inputClass}>
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={setujuiSemua}
        busy={sibuk === 'semua'}
        onClose={() => setSetujuiSemua(false)}
        title={`Setujui ${jumlahMenunggu} akun?`}
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#E4F8EE] flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-[#15885A]" />
          </div>
        }
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setSetujuiSemua(false)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">
              Batal
            </button>
            <button type="button" onClick={setujuiSemuaMenunggu} disabled={sibuk === 'semua'} className="btn-press px-5 py-2.5 rounded-xl bg-[#22B573] hover:bg-[#15885A] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {sibuk === 'semua' && <Spinner />} Ya, Setujui Semua
            </button>
          </>
        }
      >
        Semua akun berstatus <strong>Menunggu</strong> akan bisa masuk ke aplikasi. Pastikan akun-akun itu memang milik siswa/guru sekolah Anda.
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
