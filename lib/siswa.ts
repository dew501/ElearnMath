import type { SupabaseClient } from '@supabase/supabase-js';
import type { JenisPengerjaan } from '@/lib/pengerjaan';

export interface MateriSiswa {
  id: string;
  chapter_number: number | null;
  title: string | null;
  subbab_json: unknown;
  bagian_json: unknown;
}
export interface Kiriman {
  score: number | null;
  feedback: string | null;
  /** Sudah dinilai/divalidasi guru */
  final: boolean;
  ulang: boolean;
  waktu: string | null;
}
export interface DataSiswa {
  nama: string;
  kelas: { id: string; nama: string } | null;
  guru: string[];
  materi: MateriSiswa[];
  galatMateri: boolean;
  kiriman: Record<JenisPengerjaan, Map<string, Kiriman>>;
}

/** Profil, kelas, materi yang tersedia, dan semua pengumpulan milik siswa yang login. */
export async function muatDataSiswa(supabase: SupabaseClient, uid: string, email?: string | null): Promise<DataSiswa> {
  const [p, ang, m, l, t, e] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', uid).maybeSingle(),
    supabase.from('kelas_anggota').select('kelas_id, kelas:kelas_id(id, nama)').eq('user_id', uid).eq('peran', 'siswa').maybeSingle(),
    supabase.from('materi').select('id, chapter_number, title, subbab_json, bagian_json').order('chapter_number', { ascending: true }),
    supabase.from('jawaban_lkpd').select('id_materi, status, score, feedback, allow_retake, created_at').eq('id_siswa', uid),
    supabase.from('pengerjaan_latihan').select('id_materi, score, feedback, completed_at').eq('id_siswa', uid),
    supabase.from('pengerjaan_evaluasi').select('id_materi, score, feedback, dinilai_at, completed_at').eq('id_siswa', uid),
  ]);
  const kelas = ((ang.data as any)?.kelas as { id: string; nama: string } | null) ?? null;
  let guru: string[] = [];
  if (kelas) {
    const { data } = await supabase.from('kelas_anggota').select('user:user_id(full_name)').eq('kelas_id', kelas.id).eq('peran', 'guru');
    guru = ((data ?? []) as any[]).map((g) => g.user?.full_name).filter(Boolean);
  }
  const peta = (rows: any[] | null, f: (r: any) => Kiriman) => new Map((rows ?? []).map((r) => [r.id_materi as string, f(r)]));
  return {
    nama: p.data?.full_name || email?.split('@')[0] || 'Siswa',
    kelas,
    guru,
    materi: (m.data ?? []) as MateriSiswa[],
    galatMateri: !!m.error,
    kiriman: {
      lkpd: peta(l.data, (r) => ({ score: r.score, feedback: r.feedback, final: r.status === 'graded' && !r.allow_retake, ulang: !!r.allow_retake, waktu: r.created_at })),
      latihan: peta(t.data, (r) => ({ score: r.score, feedback: r.feedback || null, final: r.feedback !== null, ulang: false, waktu: r.completed_at })),
      evaluasi: peta(e.data, (r) => ({ score: r.score, feedback: r.feedback, final: r.dinilai_at !== null, ulang: false, waktu: r.completed_at })),
    },
  };
}

/** Evaluasi lama (tanpa id_materi) dianggap berlaku untuk semua bab. */
export function evaluasiUntuk(d: DataSiswa, idMateri: string): Kiriman | undefined {
  return d.kiriman.evaluasi.get(idMateri) ?? d.kiriman.evaluasi.get(null as unknown as string);
}

export function jumlahSubbab(m: MateriSiswa): number {
  if (Array.isArray(m.bagian_json)) return m.bagian_json.length;
  return Array.isArray(m.subbab_json) ? m.subbab_json.length : 0;
}

/** Langkah berikutnya untuk satu bab: materi → LKPD → latihan → evaluasi → tinjau. */
export function langkahBerikut(d: DataSiswa, m: MateriSiswa): { teks: string; href: string; selesai: boolean } {
  const l = d.kiriman.lkpd.get(m.id);
  const t = d.kiriman.latihan.get(m.id);
  const ev = evaluasiUntuk(d, m.id);
  if (!l) return { teks: 'Mulai Belajar', href: `/siswa/materi/${m.id}`, selesai: false };
  if (l.ulang) return { teks: 'Kerjakan Ulang LKPD', href: `/siswa/pengerjaan/lkpd/${m.id}`, selesai: false };
  if (!t) return { teks: 'Lanjut ke Latihan', href: `/siswa/pengerjaan/latihan/${m.id}`, selesai: false };
  if (!ev) return { teks: 'Lanjut ke Evaluasi', href: `/siswa/pengerjaan/evaluasi/${m.id}`, selesai: false };
  return { teks: 'Lihat Hasil', href: `/siswa/materi/${m.id}`, selesai: true };
}
