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
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80] flex items-center gap-2"><BarChart3 className="w-6 h-6 text-[#2E7BC4]" /> Rekap Nilai</h1>
            <p className="text-xs text-[#66748C] mt-1">Nilai akhir yang sudah divalidasi per bab. &ldquo;Menunggu&rdquo; berarti sudah dikumpulkan tetapi belum dinilai.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Pilih kelas" className="px-3 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80]">
              <option value="semua">Semua kelas</option>
              {daftarKelas.map((k) => <option key={k} value={k}>Kelas {k}{kelasSaya.includes(k) ? ' (saya)' : ''}</option>)}
            </select>
            <button type="button" onClick={ekspor} disabled={!rekap || mengekspor || !siswa.length} className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#15885A] hover:bg-[#0F6E48] text-white text-sm font-bold shadow-[0_6px_16px_rgba(21,136,90,0.3)] disabled:opacity-50">
              {mengekspor ? <Spinner /> : <FileSpreadsheet className="w-4 h-4" />} Ekspor Excel
            </button>
          </div>
        </div>

        {rekap?.galat && <div role="alert" className="mb-4 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {rekap.galat}</div>}

        {statistik && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {statistik.map((s) => (
              <div key={s.j} className="glass-card p-4">
                <div className="text-[11px] font-bold text-[#66748C] uppercase tracking-wider">{JENIS[s.j].singkat}</div>
                <div className="text-2xl font-extrabold text-[#1B4E80] tabular mt-1">{s.rata ?? '–'}</div>
                <div className="text-[11px] text-[#66748C]">rata-rata dari {s.n} nilai{s.menunggu ? <span className="text-[#B45309] font-semibold"> · {s.menunggu} menunggu</span> : ''}</div>
              </div>
            ))}
          </div>
        )}

        {!rekap ? (
          <Skeleton className="h-72 rounded-3xl" />
        ) : siswa.length === 0 || rekap.materi.length === 0 ? (
          <div className="glass-card p-10 text-center"><Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" /><p className="text-sm font-semibold text-[#1B4E80]">{rekap.materi.length ? 'Belum ada siswa di kelas ini.' : 'Belum ada materi terbit.'}</p></div>
        ) : (
          <div className="glass-card overflow-hidden anim-rise">
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr className="bg-[#1B4E80] text-white text-xs">
                    <th rowSpan={2} className="sticky left-0 z-10 bg-[#1B4E80] text-left px-4 py-2 min-w-[180px]">Siswa</th>
                    {rekap.materi.map((m) => <th key={m.id} colSpan={3} className="px-2 py-2 border-l border-white/20" title={m.judul}>Bab {m.bab}</th>)}
                    <th rowSpan={2} className="px-3 py-2 border-l border-white/20">Rata-rata</th>
                  </tr>
                  <tr className="bg-[#2E7BC4] text-white text-[10px]">
                    {rekap.materi.map((m) => JENIS_URUT.map((j, i) => <th key={m.id + j} className={`px-2 py-1.5 font-bold ${i === 0 ? 'border-l border-white/20' : ''}`}>{JENIS[j].singkat}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {siswa.map((s) => (
                    <tr key={s.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FBFF]">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                        <span className="block font-bold text-[#1F2A37] whitespace-nowrap">{s.nama}</span>
                        <span className="block text-[10px] text-[#94A3B8]">Kelas {s.kelas}{s.nomor_induk ? ` · ${s.nomor_induk}` : ''}</span>
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
                                <span className="text-[10px] font-bold text-[#B45309] bg-[#FFF1DD] px-1.5 py-0.5 rounded-full">{n.ulang ? 'ulang' : 'menunggu'}</span>
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
