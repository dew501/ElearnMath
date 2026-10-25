import { bobotSoal, teksOpsi, type Soal } from '@/lib/pengerjaan';
import type { SoalKoreksi } from './tipe';

/** Ubah soal bank (dengan kunci/rubrik) menjadi masukan mesin koreksi, mengikuti urutan tampilan. */
export function keSoalKoreksi(soal: Soal[]): SoalKoreksi[] {
  return soal.map((q, i) => ({
    id: q.id,
    nomor: q.urutan || i + 1,
    tipe: q.tipe === 'pg' ? 'pg' : 'essay',
    pertanyaan: q.pertanyaan,
    bobot: bobotSoal(q),
    kunci_jawaban: q.kunci_jawaban ?? null,
    opsi: q.tipe === 'pg' ? { A: teksOpsi(q, 'A'), B: teksOpsi(q, 'B'), C: teksOpsi(q, 'C'), D: teksOpsi(q, 'D') } : undefined,
    jawaban_ideal: q.jawaban_ideal ?? null,
    rubrik: Array.isArray(q.rubrik) ? q.rubrik : null,
  }));
}
