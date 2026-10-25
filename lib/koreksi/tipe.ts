import type { JenisPengerjaan, KriteriaRubrik } from '@/lib/pengerjaan';

/** Soal yang dikirim ke mesin koreksi (sudah berisi kunci/rubrik; hanya dipakai di sisi guru/server). */
export interface SoalKoreksi {
  id: string;
  nomor: number;
  tipe: 'pg' | 'essay';
  pertanyaan: string;
  bobot: number;
  kunci_jawaban?: string | null;
  opsi?: Record<string, string | null>;
  jawaban_ideal?: string | null;
  rubrik?: KriteriaRubrik[] | null;
}

export interface HasilKriteria {
  label: string;
  ok: boolean;
  poin: number;
}

export interface HasilSoal {
  id_soal: string;
  nomor: number;
  tipe: 'pg' | 'essay';
  skor: number;
  maks: number;
  alasan: string;
  kriteria?: HasilKriteria[];
  /** Mesin tidak punya bahan (tanpa rubrik & jawaban ideal) → guru perlu menilai sendiri. */
  perlu_manual?: boolean;
}

export type Tingkat = 'tinggi' | 'sedang' | 'rendah';

export interface HasilKoreksi {
  versi: 1;
  nilai_100: number;
  skor: number;
  maks: number;
  feedback: string;
  per_soal: HasilSoal[];
  keyakinan: Tingkat;
  indikasi_ai?: { tingkat: Tingkat; alasan: string };
  /** Nilai versi mesin aturan, sebagai pembanding saat sumber utamanya AI. */
  pembanding_aturan?: number;
  catatan_sistem?: string;
}

export interface Respons {
  hasil: HasilKoreksi;
  sumber: 'gemini' | 'aturan';
  model: string | null;
  jenis: JenisPengerjaan;
}
