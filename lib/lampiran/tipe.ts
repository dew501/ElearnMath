// Tipe data, aturan format berkas, dan utilitas ukuran untuk lampiran jawaban essay siswa.

export const BUCKET_JAWABAN_ESSAY = 'jawaban-essay';
export const MAKS_BERKAS_PER_SOAL = 5;
export const MAKS_UKURAN_MENTAH_BYTE = 25 * 1024 * 1024; // 25 MB sebelum kompresi

export const FORMAT_DEFAULT_ESSAY = ['pdf', 'word', 'image'] as const;

export interface InfoGrupFormat {
  kunci: string;
  label: string;
  singkat: string;
  ekstensi: string[];
  accept: string[];
}

export const GRUP_FORMAT_ESSAY: InfoGrupFormat[] = [
  {
    kunci: 'pdf',
    label: 'PDF (.pdf)',
    singkat: 'PDF',
    ekstensi: ['pdf'],
    accept: ['application/pdf', '.pdf'],
  },
  {
    kunci: 'word',
    label: 'Word (.doc, .docx)',
    singkat: 'Word',
    ekstensi: ['doc', 'docx', 'odt', 'rtf'],
    accept: [
      '.doc',
      '.docx',
      '.odt',
      '.rtf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  {
    kunci: 'image',
    label: 'Foto / Gambar (.jpg, .png, .webp, .heic)',
    singkat: 'Gambar',
    ekstensi: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'],
    accept: ['image/*', '.heic', '.heif'],
  },
  {
    kunci: 'ppt',
    label: 'PowerPoint (.ppt, .pptx)',
    singkat: 'PPT',
    ekstensi: ['ppt', 'pptx', 'odp'],
    accept: [
      '.ppt',
      '.pptx',
      '.odp',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  {
    kunci: 'excel',
    label: 'Excel / CSV (.xls, .xlsx, .csv)',
    singkat: 'Excel',
    ekstensi: ['xls', 'xlsx', 'ods', 'csv'],
    accept: [
      '.xls',
      '.xlsx',
      '.ods',
      '.csv',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  {
    kunci: 'zip',
    label: 'Arsip (.zip, .rar, .7z)',
    singkat: 'ZIP',
    ekstensi: ['zip', 'rar', '7z'],
    accept: ['.zip', '.rar', '.7z', 'application/zip', 'application/x-zip-compressed'],
  },
  {
    kunci: 'text',
    label: 'Teks (.txt, .md)',
    singkat: 'Teks',
    ekstensi: ['txt', 'md'],
    accept: ['.txt', '.md', 'text/plain', 'text/markdown'],
  },
  {
    kunci: '*',
    label: 'Semua Format Berkas',
    singkat: 'Semua Format',
    ekstensi: ['*'],
    accept: ['*/*'],
  },
];

export type TingkatIndikasiAi = 'rendah' | 'sedang' | 'tinggi';

export interface TemuanUnicode {
  kode: string;
  nama: string;
  kategori: 'zero_width' | 'steganografi_tag' | 'spasi_anomali' | 'operator_tak_terlihat';
  jumlah: number;
  contoh_konteks: string[];
}

export interface TemuanMetadata {
  kunci: string;
  nilai: string;
  bobot_curiga: 'info' | 'sedang' | 'tinggi';
  keterangan: string;
}

export interface HasilForensikAi {
  tingkat: TingkatIndikasiAi;
  skor_risiko: number;
  ringkasan: string;
  unicode_total: number;
  temuan_unicode: TemuanUnicode[];
  temuan_metadata: TemuanMetadata[];
  statistik_teks?: {
    jumlah_karakter: number;
    jumlah_kata: number;
    sumber_teks: string;
  };
  dipindai_pada: string;
}

export type StatusKualitasKompresi = 'sangat_baik' | 'baik' | 'peringatan_blur' | 'lossless';

export interface LampiranJawaban {
  path: string;
  name: string;
  original_name: string;
  mime: string;
  original_size: number;
  compressed_size: number;
  hemat_persen: number;
  quality_score: number;
  quality_status: StatusKualitasKompresi;
  quality_note: string;
  metode_kompresi: string;
  source: 'camera' | 'upload';
  uploaded_at: string;
  ai_scan?: HasilForensikAi | null;
}

/** Normalisasi daftar format: bila guru belum mengatur (kosong/null), otomatis memakai PDF, Word, dan Gambar. */
export function normalisasiFormatFile(format?: string[] | null): string[] {
  if (!Array.isArray(format)) return [...FORMAT_DEFAULT_ESSAY];
  const bersih = Array.from(
    new Set(
      format
        .map((f) => String(f ?? '').trim().toLowerCase())
        .filter(Boolean)
        .map((f) => {
          if (['all', 'semua', 'bebas', '*/*'].includes(f)) return '*';
          const grup = GRUP_FORMAT_ESSAY.find((g) => g.kunci === f);
          if (grup) return grup.kunci;
          return f.startsWith('.') ? f : `.${f}`;
        })
    )
  );
  if (!bersih.length) return [...FORMAT_DEFAULT_ESSAY];
  if (bersih.includes('*')) return ['*'];
  return bersih;
}

export function apakahFormatBawaan(format?: string[] | null): boolean {
  const n = normalisasiFormatFile(format);
  return n.length === FORMAT_DEFAULT_ESSAY.length && FORMAT_DEFAULT_ESSAY.every((x) => n.includes(x));
}

export function labelFormatFile(format?: string[] | null): string {
  const daftar = normalisasiFormatFile(format);
  if (daftar.includes('*')) return 'Semua format berkas';
  return daftar
    .map((f) => {
      const g = GRUP_FORMAT_ESSAY.find((x) => x.kunci === f);
      return g ? g.singkat : f.toUpperCase();
    })
    .join(', ');
}

export function atributAcceptFile(format?: string[] | null): string | undefined {
  const daftar = normalisasiFormatFile(format);
  if (daftar.includes('*')) return undefined;
  const out = new Set<string>();
  for (const f of daftar) {
    const g = GRUP_FORMAT_ESSAY.find((x) => x.kunci === f);
    if (g) g.accept.forEach((a) => out.add(a));
    else out.add(f.startsWith('.') ? f : `.${f}`);
  }
  return Array.from(out).join(',');
}

export function apakahGambarDiizinkan(format?: string[] | null): boolean {
  const daftar = normalisasiFormatFile(format);
  return daftar.includes('*') || daftar.includes('image') || daftar.some((f) => ['.jpg', '.jpeg', '.png', '.webp'].includes(f));
}

export function apakahPdfDiizinkan(format?: string[] | null): boolean {
  const daftar = normalisasiFormatFile(format);
  return daftar.includes('*') || daftar.includes('pdf') || daftar.includes('.pdf');
}

export function ekstensiFile(nama: string): string {
  const m = nama.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function validasiFormatBerkas(
  namaFile: string,
  mimeType: string,
  format?: string[] | null
): { ok: true } | { ok: false; pesan: string } {
  const daftar = normalisasiFormatFile(format);
  if (daftar.includes('*')) return { ok: true };
  const ext = ekstensiFile(namaFile);
  const mime = (mimeType || '').toLowerCase();

  if (!ext && !mime) {
    return { ok: false, pesan: `Berkas tidak memiliki ekstensi yang dikenali. Format yang diterima: ${labelFormatFile(daftar)}.` };
  }

  for (const f of daftar) {
    const g = GRUP_FORMAT_ESSAY.find((x) => x.kunci === f);
    if (g) {
      if (ext && g.ekstensi.includes(ext)) return { ok: true };
      if (f === 'image' && mime.startsWith('image/')) return { ok: true };
      if (f === 'pdf' && mime === 'application/pdf') return { ok: true };
    } else if (ext && f.replace(/^\./, '') === ext) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    pesan: `Format berkas "${ext ? `.${ext}` : namaFile}" tidak diizinkan pada soal ini. Gunakan: ${labelFormatFile(daftar)}.`,
  };
}

export function formatUkuranByte(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1).replace('.', ',')} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2).replace('.', ',')} MB`;
}

export function hitungHematPersen(asli: number, hasil: number): number {
  if (!asli || asli <= 0 || hasil >= asli) return 0;
  return Math.round(((asli - hasil) / asli) * 1000) / 10;
}

// ---------------------------------------------------------------------------------------
// Gambar lampiran pada soal (dibuat guru): bucket publik-baca "gambar-soal".
// ---------------------------------------------------------------------------------------

export const BUCKET_GAMBAR_SOAL = 'gambar-soal';
export const MAKS_GAMBAR_PER_SOAL = 5;
export const MAKS_UKURAN_GAMBAR_SOAL_MENTAH = 25 * 1024 * 1024; // sebelum kompresi
export const MAKS_UKURAN_GAMBAR_SOAL_SIMPAN = 5 * 1024 * 1024; // batas bucket setelah kompresi
export const ACCEPT_GAMBAR_SOAL = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.heic,.heif';
export const HURUF_OPSI_GAMBAR = ['A', 'B', 'C', 'D'] as const;
export type HurufOpsiGambar = (typeof HURUF_OPSI_GAMBAR)[number];

export interface GambarSoal {
  path: string;
  name: string;
  original_name?: string;
  mime?: string;
  original_size?: number;
  compressed_size?: number;
  hemat_persen?: number;
  quality_score?: number;
  quality_status?: StatusKualitasKompresi;
}

export interface GambarSoalSet {
  pertanyaan: GambarSoal[];
  opsi: Partial<Record<HurufOpsiGambar, GambarSoal | null>>;
}

// Harus sama dengan public.gambar_soal_valid() di migrasi 20261102 (garis bawah dari nama berkas diizinkan).
const POLA_PATH_GAMBAR_SOAL = /^soal\/[A-Za-z0-9_./-]+$/;

function itemGambarValid(x: unknown): x is GambarSoal {
  if (!x || typeof x !== 'object') return false;
  const p = (x as { path?: unknown }).path;
  return typeof p === 'string' && POLA_PATH_GAMBAR_SOAL.test(p) && !p.includes('..') && p.length <= 300;
}

/** Normalisasi isi kolom questions.gambar (aman untuk data kosong/rusak/pra-migrasi). */
export function normalisasiGambarSoal(json: unknown): GambarSoalSet {
  const kosong: GambarSoalSet = { pertanyaan: [], opsi: {} };
  if (!json || typeof json !== 'object' || Array.isArray(json)) return kosong;
  const j = json as { pertanyaan?: unknown; opsi?: unknown };
  const pertanyaan = Array.isArray(j.pertanyaan)
    ? j.pertanyaan.filter(itemGambarValid).slice(0, MAKS_GAMBAR_PER_SOAL)
    : [];
  const opsi: GambarSoalSet['opsi'] = {};
  if (j.opsi && typeof j.opsi === 'object' && !Array.isArray(j.opsi)) {
    for (const h of HURUF_OPSI_GAMBAR) {
      const v = (j.opsi as Record<string, unknown>)[h];
      if (itemGambarValid(v)) opsi[h] = v;
    }
  }
  return { pertanyaan, opsi };
}

/** Bentuk muatan kolom gambar untuk simpan_soal (null bila tidak ada gambar sama sekali). */
export function muatanGambarSoal(set: GambarSoalSet, tipe: 'pg' | 'essay'): GambarSoalSet | null {
  const pertanyaan = set.pertanyaan.filter(itemGambarValid).slice(0, MAKS_GAMBAR_PER_SOAL);
  const opsi: GambarSoalSet['opsi'] = {};
  if (tipe === 'pg') {
    for (const h of HURUF_OPSI_GAMBAR) {
      const v = set.opsi[h];
      if (itemGambarValid(v)) opsi[h] = v;
    }
  }
  if (!pertanyaan.length && !Object.keys(opsi).length) return null;
  return { pertanyaan, opsi };
}

/** Semua path objek Storage yang dirujuk sebuah set gambar soal. */
export function daftarPathGambarSoal(set: GambarSoalSet | null | undefined): string[] {
  if (!set) return [];
  const out = set.pertanyaan.map((g) => g.path);
  for (const h of HURUF_OPSI_GAMBAR) {
    const v = set.opsi[h];
    if (v?.path) out.push(v.path);
  }
  return Array.from(new Set(out));
}

/** Path yang ada di `sebelum` tetapi tidak lagi dipakai di `sesudah` (untuk dibersihkan dari Storage). */
export function selisihPathGambar(sebelum: string[], sesudah: string[]): string[] {
  const pakai = new Set(sesudah);
  return Array.from(new Set(sebelum.filter((p) => p && !pakai.has(p))));
}

/** URL publik gambar soal (bucket publik-baca). */
export function urlGambarSoal(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const encoded = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${base}/storage/v1/object/public/${BUCKET_GAMBAR_SOAL}/${encoded}`;
}

/** Validasi berkas yang dipilih guru sebagai gambar soal. */
export function validasiBerkasGambarSoal(nama: string, mime: string): { ok: true } | { ok: false; pesan: string } {
  const ext = ekstensiFile(nama);
  const m = (mime || '').toLowerCase();
  const extOk = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(ext);
  if (extOk || (m.startsWith('image/') && !m.includes('svg'))) return { ok: true };
  return { ok: false, pesan: `Berkas "${nama}" bukan gambar. Gunakan JPG, PNG, WEBP, GIF, atau HEIC.` };
}

