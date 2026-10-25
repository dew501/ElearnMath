import type { SupabaseClient } from '@supabase/supabase-js';
import type { JenisPengerjaan } from '@/lib/pengerjaan';

export interface SiswaRekap {
  id: string;
  nama: string;
  kelas: string;
  nomor_induk: string | null;
  terakhir_aktif: string | null;
}
export interface MateriRekap {
  id: string;
  bab: number;
  judul: string;
}
export interface NilaiRekap {
  skor: number | null;
  /** Sudah dinilai/divalidasi guru (nilai akhir). */
  final: boolean;
  /** Boleh dikerjakan ulang (LKPD). */
  ulang: boolean;
  feedback: string | null;
  waktu: string | null;
}
export interface Rekap {
  siswa: SiswaRekap[];
  materi: MateriRekap[];
  nilai: Map<string, NilaiRekap>;
  galat: string | null;
}

export const kunciNilai = (siswa: string, materi: string | null, jenis: JenisPengerjaan) => `${siswa}|${materi}|${jenis}`;

/** Data rekap: siswa aktif × bab terbit × jenis tugas (dipakai rekap nilai, ekspor, dan pemantauan). */
export async function muatRekap(supabase: SupabaseClient): Promise<Rekap> {
  const [u, m, l, t, e] = await Promise.all([
    supabase.from('users').select('id, full_name, class_name, nomor_induk, terakhir_aktif').eq('role', 'siswa').eq('status_approval', 'APPROVED').order('full_name'),
    supabase.from('materi').select('id, chapter_number, title, terbit').order('chapter_number'),
    supabase.from('jawaban_lkpd').select('id_siswa, id_materi, status, score, feedback, allow_retake, created_at'),
    supabase.from('pengerjaan_latihan').select('id_siswa, id_materi, score, feedback, completed_at'),
    supabase.from('pengerjaan_evaluasi').select('id_siswa, id_materi, score, feedback, dinilai_at, completed_at'),
  ]);
  const nilai = new Map<string, NilaiRekap>();
  (l.data ?? []).forEach((r: any) =>
    nilai.set(kunciNilai(r.id_siswa, r.id_materi, 'lkpd'), { skor: r.score, final: r.status === 'graded' && !r.allow_retake, ulang: !!r.allow_retake, feedback: r.feedback, waktu: r.created_at })
  );
  (t.data ?? []).forEach((r: any) =>
    nilai.set(kunciNilai(r.id_siswa, r.id_materi, 'latihan'), { skor: r.score, final: r.feedback !== null, ulang: false, feedback: r.feedback || null, waktu: r.completed_at })
  );
  (e.data ?? []).forEach((r: any) =>
    nilai.set(kunciNilai(r.id_siswa, r.id_materi, 'evaluasi'), { skor: r.score, final: r.dinilai_at !== null, ulang: false, feedback: r.feedback, waktu: r.completed_at })
  );
  return {
    siswa: ((u.data ?? []) as any[]).map((x) => ({ id: x.id, nama: x.full_name || 'Siswa', kelas: x.class_name || '-', nomor_induk: x.nomor_induk ?? null, terakhir_aktif: x.terakhir_aktif ?? null })),
    materi: ((m.data ?? []) as any[]).filter((x) => x.terbit !== false).map((x) => ({ id: x.id, bab: x.chapter_number ?? 0, judul: x.title ?? '' })),
    nilai,
    galat: u.error?.message || l.error?.message || t.error?.message || e.error?.message || null,
  };
}

/** Rata-rata nilai akhir seorang siswa (hanya nilai yang sudah divalidasi guru). */
export function rataSiswa(r: Rekap, siswa: string): number | null {
  const ada: number[] = [];
  r.materi.forEach((m) =>
    (['lkpd', 'latihan', 'evaluasi'] as JenisPengerjaan[]).forEach((j) => {
      const n = r.nilai.get(kunciNilai(siswa, m.id, j));
      if (n?.final && n.skor !== null) ada.push(Number(n.skor));
    })
  );
  return ada.length ? Math.round((ada.reduce((a, b) => a + b, 0) / ada.length) * 10) / 10 : null;
}
