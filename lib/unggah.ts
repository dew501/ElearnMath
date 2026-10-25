import type { SupabaseClient } from '@supabase/supabase-js';
import { pesanGalat } from '@/lib/pengerjaan';

export const BUCKET_MATERI = 'materi';
const MAKS_BYTE = 10 * 1024 * 1024;
const TIPE: Record<'pdf' | 'gambar', string[]> = {
  pdf: ['application/pdf'],
  gambar: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
};

/** Unggah berkas materi ke Supabase Storage (bucket publik "materi") dan kembalikan URL publiknya. */
export async function unggahBerkas(
  supabase: SupabaseClient,
  file: File,
  jenis: 'pdf' | 'gambar'
): Promise<{ url?: string; error?: string }> {
  if (!TIPE[jenis].includes(file.type)) {
    return { error: jenis === 'pdf' ? 'Pilih berkas PDF.' : 'Pilih gambar PNG, JPG, GIF, atau WEBP.' };
  }
  if (file.size > MAKS_BYTE) return { error: 'Ukuran berkas maksimal 10 MB.' };

  const nama = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'berkas';
  const path = `${jenis}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nama}`;
  const { error } = await supabase.storage.from(BUCKET_MATERI).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) return { error: pesanGalat(error) };
  return { url: supabase.storage.from(BUCKET_MATERI).getPublicUrl(path).data.publicUrl };
}
