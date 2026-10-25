// Utilitas waktu & jadwal (zona Asia/Jakarta), aman dipakai di server maupun klien.

export const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const;
const ZONA = 'Asia/Jakarta';

/** "07:00:00" → "07.00" */
export function jamPendek(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}.${(m ?? '00').padStart(2, '0')}`;
}

/** Hari ini dalam penomoran jadwal (Senin = 1 … Minggu = 7). */
export function hariIni(d = new Date()): number {
  const nama = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: ZONA }).format(d);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(nama) + 1;
}

/** Tanggal hari ini "YYYY-MM-DD" menurut zona Jakarta. */
export function tanggalIni(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** "2026-10-29" → "Kamis, 29 Okt 2026" */
export function tanggalPanjang(tanggal: string | null | undefined, { tahun = true } = {}): string {
  if (!tanggal) return '-';
  const d = new Date(`${tanggal.slice(0, 10)}T00:00:00+07:00`);
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', ...(tahun ? { year: 'numeric' } : {}), timeZone: ZONA });
}

/** Selisih hari dari hari ini ke tanggal (0 = hari ini, 1 = besok, -1 = kemarin). */
export function selisihHari(tanggal: string): number {
  const a = Date.parse(`${tanggalIni()}T00:00:00Z`);
  const b = Date.parse(`${tanggal.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function labelHariRelatif(tanggal: string): string {
  const s = selisihHari(tanggal);
  if (s === 0) return 'Hari ini';
  if (s === 1) return 'Besok';
  if (s === -1) return 'Kemarin';
  if (s > 1 && s < 7) return `${s} hari lagi`;
  if (s < -1) return `${-s} hari lalu`;
  return tanggalPanjang(tanggal, { tahun: false });
}

/** "baru saja", "5 menit lalu", "2 jam lalu", "kemarin", "3 hari lalu", lalu tanggal. */
export function waktuRelatif(iso: string | null | undefined, sekarang = Date.now()): string {
  if (!iso) return '-';
  const detik = Math.max(0, Math.round((sekarang - new Date(iso).getTime()) / 1000));
  if (detik < 60) return 'baru saja';
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari === 1) return 'kemarin';
  if (hari < 7) return `${hari} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA });
}

/** Dianggap online bila aktif dalam 2,5 menit terakhir (heartbeat tiap 60 detik). */
export function sedangOnline(iso: string | null | undefined, sekarang = Date.now()): boolean {
  return !!iso && sekarang - new Date(iso).getTime() < 150_000;
}
