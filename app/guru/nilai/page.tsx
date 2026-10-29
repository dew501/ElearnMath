'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { JENIS, type JenisPengerjaan } from '@/lib/pengerjaan';
import { kunciNilai, muatRekap, rataSiswa, type Rekap } from '@/lib/rekap';
import { useProfil } from '@/lib/use-profil';
import { BarChart3, FileSpreadsheet, Inbox, AlertTriangle } from 'lucide-react';

const JENIS_URUT: JenisPengerjaan[] = ['lkpd', 'latihan', 'evaluasi'];

export default function RekapNilaiPage() {
  const supabase = createClient();
  const profil = useProfil();
  const kelasSaya = useMemo(() => profil?.kelas.map((k) => k.nama) ?? [], [profil]);
  const [rekap, setRekap] = useState<Rekap | null>(null);
  const [kelas, setKelas] = useState('semua');
  const [mengekspor, setMengekspor] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    muatRekap(supabase).then(setRekap);
  }, [supabase]);
  useEffect(() => {
    if (kelasSaya.length) setKelas((k) => (k === 'semua' ? kelasSaya[0] : k));
  }, [kelasSaya]);

  const daftarKelas = useMemo(() => Array.from(new Set(rekap?.siswa.map((s) => s.kelas) ?? [])).sort(), [rekap]);
  const siswa = useMemo(() => (rekap ? rekap.siswa.filter((s) => kelas === 'semua' || s.kelas === kelas) : []), [rekap, kelas]);

  const statistik = useMemo(() => {
    if (!rekap) return null;
    return JENIS_URUT.map((j) => {
      const nilai: number[] = [];
      let menunggu = 0;
      siswa.forEach((s) =>
        rekap.materi.forEach((m) => {
          const n = rekap.nilai.get(kunciNilai(s.id, m.id, j));
          if (n?.final && n.skor !== null) nilai.push(Number(n.skor));
          else if (n) menunggu++;
        })
      );
      return { j, rata: nilai.length ? Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 10) / 10 : null, menunggu, n: nilai.length };
    });
  }, [rekap, siswa]);

  const ekspor = async () => {
    if (!rekap) return;
    setMengekspor(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'elearnMath';
      wb.created = new Date();
      const ws = wb.addWorksheet('Rekap Nilai', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
      const kolomNilai = rekap.materi.flatMap((m) => JENIS_URUT.map((j) => ({ m, j })));
      ws.addRow(['Nama', 'NIS', 'Kelas', ...kolomNilai.map(({ m, j }) => `Bab ${m.bab}`), 'Rata-rata']);
      ws.addRow(['', '', '', ...kolomNilai.map(({ j }) => JENIS[j].singkat), '']);
      siswa.forEach((s) => {
        ws.addRow([
          s.nama,
          s.nomor_induk ?? '',
          s.kelas,
          ...kolomNilai.map(({ m, j }) => {
            const n = rekap.nilai.get(kunciNilai(s.id, m.id, j));
            return n?.final ? Number(n.skor) : n ? 'menunggu' : '';
          }),
          rataSiswa(rekap, s.id) ?? '',
        ]);
      });
      [1, 2].forEach((r) => {
        const row = ws.getRow(r);
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.alignment = { horizontal: 'center', vertical: 'middle' };
        row.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r === 1 ? 'FF1B4E80' : 'FF2E7BC4' } }));
      });
      ws.getColumn(1).width = 26;
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 9;
      for (let i = 4; i <= kolomNilai.length + 4; i++) ws.getColumn(i).width = 10;

      const det = wb.addWorksheet('Detail & Catatan');
      det.addRow(['Nama', 'Kelas', 'Bab', 'Judul Bab', 'Jenis', 'Nilai', 'Status', 'Catatan guru', 'Dikumpulkan']);
      det.getRow(1).font = { bold: true };
      siswa.forEach((s) =>
        rekap.materi.forEach((m) =>
          JENIS_URUT.forEach((j) => {
            const n = rekap.nilai.get(kunciNilai(s.id, m.id, j));
            if (!n) return;
            det.addRow([s.nama, s.kelas, m.bab, m.judul, JENIS[j].singkat, n.final ? Number(n.skor) : null, n.final ? 'Dinilai' : n.ulang ? 'Boleh diulang' : 'Menunggu koreksi', n.feedback ?? '', n.waktu ? new Date(n.waktu) : null]);
          })
        )
      );
      [26, 9, 6, 34, 10, 8, 18, 50, 20].forEach((w, i) => (det.getColumn(i + 1).width = w));
      det.getColumn(9).numFmt = 'dd/mm/yyyy hh:mm';

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekap-nilai-${kelas === 'semua' ? 'semua-kelas' : kelas}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setToast({ id: Date.now(), tone: 'success', text: 'File Excel rekap nilai diunduh.' });
    } catch {
      setToast({ id: Date.now(), tone: 'error', text: 'Ekspor Excel gagal. Coba lagi.' });
    } finally {
      setMengekspor(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Rekap Nilai" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil ? 'guru' : null} />
      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1200px] w-full mx-auto">
        <div className="hero-navy p-6 sm:p-7 mb-6 anim-rise">
          <div className="relative z-10 flex items-start sm:items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-xs font-bold text-[#A7F3D0] mb-3">
                Buku Nilai Digital · Siap Ekspor Excel
              </div>
              <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-[-0.02em] flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-white/14 border border-white/25 flex items-center justify-center text-[#FFCA80] shadow-inner shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </span>
                Rekap Nilai Siswa
              </h1>
              <p className="text-xs sm:text-[13px] text-[#C8E1FA] mt-1.5">Nilai akhir yang sudah divalidasi per bab. &ldquo;Menunggu&rdquo; berarti sudah dikumpulkan tetapi belum dinilai.</p>
            </div>
            <div className="flex items-center gap-2 relative z-10">
              <select
                value={kelas}
                onChange={(e) => setKelas(e.target.value)}
                aria-label="Pilih kelas"
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-white bg-white/14 hover:bg-white/20 border border-white/25 backdrop-blur-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FFB454]/70 [&>option]:text-[#0E2A48] [&>option]:bg-white"
              >
                <option value="semua">Semua kelas</option>
                {daftarKelas.map((k) => <option key={k} value={k}>Kelas {k}{kelasSaya.includes(k) ? ' (saya)' : ''}</option>)}
              </select>
              <button type="button" onClick={ekspor} disabled={!rekap || mengekspor || !siswa.length} className="btn-emerald inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">
                {mengekspor ? <Spinner /> : <FileSpreadsheet className="w-4 h-4" />} Ekspor Excel
              </button>
            </div>
          </div>
        </div>

        {rekap?.galat && <div role="alert" className="mb-4 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {rekap.galat}</div>}

        {statistik && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
            {statistik.map((s, idx) => {
              return (
                <div key={s.j} className="bento-stat p-4 sm:p-5 anim-rise" style={{ ['--i' as string]: idx }}>
                  <div className="text-xs font-extrabold text-[#5A6B82]">{JENIS[s.j].judul}</div>
                  <div className="text-3xl font-extrabold text-[#0E2A48] tabular mt-1.5 leading-none">{s.rata ?? '–'}</div>
                  <div className="text-xs font-medium text-[#5A6B82] mt-2">rata-rata dari <strong className="tabular text-[#0E2A48]">{s.n}</strong> nilai{s.menunggu ? <span className="text-[#B45309] font-bold"> · {s.menunggu} menunggu</span> : ''}</div>
                </div>
              );
            })}
          </div>
        )}

        {!rekap ? (
          <Skeleton className="h-72 rounded-3xl" />
        ) : siswa.length === 0 || rekap.materi.length === 0 ? (
          <div className="glass-card p-10 text-center"><Inbox className="w-12 h-12 text-[#9CC5EC] mx-auto mb-3" /><p className="text-sm font-bold text-[#0E2A48]">{rekap.materi.length ? 'Belum ada siswa di kelas ini.' : 'Belum ada materi terbit.'}</p></div>
        ) : (
          <div className="glass-card overflow-hidden anim-rise">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#0E2A48] text-white text-xs">
                    <th rowSpan={2} className="sticky left-0 z-10 bg-[#0E2A48] text-left px-4 py-2.5 min-w-[190px] font-bold">Siswa</th>
                    {rekap.materi.map((m) => <th key={m.id} colSpan={3} className="px-2 py-2.5 border-l border-white/15 font-bold" title={m.judul}>Bab {m.bab}</th>)}
                    <th rowSpan={2} className="px-3.5 py-2.5 border-l border-white/15 font-bold">Rata-rata</th>
                  </tr>
                  <tr className="bg-[#1C548E] text-white text-[11px]">
                    {rekap.materi.map((m) => JENIS_URUT.map((j, i) => <th key={m.id + j} className={`px-2.5 py-1.5 font-bold ${i === 0 ? 'border-l border-white/15' : ''}`}>{JENIS[j].singkat}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {siswa.map((s) => (
                    <tr key={s.id} className="group border-t border-[#F1F5F9] hover:bg-[#F8FBFF] transition-colors duration-150">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-[#F8FBFF] transition-colors duration-150 px-4 py-2.5">
                        <span className="block font-bold text-[#1F2A37] whitespace-nowrap">{s.nama}</span>
                        <span className="block text-[11px] text-[#94A3B8]">Kelas {s.kelas}{s.nomor_induk ? ` · ${s.nomor_induk}` : ''}</span>
                      </td>
                      {rekap.materi.map((m) =>
                        JENIS_URUT.map((j, i) => {
                          const n = rekap.nilai.get(kunciNilai(s.id, m.id, j));
                          return (
                            <td key={m.id + j} className={`px-2 py-2.5 text-center tabular ${i === 0 ? 'border-l border-[#E6EEF7]' : ''}`} title={n?.feedback ?? undefined}>
                              {!n ? (
                                <span className="text-[#CBD5E1]">–</span>
                              ) : n.final ? (
                                <span className={`font-extrabold ${Number(n.skor) >= 75 ? 'text-[#15885A]' : Number(n.skor) >= 60 ? 'text-[#B45309]' : 'text-[#C2412E]'}`}>{n.skor}</span>
                              ) : (
                                <span className="text-[11px] font-bold text-[#B45309] bg-[#FFF1DD] px-1.5 py-0.5 rounded-full">{n.ulang ? 'ulang' : 'menunggu'}</span>
                              )}
                            </td>
                          );
                        })
                      )}
                      <td className="px-3 py-2.5 text-center font-extrabold text-[#1B4E80] tabular border-l border-[#E6EEF7]">{rataSiswa(rekap, s.id) ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
