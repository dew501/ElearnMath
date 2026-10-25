'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { JENIS, isJenis, pesanGalat } from '@/lib/pengerjaan';
import { waktuRelatif } from '@/lib/waktu';
import { AlertTriangle, ChevronDown, Eye, Inbox, RefreshCw, Users } from 'lucide-react';

interface Log {
  id: string;
  id_siswa: string;
  category: string | null;
  switch_count: number | null;
  bagian: string | null;
  created_at: string;
  siswa: { full_name: string | null; class_name: string | null } | null;
  materi: { chapter_number: number | null; title: string | null } | null;
}

const RENTANG = [
  ['hari', 'Hari ini'],
  ['minggu', '7 hari'],
  ['bulan', '30 hari'],
  ['semua', 'Semua'],
] as const;
type Rentang = (typeof RENTANG)[number][0];

const selectClass =
  'px-3 py-2 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10';

const labelTugas = (l: Log) => {
  const j = l.category && isJenis(l.category) ? JENIS[l.category].singkat : 'Tugas';
  return `${j}${l.materi?.chapter_number ? ` Bab ${l.materi.chapter_number}` : ''}`;
};

/** Pemantauan keluar tab: siapa, berapa kali, dan saat mengerjakan bagian apa. */
export function MonitorKeluarTab({ kelasSaya }: { kelasSaya?: string[] }) {
  const supabase = createClient();
  const [log, setLog] = useState<Log[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [rentang, setRentang] = useState<Rentang>('minggu');
  const [kelas, setKelas] = useState<string>(kelasSaya?.length ? 'saya' : 'semua');
  const [buka, setBuka] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    let q = supabase
      .from('tab_switch_logs')
      .select('id, id_siswa, category, switch_count, bagian, created_at, siswa:id_siswa(full_name, class_name), materi:id_materi(chapter_number, title)')
      .order('created_at', { ascending: false })
      .limit(3000);
    const hari = rentang === 'hari' ? 0 : rentang === 'minggu' ? 7 : rentang === 'bulan' ? 30 : null;
    if (hari !== null) {
      const awal = new Date();
      if (hari === 0) awal.setHours(0, 0, 0, 0);
      else awal.setDate(awal.getDate() - hari);
      q = q.gte('created_at', awal.toISOString());
    }
    const { data, error } = await q;
    setGalat(error ? pesanGalat(error) : null);
    setLog((data ?? []) as unknown as Log[]);
    setMemuat(false);
  }, [supabase, rentang]);

  useEffect(() => {
    muat();
  }, [muat]);

  const daftarKelas = useMemo(() => Array.from(new Set(log.map((l) => l.siswa?.class_name).filter(Boolean) as string[])).sort(), [log]);
  const tersaring = useMemo(
    () =>
      log.filter((l) => {
        const k = l.siswa?.class_name ?? '';
        if (kelas === 'saya') return !!kelasSaya?.includes(k);
        if (kelas !== 'semua') return k === kelas;
        return true;
      }),
    [log, kelas, kelasSaya]
  );

  const perSiswa = useMemo(() => {
    const peta = new Map<string, { nama: string; kelas: string; total: number; terakhir: string; bagian: Map<string, number>; log: Log[] }>();
    tersaring.forEach((l) => {
      const s = peta.get(l.id_siswa) ?? { nama: l.siswa?.full_name || 'Siswa', kelas: l.siswa?.class_name || '-', total: 0, terakhir: l.created_at, bagian: new Map<string, number>(), log: [] as Log[] };
      s.total += 1;
      if (l.created_at > s.terakhir) s.terakhir = l.created_at;
      const kunci = `${labelTugas(l)}${l.bagian ? ` · ${l.bagian}` : ''}`;
      s.bagian.set(kunci, (s.bagian.get(kunci) ?? 0) + 1);
      s.log.push(l);
      peta.set(l.id_siswa, s);
    });
    return Array.from(peta.entries())
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.total - a.total || b.terakhir.localeCompare(a.terakhir));
  }, [tersaring]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm" role="tablist" aria-label="Rentang waktu">
          {RENTANG.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={rentang === k}
              onClick={() => setRentang(k)}
              className={`btn-press px-3.5 py-1.5 rounded-xl text-xs font-bold ${rentang === k ? 'bg-[#2E7BC4] text-white' : 'text-[#66748C] hover:text-[#1B4E80]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas" className={selectClass}>
          {kelasSaya?.length ? <option value="saya">Kelas saya</option> : null}
          <option value="semua">Semua kelas</option>
          {daftarKelas.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <button type="button" onClick={muat} className="btn-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#2E7BC4] hover:bg-[#EAF6FF]">
          <RefreshCw className="w-3.5 h-3.5" /> Muat ulang
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Kejadian keluar tab', nilai: tersaring.length, icon: Eye, warna: 'from-[#F27E6B] to-[#C2412E]' },
          { label: 'Siswa yang keluar tab', nilai: perSiswa.length, icon: Users, warna: 'from-[#FFB454] to-[#E37A12]' },
          { label: 'Paling sering', nilai: perSiswa[0] ? `${perSiswa[0].nama.split(' ')[0]} (${perSiswa[0].total}×)` : '-', icon: AlertTriangle, warna: 'from-[#7C8CF8] to-[#4F5BD5]' },
        ].map(({ label, nilai, icon: Icon, warna }) => (
          <div key={label} className="glass-card p-4 flex items-center gap-3">
            <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${warna} text-white flex items-center justify-center shrink-0`}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-extrabold text-[#1B4E80] leading-none truncate tabular">{nilai}</span>
              <span className="block text-[11px] font-semibold text-[#66748C] mt-1">{label}</span>
            </span>
          </div>
        ))}
      </div>

      {galat && (
        <div role="alert" className="mb-4 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {galat}
        </div>
      )}

      {memuat ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
        </div>
      ) : perSiswa.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#1B4E80]">Tidak ada siswa yang keluar tab pada rentang ini.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {perSiswa.map((s) => (
            <li key={s.id} className="glass-card overflow-hidden">
              <button
                type="button"
                onClick={() => setBuka(buka === s.id ? null : s.id)}
                aria-expanded={buka === s.id}
                className="w-full text-left p-4 flex items-center gap-3 hover:bg-white/60 transition-colors"
              >
                <span className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 text-white font-extrabold ${s.total >= 5 ? 'bg-[#C2412E]' : s.total >= 3 ? 'bg-[#E37A12]' : 'bg-[#2E7BC4]'}`}>
                  <span className="text-base leading-none tabular">{s.total}</span>
                  <span className="text-[8px] uppercase tracking-wider opacity-80">kali</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#1F2A37] truncate">{s.nama}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D3ECFF] text-[#1B4E80] shrink-0">{s.kelas}</span>
                  </span>
                  <span className="block text-[11px] text-[#66748C] truncate mt-0.5">
                    {Array.from(s.bagian.entries()).map(([b, n]) => `${b} (${n}×)`).join(' · ')}
                  </span>
                </span>
                <span className="text-[11px] text-[#94A3B8] shrink-0 hidden sm:block">{waktuRelatif(s.terakhir)}</span>
                <ChevronDown className={`w-4 h-4 text-[#94A3B8] transition-transform ${buka === s.id ? 'rotate-180' : ''}`} />
              </button>
              {buka === s.id && (
                <ol className="px-4 pb-4 pl-[72px] space-y-1.5 anim-fade">
                  {s.log.map((l) => (
                    <li key={l.id} className="text-xs text-[#4B5A70] flex flex-wrap gap-x-2">
                      <span className="font-semibold text-[#1B4E80] tabular">{new Date(l.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span>{labelTugas(l)}{l.materi?.title ? ` — ${l.materi.title}` : ''}</span>
                      {l.bagian && <span className="text-[#94A3B8]">· {l.bagian}</span>}
                      {l.switch_count ? <span className="text-[#94A3B8]">· ke-{l.switch_count} dalam sesi itu</span> : null}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
