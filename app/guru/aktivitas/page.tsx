'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { MonitorKeluarTab } from '@/components/monitor-keluar-tab';
import { JENIS, isJenis, type JenisPengerjaan } from '@/lib/pengerjaan';
import { kunciNilai, muatRekap, rataSiswa, type Rekap } from '@/lib/rekap';
import { sedangOnline, tanggalIni, waktuRelatif } from '@/lib/waktu';
import { useProfil } from '@/lib/use-profil';
import { Activity, Users, Wifi, Eye, LogIn, BookOpen, PencilLine, Send, RefreshCw, Inbox, Clock } from 'lucide-react';

interface Aktivitas {
  id: number;
  user_id: string;
  jenis: string;
  detail: { bagian?: number; jenis?: string } | null;
  created_at: string;
  materi: { chapter_number: number | null; title: string | null } | null;
}

const IKON: Record<string, { icon: React.ElementType; warna: string }> = {
  masuk: { icon: LogIn, warna: 'bg-[#EAF6FF] text-[#2E7BC4]' },
  buka_materi: { icon: BookOpen, warna: 'bg-[#E4F8EE] text-[#15885A]' },
  mulai_tugas: { icon: PencilLine, warna: 'bg-[#FFF1DD] text-[#E37A12]' },
  kumpul_tugas: { icon: Send, warna: 'bg-[#EAEFF5] text-[#133B63]' },
};

function teksAktivitas(a: Aktivitas): string {
  const bab = a.materi?.chapter_number ? `Bab ${a.materi.chapter_number}` : 'materi';
  const jenis = a.detail?.jenis && isJenis(a.detail.jenis) ? JENIS[a.detail.jenis as JenisPengerjaan].singkat : 'tugas';
  switch (a.jenis) {
    case 'masuk':
      return 'masuk ke elearnMath';
    case 'buka_materi':
      return `membuka ${bab}${a.detail?.bagian ? ` (subbab ${a.detail.bagian})` : ''}`;
    case 'mulai_tugas':
      return `mulai mengerjakan ${jenis} ${bab}`;
    case 'kumpul_tugas':
      return `mengumpulkan ${jenis} ${bab}`;
    default:
      return a.jenis;
  }
}

export default function AktivitasSiswaPage() {
  const supabase = createClient();
  const profil = useProfil();
  const kelasSaya = useMemo(() => profil?.kelas.map((k) => k.nama) ?? [], [profil]);
  const [tab, setTab] = useState<'siswa' | 'linimasa' | 'keluar'>('siswa');
  const [kelas, setKelas] = useState('semua');
  const [rekap, setRekap] = useState<Rekap | null>(null);
  const [aktivitas, setAktivitas] = useState<Aktivitas[]>([]);
  const [tabLog, setTabLog] = useState<{ id_siswa: string; created_at: string }[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [kini, setKini] = useState(Date.now());

  useEffect(() => {
    if (kelasSaya.length) setKelas((k) => (k === 'semua' ? 'saya' : k));
  }, [kelasSaya]);

  const muat = useCallback(async () => {
    const [r, a, t] = await Promise.all([
      muatRekap(supabase),
      supabase.from('aktivitas').select('id, user_id, jenis, detail, created_at, materi:id_materi(chapter_number, title)').order('created_at', { ascending: false }).limit(400),
      supabase.from('tab_switch_logs').select('id_siswa, created_at').limit(5000),
    ]);
    setRekap(r);
    setAktivitas((a.data ?? []) as unknown as Aktivitas[]);
    setTabLog((t.data ?? []) as { id_siswa: string; created_at: string }[]);
    setKini(Date.now());
  }, [supabase]);

  useEffect(() => {
    muat();
    const t = setInterval(() => document.visibilityState === 'visible' && muat(), 30_000);
    return () => clearInterval(t);
  }, [muat]);

  const siswa = useMemo(() => {
    if (!rekap) return [];
    return rekap.siswa
      .filter((s) => (kelas === 'saya' ? kelasSaya.includes(s.kelas) : kelas === 'semua' ? true : s.kelas === kelas))
      .sort((a, b) => Number(sedangOnline(b.terakhir_aktif, kini)) - Number(sedangOnline(a.terakhir_aktif, kini)) || (b.terakhir_aktif ?? '').localeCompare(a.terakhir_aktif ?? ''));
  }, [rekap, kelas, kelasSaya, kini]);
  const idSiswa = useMemo(() => new Set(siswa.map((s) => s.id)), [siswa]);
  const daftarKelas = useMemo(() => Array.from(new Set(rekap?.siswa.map((s) => s.kelas) ?? [])).sort(), [rekap]);

  const progres = (id: string, j: JenisPengerjaan) => (rekap ? rekap.materi.filter((m) => rekap.nilai.has(kunciNilai(id, m.id, j))).length : 0);
  const terakhir = (id: string) => aktivitas.find((a) => a.user_id === id);
  const awalHari = new Date(`${tanggalIni()}T00:00:00+07:00`).getTime();
  const keluarHariIni = (id: string) => tabLog.filter((l) => l.id_siswa === id && new Date(l.created_at).getTime() >= awalHari).length;
  const totalKeluar = (id: string) => tabLog.filter((l) => l.id_siswa === id).length;

  const online = siswa.filter((s) => sedangOnline(s.terakhir_aktif, kini)).length;
  const aktifHariIni = siswa.filter((s) => s.terakhir_aktif && new Date(s.terakhir_aktif).getTime() >= awalHari).length;
  const nBab = rekap?.materi.length ?? 0;
  const linimasa = aktivitas.filter((a) => idSiswa.has(a.user_id));
  const namaDari = (id: string) => rekap?.siswa.find((s) => s.id === id)?.nama ?? 'Siswa';
  const siswaDetail = rekap?.siswa.find((s) => s.id === detail) ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Aktivitas Siswa" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil ? 'guru' : null} />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1140px] w-full mx-auto">
        <div className="hero-navy p-6 sm:p-7 mb-6 anim-rise">
          <div className="relative z-10 flex items-start sm:items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-xs font-bold text-[#A7F3D0] mb-3">
                <span className="w-2 h-2 rounded-full bg-[#34D399] anim-pulse" />
                Pemantauan langsung · otomatis 30 dtk
              </div>
              <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-[-0.02em] flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-white/14 border border-white/25 flex items-center justify-center text-[#FFCA80] shadow-inner shrink-0">
                  <Activity className="w-5 h-5" />
                </span>
                Aktivitas Siswa
              </h1>
              <p className="text-xs sm:text-[13px] text-[#C8E1FA] mt-1.5 max-w-2xl leading-relaxed">
                Siapa yang sedang online, sejauh mana penyelesaian tugas, apa yang sedang dikerjakan, dan catatan keluar tab.
              </p>
            </div>
            <div className="flex items-center gap-2 relative z-10">
              <select
                value={kelas}
                onChange={(e) => setKelas(e.target.value)}
                aria-label="Filter kelas"
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-white/14 hover:bg-white/20 border border-white/25 backdrop-blur-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FFB454]/70 [&>option]:text-[#0E2A48] [&>option]:bg-white"
              >
                {kelasSaya.length > 0 && <option value="saya">Kelas saya</option>}
                <option value="semua">Semua kelas</option>
                {daftarKelas.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <button
                type="button"
                onClick={muat}
                aria-label="Muat ulang"
                className="btn-press w-9 h-9 rounded-xl flex items-center justify-center text-white bg-white/14 hover:bg-white/22 border border-white/25 shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-5">
          {[
            { label: 'Sedang online', nilai: online, icon: Wifi, warna: 'bg-[#E5F6EE] text-[#15885A]' },
            { label: 'Aktif hari ini', nilai: aktifHariIni, icon: Clock, warna: 'bg-[#E6F0FA] text-[#1F63A8]' },
            { label: 'Jumlah siswa', nilai: siswa.length, icon: Users, warna: 'bg-[#EAEFF5] text-[#133B63]' },
            { label: 'Keluar tab hari ini', nilai: siswa.reduce((a, s) => a + keluarHariIni(s.id), 0), icon: Eye, warna: 'bg-[#FDECEA] text-[#C2412E]' },
          ].map(({ label, nilai, icon: Icon, warna }, idx) => (
            <div key={label} className="bento-stat p-4 flex items-center gap-3.5 anim-rise" style={{ ['--i' as string]: idx }}>
              <span className={`w-11 h-11 rounded-xl ${warna} flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-extrabold text-[#0E2A48] leading-none tabular">{rekap ? nilai : '…'}</span>
                <span className="block text-xs font-semibold text-[#5A6B82] mt-1.5 truncate">{label}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="surface-inset flex gap-1 p-1 rounded-xl w-fit mb-5" role="tablist" aria-label="Tampilan aktivitas">
          {([['siswa', 'Progres Siswa'], ['linimasa', 'Linimasa'], ['keluar', 'Keluar Tab']] as const).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`btn-press px-4 py-2 rounded-[10px] text-[13px] font-semibold ${
                tab === k
                  ? 'bg-white text-[#0E2A48] shadow-[0_1px_2px_rgba(15,45,78,0.12),0_2px_6px_-2px_rgba(15,45,78,0.12)]'
                  : 'text-[#5A6B82] hover:text-[#0E2A48]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {!rekap ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : tab === 'keluar' ? (
          <MonitorKeluarTab kelasSaya={kelasSaya} />
        ) : tab === 'linimasa' ? (
          linimasa.length === 0 ? (
            <div className="glass-card p-10 text-center"><Inbox className="w-12 h-12 text-[#9CC5EC] mx-auto mb-3" /><p className="text-sm font-bold text-[#0E2A48]">Belum ada aktivitas.</p></div>
          ) : (
            <ol className="glass-card p-5 divide-y divide-[#E7F0FA]">
              {linimasa.slice(0, 120).map((a) => {
                const g = IKON[a.jenis] ?? IKON.masuk;
                const Icon = g.icon;
                return (
                  <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-black/[0.04] ${g.warna}`}><Icon className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0 text-sm text-[#162232]">
                      <button type="button" onClick={() => setDetail(a.user_id)} className="font-extrabold text-[#0E2A48] hover:text-[#256DB3] hover:underline">{namaDari(a.user_id)}</button> {teksAktivitas(a)}
                      <span className="block text-xs font-medium text-[#7C8DA4] mt-0.5">{waktuRelatif(a.created_at, kini)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )
        ) : siswa.length === 0 ? (
          <div className="glass-card p-10 text-center"><Inbox className="w-12 h-12 text-[#9CC5EC] mx-auto mb-3" /><p className="text-sm font-bold text-[#0E2A48]">Belum ada siswa di kelas ini.</p></div>
        ) : (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-[#F5F9FD] text-[#5A6B82] text-xs border-b border-[#E1EAF4]">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Siswa</th>
                    <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">Status</th>
                    {(['lkpd', 'latihan', 'evaluasi'] as JenisPengerjaan[]).map((j) => <th key={j} className="px-3 py-3 font-semibold whitespace-nowrap">{JENIS[j].singkat}</th>)}
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Rata-rata</th>
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">Keluar tab</th>
                    <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Aktivitas terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {siswa.map((s) => {
                    const on = sedangOnline(s.terakhir_aktif, kini);
                    const akhir = terakhir(s.id);
                    const rata = rataSiswa(rekap, s.id);
                    return (
                      <tr key={s.id} className="border-t border-[#EDF2F8] first:border-t-0 hover:bg-[#F6FAFE] transition-colors duration-150 cursor-pointer" onClick={() => setDetail(s.id)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-full bg-[#E6EEF8] text-[#1B4E80] text-xs font-extrabold flex items-center justify-center shrink-0">
                              {s.nama.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <span className="block font-bold text-[#162232] truncate">{s.nama}</span>
                              <span className="block text-xs font-medium text-[#6B7C93]">Kelas {s.kelas}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${
                            on
                              ? 'bg-[#E5F6EE] text-[#127A4D]'
                              : 'bg-[#F1F5F9] text-[#64748B]'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${on ? 'bg-[#1B9E65] anim-pulse' : 'bg-[#CBD5E1]'}`} /> {on ? 'Online' : s.terakhir_aktif ? waktuRelatif(s.terakhir_aktif, kini) : 'Belum pernah'}
                          </span>
                        </td>
                        {(['lkpd', 'latihan', 'evaluasi'] as JenisPengerjaan[]).map((j) => {
                          const n = progres(s.id, j);
                          return (
                            <td key={j} className="px-3 py-3 text-center">
                              <span className="text-xs font-bold tabular text-[#0E2A48]">{n}/{nBab}</span>
                              <span className="block h-1.5 w-14 mx-auto rounded-full bg-[#E6EEF7] mt-1 overflow-hidden"><span className="block h-full bg-[#2B78C6] rounded-full transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: `${nBab ? (n / nBab) * 100 : 0}%` }} /></span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center">
                          {rata != null ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-md bg-[#EEF4FA] font-extrabold tabular text-[#0E2A48] text-xs">
                              {rata}
                            </span>
                          ) : (
                            <span className="text-[#94A3B8]">–</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {totalKeluar(s.id) ? <span className={`tabular text-xs font-bold px-2 py-0.5 rounded-full ${totalKeluar(s.id) >= 3 ? 'bg-[#FDECEA] text-[#C2412E]' : 'bg-[#FFF3E2] text-[#B45309]'}`}>{totalKeluar(s.id)}×</span> : <span className="text-[#CBD5E1]">–</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#435368]">{akhir ? <>{teksAktivitas(akhir)} <span className="text-[#8798AE]">· {waktuRelatif(akhir.created_at, kini)}</span></> : <span className="text-[#94A3B8]">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!siswaDetail}
        lebar="lg"
        onClose={() => setDetail(null)}
        title={siswaDetail ? `${siswaDetail.nama} · Kelas ${siswaDetail.kelas}` : ''}
        actions={<button type="button" data-autofocus onClick={() => setDetail(null)} className="btn-primary px-5 py-2.5 rounded-xl font-bold text-sm">Tutup</button>}
      >
        {siswaDetail && rekap && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-[#E6EEF7]">
              <table className="w-full text-xs">
                <thead className="bg-[#F4F9FF] text-[#1B4E80]"><tr><th className="text-left p-2">Bab</th><th className="p-2">LKPD</th><th className="p-2">Latihan</th><th className="p-2">Evaluasi</th></tr></thead>
                <tbody>
                  {rekap.materi.map((m) => (
                    <tr key={m.id} className="border-t border-[#F1F5F9]">
                      <td className="p-2 font-semibold text-[#1F2A37]">Bab {m.bab}</td>
                      {(['lkpd', 'latihan', 'evaluasi'] as JenisPengerjaan[]).map((j) => {
                        const n = rekap.nilai.get(kunciNilai(siswaDetail.id, m.id, j));
                        return <td key={j} className="p-2 text-center">{!n ? <span className="text-[#CBD5E1]">belum</span> : n.final ? <strong className="text-[#15885A]">{n.skor}</strong> : <span className="text-[#B45309]">menunggu</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-[#1B4E80] mb-2">Aktivitas terbaru</h3>
              <ol className="space-y-1.5 max-h-56 overflow-y-auto">
                {aktivitas.filter((a) => a.user_id === siswaDetail.id).slice(0, 30).map((a) => (
                  <li key={a.id} className="text-xs text-[#4B5A70]"><span className="text-[#94A3B8] tabular">{new Date(a.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> — {teksAktivitas(a)}</li>
                ))}
                {!aktivitas.some((a) => a.user_id === siswaDetail.id) && <li className="text-xs text-[#94A3B8]">Belum ada aktivitas tercatat.</li>}
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
