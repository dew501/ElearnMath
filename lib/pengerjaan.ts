// Data & pesan bersama untuk halaman pengerjaan siswa dan panel koreksi guru.

export type JenisPengerjaan = 'lkpd' | 'latihan' | 'evaluasi';

export const JENIS: Record<JenisPengerjaan, { judul: string; singkat: string }> = {
  lkpd: { judul: 'Lembar Kerja Peserta Didik (LKPD)', singkat: 'LKPD' },
  latihan: { judul: 'Latihan Mandiri Interaktif', singkat: 'Latihan' },
  evaluasi: { judul: 'Evaluasi Akhir Pemahaman Matematika', singkat: 'Evaluasi' },
};

export function isJenis(value: string): value is JenisPengerjaan {
  return value === 'lkpd' || value === 'latihan' || value === 'evaluasi';
}

export interface Soal {
  id: string;
  urutan: number | null;
  tipe: string;
  pertanyaan: string;
  opsi_a?: string | null;
  opsi_b?: string | null;
  opsi_c?: string | null;
  opsi_d?: string | null;
  bobot: number | null;
  kunci_jawaban?: string | null;
  id_materi?: string | null;
  category?: string;
}

/** Kolom soal yang boleh dibaca siswa (tanpa kunci_jawaban). */
export const KOLOM_SOAL_SISWA = 'id, urutan, tipe, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, bobot';

export const OPSI = ['A', 'B', 'C', 'D'] as const;

export function teksOpsi(soal: Soal, huruf: string): string | null {
  const key = `opsi_${huruf.toLowerCase()}` as 'opsi_a' | 'opsi_b' | 'opsi_c' | 'opsi_d';
  return soal[key] ?? null;
}

export const bobotSoal = (soal: Soal) => Number(soal.bobot ?? 50);

/** Ambil peta jawaban dari kolom file_answers_json / answers_json ({ answers: { [idSoal]: jawaban } }). */
export function petaJawaban(json: unknown): Record<string, string> {
  if (!json || typeof json !== 'object') return {};
  const answers = (json as { answers?: unknown }).answers;
  if (!answers || typeof answers !== 'object') return {};
  return Object.fromEntries(Object.entries(answers as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]));
}

/** Terjemahkan error dari fungsi database kumpulkan_pengerjaan / soal_dengan_kunci. */
export function pesanGalat(err: { message?: string; code?: string } | null | undefined): string {
  const msg = err?.message || '';
  const peta: Record<string, string> = {
    SUDAH_DIKUMPULKAN: 'Jawaban untuk tugas ini sudah pernah dikumpulkan. Pengerjaan ulang hanya bisa jika guru mengizinkan.',
    LKPD_BELUM: 'Kumpulkan LKPD materi ini terlebih dahulu sebelum mengerjakan latihan.',
    LATIHAN_BELUM: 'Selesaikan latihan materi ini terlebih dahulu sebelum mengerjakan evaluasi.',
    BELUM_DISETUJUI: 'Akun Anda belum disetujui Admin sekolah, jadi belum bisa mengumpulkan tugas.',
    BUKAN_SISWA: 'Hanya akun siswa yang dapat mengumpulkan tugas.',
    BELUM_LOGIN: 'Sesi Anda berakhir. Silakan masuk kembali.',
    MATERI_TIDAK_ADA: 'Materi untuk tugas ini tidak ditemukan.',
    JENIS_TIDAK_VALID: 'Jenis tugas tidak dikenal.',
    JAWABAN_TIDAK_VALID: 'Format jawaban tidak valid.',
    KHUSUS_GURU: 'Halaman ini khusus guru dan admin.',
    TIPE_TIDAK_VALID: 'Tipe soal harus pilihan ganda atau uraian.',
    PERTANYAAN_KOSONG: 'Teks pertanyaan belum diisi.',
    BOBOT_TIDAK_VALID: 'Bobot soal harus antara 0 sampai 100.',
    OPSI_KURANG: 'Soal pilihan ganda minimal punya opsi A dan B.',
    KUNCI_TIDAK_VALID: 'Pilih kunci jawaban dari opsi yang sudah diisi.',
    SOAL_TIDAK_ADA: 'Soal tidak ditemukan (mungkin sudah dihapus).',
  };
  for (const [kode, pesan] of Object.entries(peta)) {
    if (msg.includes(kode)) return pesan;
  }
  if (err?.code === '23503' || /foreign key/i.test(msg)) {
    return 'Data ini masih dipakai data lain (misalnya sudah ada pengumpulan siswa), jadi tidak bisa dihapus.';
  }
  if (err?.code === '23505' || /duplicate key/i.test(msg)) {
    return 'Data yang sama sudah ada.';
  }
  if (err?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'Akses ditolak: akun Anda tidak punya izin untuk tindakan ini (atau migrasi database belum dijalankan).';
  }
  if (/bucket not found/i.test(msg)) {
    return 'Penyimpanan berkas belum disiapkan: jalankan migrasi database 20261026 terlebih dahulu.';
  }
  if (/payload too large|exceeded the maximum allowed size|too large/i.test(msg)) {
    return 'Ukuran berkas terlalu besar (maksimal 10 MB).';
  }
  if (/mime type|invalid_mime_type/i.test(msg)) {
    return 'Jenis berkas tidak didukung. Gunakan PDF, PNG, JPG, GIF, atau WEBP.';
  }
  if (err?.code === 'PGRST202' || /could not find the function/i.test(msg)) {
    return 'Sistem pengumpulan belum siap: migrasi database belum dijalankan. Hubungi admin.';
  }
  if (/fetch|network/i.test(msg)) {
    return 'Koneksi terputus, data belum terkirim. Periksa internet Anda lalu coba lagi.';
  }
  if (err?.code === 'PGRST301' || err?.code === 'PGRST303' || /jwt expired|invalid jwt|session.*(expired|missing)/i.test(msg)) {
    return 'Sesi Anda sudah berakhir. Muat ulang halaman lalu masuk kembali — jawaban Anda tetap tersimpan sebagai draf di perangkat ini.';
  }
  return msg ? `Terjadi kesalahan: ${msg}` : 'Terjadi kesalahan yang tidak diketahui.';
}

export function formatTanggal(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
