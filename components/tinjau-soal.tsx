import React from 'react';
import { OPSI, teksOpsi, type Soal } from '@/lib/pengerjaan';
import { CheckCircle2, XCircle, MinusCircle, Clock, Lightbulb, Check, Info } from 'lucide-react';

/** Hasil per soal dari fungsi database tinjau_pengerjaan (kunci & pembahasan hanya bila sudah dibuka). */
export interface HasilTinjau {
  benar: boolean | null;
  kunci: string | null;
  pembahasan: string | null;
}

type Status = 'benar' | 'salah' | 'kosong' | 'uraian' | 'tanpa-kunci';

export function statusSoal(q: Soal, jawaban: string | undefined, h: HasilTinjau | undefined): Status {
  if (!(jawaban ?? '').trim()) return 'kosong';
  if (q.tipe !== 'pg') return 'uraian';
  if (h?.benar === true) return 'benar';
  if (h?.benar === false) return 'salah';
  return 'tanpa-kunci';
}

const GAYA_NOMOR: Record<Status, string> = {
  benar: 'bg-[#E4F8EE] text-[#15885A] border-[#BBF7D0]',
  salah: 'bg-[#FDEAE7] text-[#C2412E] border-[#FECACA]',
  kosong: 'bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0]',
  uraian: 'bg-[#EAF6FF] text-[#2E7BC4] border-[#BFDBFE]',
  'tanpa-kunci': 'bg-[#EAF6FF] text-[#2E7BC4] border-[#BFDBFE]',
};

const LABEL_STATUS: Record<Status, string> = {
  benar: 'benar',
  salah: 'salah',
  kosong: 'tidak dijawab',
  uraian: 'uraian',
  'tanpa-kunci': 'pilihan ganda',
};

/** Ringkasan hasil: jumlah benar/salah + peta nomor soal yang bisa diklik. */
export function RingkasanTinjau({
  soal,
  jawaban,
  hasil,
  dinilai,
  gagal,
}: {
  soal: Soal[];
  jawaban: Record<string, string>;
  hasil: Record<string, HasilTinjau>;
  dinilai: boolean;
  gagal: boolean;
}) {
  const status = soal.map((q) => statusSoal(q, jawaban[q.id], hasil[q.id]));
  const hitung = (s: Status) => status.filter((x) => x === s).length;
  const pg = soal.filter((q) => q.tipe === 'pg').length;
  const uraian = soal.length - pg;
  // Catatan hanya perlu bila ada soal PG yang salah tetapi kuncinya tidak dibuka (soal umum)
  const kunciTertutup = dinilai && soal.some((q) => q.tipe === 'pg' && (jawaban[q.id] ?? '').trim() && hasil[q.id]?.benar !== true && !hasil[q.id]?.kunci);

  return (
    <div className="glass-card p-6 md:p-8 anim-rise" style={{ ['--i' as string]: 1 }}>
      <h2 className="text-base font-extrabold text-[#1B4E80] mb-1">Hasil per Soal</h2>
      <p className="text-xs text-[#66748C] mb-4">Klik nomor soal untuk langsung melihat pembahasannya.</p>

      {!gagal && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs font-bold">
          {pg > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E4F8EE] text-[#15885A]"><CheckCircle2 className="w-3.5 h-3.5" /> {hitung('benar')} benar</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FDEAE7] text-[#C2412E]"><XCircle className="w-3.5 h-3.5" /> {hitung('salah')} salah</span>
            </>
          )}
          {uraian > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EAF6FF] text-[#2E7BC4]">
              {dinilai ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />} {uraian} uraian {dinilai ? 'sudah dinilai guru' : 'menunggu koreksi guru'}
            </span>
          )}
          {hitung('kosong') > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F1F5F9] text-[#66748C]"><MinusCircle className="w-3.5 h-3.5" /> {hitung('kosong')} tidak dijawab</span>
          )}
        </div>
      )}

      <nav aria-label="Peta nomor soal" className="flex flex-wrap gap-2">
        {soal.map((q, i) => {
          const s = gagal ? 'tanpa-kunci' : status[i];
          return (
            <a
              key={q.id}
              href={`#tinjau-${q.id}`}
              title={`Soal ${i + 1}: ${LABEL_STATUS[s]}`}
              className={`btn-press w-9 h-9 rounded-xl border text-xs font-extrabold flex items-center justify-center tabular transition-transform hover:-translate-y-px ${GAYA_NOMOR[s]}`}
            >
              {i + 1}
              <span className="sr-only"> ({LABEL_STATUS[s]})</span>
            </a>
          );
        })}
      </nav>

      {gagal ? (
        <p className="mt-4 text-xs text-[#92400E] flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px" /> Hasil benar/salah belum bisa dimuat. Muat ulang halaman ini beberapa saat lagi.</p>
      ) : !dinilai ? (
        <p className="mt-4 text-xs text-[#66748C] flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px text-[#2E7BC4]" /> Kunci jawaban dan contoh jawaban uraian akan muncul setelah guru menilai lembar ini.</p>
      ) : kunciTertutup ? (
        <p className="mt-4 text-xs text-[#66748C] flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px text-[#2E7BC4]" /> Kunci untuk soal umum tidak ditampilkan karena soal yang sama juga dipakai di bab lain.</p>
      ) : null}
    </div>
  );
}

const PIL_STATUS: Record<Status, { teks: string; kelas: string; ikon: React.ElementType } | null> = {
  benar: { teks: 'Benar', kelas: 'bg-[#E4F8EE] text-[#15885A]', ikon: CheckCircle2 },
  salah: { teks: 'Salah', kelas: 'bg-[#FDEAE7] text-[#C2412E]', ikon: XCircle },
  kosong: { teks: 'Tidak dijawab', kelas: 'bg-[#F1F5F9] text-[#66748C]', ikon: MinusCircle },
  uraian: null,
  'tanpa-kunci': null,
};

/** Satu soal pada mode tinjau: jawaban siswa, benar/salah, kunci, dan contoh jawaban bila sudah dibuka. */
export function KartuTinjau({
  q,
  nomor,
  jawaban,
  hasil,
  dinilai,
}: {
  q: Soal;
  nomor: number;
  jawaban: string | undefined;
  hasil: HasilTinjau | undefined;
  dinilai: boolean;
}) {
  const status = statusSoal(q, jawaban, hasil);
  const pil = PIL_STATUS[status] ?? (q.tipe === 'pg' ? null : dinilai ? { teks: 'Dinilai guru', kelas: 'bg-[#EAF6FF] text-[#2E7BC4]', ikon: CheckCircle2 } : { teks: 'Menunggu koreksi guru', kelas: 'bg-[#FFF1DD] text-[#B45309]', ikon: Clock });
  const pilihan = (jawaban ?? '').trim().toUpperCase();
  const kunci = hasil?.kunci?.toUpperCase() ?? null;

  return (
    <article id={`tinjau-${q.id}`} className="glass-card p-6 md:p-8 anim-rise scroll-mt-32" style={{ ['--i' as string]: nomor + 1 }} aria-label={`Soal nomor ${nomor}`}>
      <div className="flex justify-between items-center gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-9 h-9 rounded-xl border flex items-center justify-center font-extrabold text-sm tabular shrink-0 ${GAYA_NOMOR[status]}`}>{nomor}</span>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EAF6FF] text-[#1B4E80] truncate">
            {q.tipe === 'pg' ? 'Pilihan Ganda' : 'Uraian / Essay'} &bull; Bobot {q.bobot || 50}
          </span>
        </div>
        {pil && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${pil.kelas}`}>
            <pil.ikon className="w-3.5 h-3.5" /> {pil.teks}
          </span>
        )}
      </div>

      <div className="text-sm md:text-[15px] font-semibold text-[#1F2A37] mb-4 leading-relaxed">{q.pertanyaan}</div>

      {q.tipe === 'pg' ? (
        <ul className="grid gap-2" aria-label={`Pilihan jawaban soal ${nomor}`}>
          {OPSI.map((h) => {
            const teks = teksOpsi(q, h);
            if (!teks) return null;
            const dipilih = pilihan === h;
            const kunciIni = kunci === h;
            const gaya = dipilih
              ? status === 'benar'
                ? 'bg-[#E4F8EE] border-[#5BD69B] text-[#14532D]'
                : status === 'salah'
                ? 'bg-[#FDEAE7] border-[#F4A79A] text-[#7F1D1D]'
                : 'bg-[#EAF6FF] border-[#2E7BC4] text-[#1B4E80]'
              : kunciIni
              ? 'bg-white border-[#5BD69B] border-dashed text-[#14532D]'
              : 'bg-white/70 border-[#E6EEF7] text-[#4B5A70]';
            const gayaHuruf = dipilih
              ? status === 'benar'
                ? 'bg-[#15885A] text-white'
                : status === 'salah'
                ? 'bg-[#C2412E] text-white'
                : 'bg-[#2E7BC4] text-white'
              : kunciIni
              ? 'bg-[#E4F8EE] text-[#15885A]'
              : 'bg-[#F1F5F9] text-[#94A3B8]';
            return (
              <li key={h} className={`flex items-center gap-3 p-3 rounded-xl border-2 text-sm ${gaya} ${dipilih ? 'font-bold' : ''}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0 ${gayaHuruf}`}>{h}</span>
                <span className="flex-1 min-w-0">{teks}</span>
                <span className="flex flex-wrap justify-end gap-1.5 shrink-0">
                  {dipilih && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/80">
                      {status === 'benar' ? <CheckCircle2 className="w-3 h-3" /> : status === 'salah' ? <XCircle className="w-3 h-3" /> : <Check className="w-3 h-3" />} Jawaban Anda
                    </span>
                  )}
                  {kunciIni && !dipilih && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#E4F8EE] text-[#15885A]">
                      <CheckCircle2 className="w-3 h-3" /> Kunci jawaban
                    </span>
                  )}
                </span>
              </li>
            );
          })}
          {!pilihan && <li className="text-xs text-[#94A3B8] italic">Soal ini tidak Anda jawab.</li>}
        </ul>
      ) : (
        <div className="space-y-3">
          <div className="text-sm p-3.5 rounded-xl bg-white/90 border border-[#DCEAF7] text-[#1F2A37] whitespace-pre-wrap leading-relaxed">
            <span className="text-[11px] font-bold text-[#66748C] uppercase tracking-wide block mb-1">Jawaban Anda</span>
            {jawaban?.trim() ? jawaban : <span className="italic text-[#94A3B8]">Tidak dijawab</span>}
          </div>
          {hasil?.pembahasan && (
            <div className="text-sm p-3.5 rounded-xl bg-[#F0FBF5] border border-[#BBF7D0] text-[#14532D] whitespace-pre-wrap leading-relaxed">
              <span className="text-[11px] font-bold text-[#15885A] uppercase tracking-wide mb-1 flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> Contoh jawaban dari guru</span>
              {hasil.pembahasan}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
