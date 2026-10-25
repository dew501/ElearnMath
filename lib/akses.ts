// Aturan akses bersama untuk middleware, halaman server, dan halaman login.

export type Peran = 'siswa' | 'guru' | 'admin';
export type AlasanTolak = 'pending' | 'rejected' | 'noprofile';

export interface ProfilAkses {
  role?: string | null;
  status_approval?: string | null;
}

const PERAN_VALID: Peran[] = ['siswa', 'guru', 'admin'];

export const PESAN_TOLAK: Record<AlasanTolak, string> = {
  pending: 'Akun Anda belum disetujui Admin sekolah. Silakan tunggu persetujuan atau hubungi Admin.',
  rejected: 'Pendaftaran akun Anda ditolak oleh Admin sekolah.',
  noprofile: 'Akun Anda belum terdaftar di sistem sekolah. Silakan hubungi Admin sekolah.',
};

/** Alasan akun belum boleh masuk, atau null jika akun aktif & disetujui. */
export function alasanTolak(profil: ProfilAkses | null | undefined): AlasanTolak | null {
  if (!profil || !PERAN_VALID.includes(profil.role as Peran)) return 'noprofile';
  if (profil.status_approval === 'REJECTED') return 'rejected';
  if (profil.status_approval !== 'APPROVED') return 'pending';
  return null;
}

export function isAlasanTolak(value: string | null): value is AlasanTolak {
  return value === 'pending' || value === 'rejected' || value === 'noprofile';
}

export function berandaUntuk(role: string | null | undefined): string {
  if (role === 'admin') return '/admin';
  return role === 'guru' ? '/guru/koreksi' : '/siswa/materi';
}

/** Kontak admin (opsional) yang ditampilkan di halaman login, mis. "WA 0812-xxxx / tu@sekolah.sch.id". */
export const KONTAK_ADMIN = process.env.NEXT_PUBLIC_ADMIN_CONTACT?.trim() || '';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
