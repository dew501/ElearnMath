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

/** Satu kriteria rubrik soal uraian (dipakai koreksi AI & mesin aturan). */
export interface KriteriaRubrik {
  jenis: 'angka' | 'kata' | 'panjang';
  label: string;
  /** angka: nilai yang diharapkan; kata: alternatif dipisah "|"; panjang: jumlah kata minimal */
  nilai: string | number;
  toleransi?: number;
  poin: number;
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
  tahap?: string | null;
  jawaban_ideal?: string | null;
  rubrik?: KriteriaRubrik[] | null;
}

/** Kolom soal yang boleh dibaca siswa (tanpa kunci jawaban, jawaban ideal, dan rubrik). */
export const KOLOM_SOAL_SISWA = 'id, urutan, tipe, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, bobot, tahap';

/** Tahapan LKPD konstruktivis (bawaan; guru boleh mengubah judul & instruksinya). */
export interface TahapLkpd {
  kunci: string;
  judul: string;
  instruksi: string;
}
export const TAHAPAN_BAWAAN: TahapLkpd[] = [
  { kunci: 'orientasi', judul: 'Orientasi Masalah', instruksi: 'Baca dan pahami masalah berikut. Tuliskan apa yang diketahui dan apa yang ditanyakan.' },
  { kunci: 'eksplorasi', judul: 'Eksplorasi', instruksi: 'Coba selesaikan masalah dengan caramu sendiri. Amati pola atau hubungan yang kamu temukan.' },
  { kunci: 'konstruksi', judul: 'Membangun Konsep', instruksi: 'Gunakan hasil eksplorasimu untuk menyusun konsep atau rumus. Jelaskan langkah-langkahnya.' },
  { kunci: 'kesimpulan', judul: 'Menyimpulkan', instruksi: 'Tuliskan kesimpulan dari kegiatan ini dengan bahasamu sendiri.' },
  { kunci: 'refleksi', judul: 'Refleksi', instruksi: 'Bagian mana yang sudah kamu pahami, dan bagian mana yang masih membingungkan?' },
];
export function tahapanDari(json: unknown): TahapLkpd[] {
  if (!Array.isArray(json)) return TAHAPAN_BAWAAN;
  const t = json
    .filter((x) => x && typeof x === 'object')
    .map((x: any) => ({ kunci: String(x.kunci ?? '').trim(), judul: String(x.judul ?? '').trim(), instruksi: String(x.instruksi ?? '') }))
    .filter((x) => x.kunci && x.judul);
  return t.length ? t : TAHAPAN_BAWAAN;
}

/**
 * Urutan soal untuk siswa: soal umum dulu, lalu soal khusus bab. Untuk LKPD bertahap:
 * soal umum (pembuka) → soal per tahap sesuai urutan tahapan → soal khusus tanpa tahap.
 */
export function urutkanSoal<T extends Soal>(soal: T[], tahapan?: TahapLkpd[]): T[] {
  const pos = (q: Soal) => {
    if (!tahapan?.length) return 0;
    if (!q.id_materi) return -1;
    const i = tahapan.findIndex((t) => t.kunci === q.tahap);
    return i === -1 ? tahapan.length : i;
  };
  return [...soal].sort(
    (a, b) => pos(a) - pos(b) || Number(Boolean(a.id_materi)) - Number(Boolean(b.id_materi)) || (a.urutan ?? 0) - (b.urutan ?? 0)
  );
}

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
    MATERI_BELUM_TERSEDIA: 'Materi ini belum dibuka untuk kelasmu. Tunggu sampai guru menerbitkannya.',
    KHUSUS_ADMIN: 'Tindakan ini khusus admin.',
    NAMA_KOSONG: 'Nama tidak boleh kosong.',
    KELAS_WAJIB: 'Pilih minimal satu kelas. Jika Anda belum mengampu kelas, minta admin memasukkan Anda ke kelas.',
    KELAS_BUKAN_MILIK: 'Anda hanya bisa memilih kelas yang Anda ampu.',
    KELAS_TIDAK_ADA: 'Kelas tidak ditemukan (mungkin sudah dihapus).',
    BUKAN_AKUN_SISWA: 'Hanya akun siswa yang bisa dimasukkan ke kelas sebagai siswa.',
    PENGGUNA_TIDAK_ADA: 'Akun pengguna tidak ditemukan.',
    JUDUL_KOSONG: 'Judul belum diisi.',
    ISI_KOSONG: 'Isi belum diisi.',
    RUBRIK_TIDAK_VALID: 'Format rubrik tidak valid.',
    SUMBER_TIDAK_VALID: 'Sumber koreksi tidak dikenal.',
    HASIL_TIDAK_VALID: 'Hasil koreksi tidak valid.',
    PENGUMPULAN_TIDAK_ADA: 'Pengumpulan tidak ditemukan (mungkin sudah dihapus).',
    kelas_nama_unik: 'Nama kelas itu sudah dipakai.',
    kelas_anggota_satu_kelas_siswa: 'Siswa itu sudah terdaftar di kelas lain.',
    jadwal_check: 'Jam selesai harus setelah jam mulai.',
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
