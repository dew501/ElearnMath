// Kartu pemakaian penyimpanan Supabase di Ringkasan admin (dirender di server, data dari ringkasan_penyimpanan()).
import React from 'react';
import { formatUkuranByte } from '@/lib/lampiran/tipe';
import { AlertTriangle, Database, FileImage, FileText, HardDrive, Image as ImageIcon, Info, Paperclip } from 'lucide-react';

export interface RingkasanPenyimpanan {
  bucket: { id: string; publik: boolean; jumlah: number; byte: number }[];
  database_byte: number;
  diukur_pada: string;
}

const INFO_BUCKET: Record<string, { label: string; ket: string; ikon: React.ElementType }> = {
  materi: { label: 'Materi', ket: 'PDF & gambar materi dari guru', ikon: FileText },
  'jawaban-essay': { label: 'Lampiran jawaban siswa', ket: 'Foto kamera & berkas jawaban uraian', ikon: Paperclip },
  'gambar-soal': { label: 'Gambar soal', ket: 'Gambar pertanyaan & opsi dari guru', ikon: ImageIcon },
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Seperti formatUkuranByte, tetapi angka >= 1 GB ditulis dalam GB. */
function formatBesar(byte: number): string {
  return byte >= GB ? `${(byte / GB).toFixed(2).replace('.', ',')} GB` : formatUkuranByte(byte);
}

/** "1 GB" / "500 MB" untuk angka kuota dalam MB. */
function formatKuota(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1).replace('.', ',')} GB`;
  }
  return `${mb} MB`;
}

function warnaPersen(p: number) {
  if (p >= 80) return { bar: 'bg-[#E3543F]', teks: 'text-[#C2412E]', lencana: 'bg-[#FDEAE7] text-[#C2412E] border-[#FECACA]' };
  if (p >= 60) return { bar: 'bg-[#F0932B]', teks: 'text-[#B45309]', lencana: 'bg-[#FFF1DD] text-[#B45309] border-[#FBD38D]' };
  return { bar: 'bg-[#22B573]', teks: 'text-[#15885A]', lencana: 'bg-[#E4F8EE] text-[#15885A] border-[#BBF7D0]' };
}

/** "0,2%" untuk angka kecil, "83%" untuk angka >= 10. */
const fmtPersen = (p: number) => `${p === 0 ? 0 : p < 10 ? p.toFixed(1).replace('.', ',') : Math.round(p)}%`;

function Bar({ persen, kelas, label }: { persen: number; kelas: string; label: string }) {
  const lebar = Math.min(100, Math.max(persen > 0 ? 1 : 0, persen));
  return (
    <div className="h-2.5 rounded-full bg-[#E6EEF7] overflow-hidden" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(persen))} aria-valuetext={`${fmtPersen(persen)} terpakai`}>
      <div className={`h-full rounded-full ${kelas}`} style={{ width: `${lebar}%` }} />
    </div>
  );
}

export function KartuPenyimpanan({
  data,
  galat,
  kuotaStorageMb,
  kuotaDatabaseMb,
  urutan = 11,
}: {
  data: RingkasanPenyimpanan | null;
  galat: { code?: string; message?: string } | null;
  kuotaStorageMb: number;
  kuotaDatabaseMb: number;
  urutan?: number;
}) {
  const kepala = (
    <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-[#E3EFFC] flex-wrap">
      <h2 className="text-sm font-extrabold text-[#113355] flex items-center gap-2"><HardDrive className="w-4 h-4 text-[#2E7BC4]" /> Penyimpanan</h2>
      <span className="text-xs text-[#66748C]">Dihitung langsung dari Supabase setiap halaman dibuka</span>
    </div>
  );

  if (!data) {
    const belumMigrasi = galat?.code === 'PGRST202' || /ringkasan_penyimpanan/i.test(galat?.message ?? '');
    return (
      <section className="glass-card p-6 lg:col-span-2 anim-rise" style={{ ['--i' as string]: urutan }}>
        {kepala}
        <p className="text-sm text-[#66748C] flex items-start gap-2">
          <Info className="w-4 h-4 text-[#2E7BC4] shrink-0 mt-0.5" />
          {belumMigrasi
            ? 'Jalankan migrasi database 20261103_ringkasan_penyimpanan.sql agar pemakaian penyimpanan tampil di sini.'
            : 'Pemakaian penyimpanan gagal dimuat. Muat ulang halaman ini.'}
        </p>
      </section>
    );
  }

  const totalByte = data.bucket.reduce((s, b) => s + Number(b.byte || 0), 0);
  const totalBerkas = data.bucket.reduce((s, b) => s + Number(b.jumlah || 0), 0);
  const kuotaByte = kuotaStorageMb * MB;
  const persen = kuotaByte ? (totalByte / kuotaByte) * 100 : 0;
  const sisa = Math.max(0, kuotaByte - totalByte);
  const w = warnaPersen(persen);
  const dbByte = Number(data.database_byte || 0);
  const persenDb = kuotaDatabaseMb ? (dbByte / (kuotaDatabaseMb * MB)) * 100 : 0;
  const wDb = warnaPersen(persenDb);

  return (
    <section className="glass-card p-6 lg:col-span-2 anim-rise" style={{ ['--i' as string]: urutan }} aria-label="Pemakaian penyimpanan">
      {kepala}

      {(persen >= 80 || persenDb >= 80) && (
        <div role="alert" className="mb-4 p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {persen >= 80 ? `Penyimpanan berkas sudah ${fmtPersen(persen)} terpakai. ` : ''}
            {persenDb >= 80 ? `Database sudah ${fmtPersen(persenDb)} terpakai. ` : ''}
            Hapus berkas/data yang tidak dipakai atau naikkan paket Supabase sebelum penuh, karena unggahan baru bisa gagal.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-6">
        <div>
          <div className="flex items-end justify-between gap-3 mb-2 flex-wrap">
            <div>
              <p className="text-xs font-bold text-[#5B6B82] flex items-center gap-1.5"><FileImage className="w-3.5 h-3.5" /> Berkas (Supabase Storage)</p>
              <p className="mt-1 text-[#113355]">
                <span className="text-2xl font-extrabold tabular">{formatBesar(totalByte)}</span>
                <span className="text-sm font-semibold text-[#66748C]"> dari {formatKuota(kuotaStorageMb)}</span>
              </p>
            </div>
            <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border tabular ${w.lencana}`}>{fmtPersen(persen)} terpakai</span>
          </div>
          <Bar persen={persen} kelas={w.bar} label="Pemakaian penyimpanan berkas" />
          <p className="text-xs text-[#66748C] mt-2 tabular">
            Sisa <strong className={w.teks}>{formatBesar(sisa)}</strong> · {totalBerkas.toLocaleString('id-ID')} berkas
          </p>

          <ul className="mt-4 space-y-2.5">
            {data.bucket.map((b) => {
              const info = INFO_BUCKET[b.id] ?? { label: b.id, ket: b.publik ? 'Bucket publik' : 'Bucket privat', ikon: FileImage };
              const porsi = totalByte ? (Number(b.byte) / totalByte) * 100 : 0;
              return (
                <li key={b.id} className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[#EAF6FF] text-[#2E7BC4] flex items-center justify-center shrink-0"><info.ikon className="w-4 h-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#1F2A37] truncate">{info.label}</span>
                      <span className="font-extrabold text-[#113355] tabular shrink-0">{formatBesar(Number(b.byte))}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 text-[11px] text-[#66748C] mt-0.5">
                      <span className="truncate">{info.ket}</span>
                      <span className="tabular shrink-0">{Number(b.jumlah).toLocaleString('id-ID')} berkas</span>
                    </span>
                    <span className="block h-1 rounded-full bg-[#EEF4FA] mt-1 overflow-hidden" aria-hidden="true">
                      <span className="block h-full rounded-full bg-[#5FA8E8]" style={{ width: `${Math.min(100, porsi)}%` }} />
                    </span>
                  </span>
                </li>
              );
            })}
            {data.bucket.length === 0 && <li className="text-xs text-[#66748C]">Belum ada bucket penyimpanan.</li>}
          </ul>
        </div>

        <div className="lg:border-l lg:border-[#E3EFFC] lg:pl-6">
          <div className="flex items-end justify-between gap-3 mb-2 flex-wrap">
            <div>
              <p className="text-xs font-bold text-[#5B6B82] flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Database</p>
              <p className="mt-1 text-[#113355]">
                <span className="text-2xl font-extrabold tabular">{formatBesar(dbByte)}</span>
                <span className="text-sm font-semibold text-[#66748C]"> dari {formatKuota(kuotaDatabaseMb)}</span>
              </p>
            </div>
            <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border tabular ${wDb.lencana}`}>{fmtPersen(persenDb)}</span>
          </div>
          <Bar persen={persenDb} kelas={wDb.bar} label="Pemakaian database" />
          <p className="text-xs text-[#66748C] mt-2 leading-relaxed">Data teks: akun, materi, soal, jawaban, nilai, dan log. Kuotanya terpisah dari penyimpanan berkas.</p>
        </div>
      </div>

      <p className="mt-5 pt-3 border-t border-[#E3EFFC] text-[11px] text-[#94A3B8] leading-relaxed">
        Kuota mengikuti paket Supabase dan diatur lewat <code className="font-mono">KUOTA_STORAGE_MB</code> &amp; <code className="font-mono">KUOTA_DATABASE_MB</code> di environment server
        (bawaan {formatKuota(1024)} &amp; {formatKuota(500)}, paket Free). Angka tagihan resmi di Supabase &gt; Usage bisa sedikit berbeda karena dihitung rata-rata per periode.
      </p>
    </section>
  );
}
