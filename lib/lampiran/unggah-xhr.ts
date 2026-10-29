// Pengunggah berkas ke bucket privat Supabase Storage (jawaban-essay) berbasis XMLHttpRequest
// agar persentase unggahan (0%–100%) terpantau secara nyata dan dapat dibatalkan kapan saja.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET_JAWABAN_ESSAY } from '@/lib/lampiran/tipe';
import type { JenisPengerjaan } from '@/lib/pengerjaan';

export interface ParameterUnggahXhr {
  supabase: SupabaseClient;
  uid: string;
  jenis: JenisPengerjaan;
  idMateri: string;
  idSoal: string;
  blob: Blob;
  namaSimpan: string;
  mime: string;
  onProgress?: (persen: number) => void;
  signal?: AbortSignal;
}

function sanitasiNamaPath(nama: string): string {
  const bersih = nama
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '');
  return (bersih || 'berkas').slice(-80);
}

/** Susun path penyimpanan terisolasi di bawah folder UID siswa sesuai kebijakan RLS storage.objects. */
export function buatPathLampiranEssay(
  uid: string,
  jenis: JenisPengerjaan,
  idMateri: string,
  idSoal: string,
  namaSimpan: string
): string {
  const acak = Math.random().toString(36).slice(2, 8);
  const namaAman = sanitasiNamaPath(namaSimpan);
  return `${uid}/${jenis}/${idMateri}/${idSoal}/${Date.now()}-${acak}-${namaAman}`;
}

/** Unggah berkas dengan pelaporan progres byte nyata (0%–100%) dan dukungan pembatalan (AbortSignal). */
export async function unggahLampiranXhr(param: ParameterUnggahXhr): Promise<{ path: string }> {
  const { supabase, uid, jenis, idMateri, idSoal, blob, namaSimpan, mime, onProgress, signal } = param;
  if (signal?.aborted) {
    throw new DOMException('Unggahan dibatalkan.', 'AbortError');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('BELUM_LOGIN');
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!baseUrl || !anonKey) {
    throw new Error('Konfigurasi Supabase belum lengkap.');
  }

  const path = buatPathLampiranEssay(uid, jenis, idMateri, idSoal, namaSimpan);
  const encodedPath = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const endpoint = `${baseUrl}/storage/v1/object/${BUCKET_JAWABAN_ESSAY}/${encodedPath}`;

  const berkasBerMime = blob.type === mime ? blob : new Blob([blob], { type: mime || 'application/octet-stream' });
  const form = new FormData();
  form.append('cacheControl', '3600');
  form.append('', berkasBerMime, sanitasiNamaPath(namaSimpan));

  onProgress?.(1);

  return new Promise<{ path: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('x-upsert', 'false');

    const batalHandler = () => {
      xhr.abort();
    };
    signal?.addEventListener('abort', batalHandler, { once: true });

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        const persen = Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100)));
        onProgress?.(persen);
      }
    };

    xhr.onload = () => {
      signal?.removeEventListener('abort', batalHandler);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ path });
        return;
      }

      let pesan = `Gagal mengunggah berkas (HTTP ${xhr.status}).`;
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        pesan = json.message || json.error || pesan;
      } catch {
        if (xhr.responseText) pesan = xhr.responseText.slice(0, 200);
      }
      reject(new Error(pesan));
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', batalHandler);
      reject(new Error('network error: koneksi terputus saat mengunggah berkas.'));
    };

    xhr.onabort = () => {
      signal?.removeEventListener('abort', batalHandler);
      reject(new DOMException('Unggahan dibatalkan.', 'AbortError'));
    };

    xhr.send(form);
  });
}

const cacheSignedUrl = new Map<string, { url: string; kedaluwarsa: number }>();

/** Buat URL pratinjau/unduh berbatas waktu (Signed URL) dengan cache memori agar hemat permintaan jaringan. */
export async function buatUrlLampiran(
  supabase: SupabaseClient,
  path: string,
  detikBerlaku = 3600
): Promise<string | null> {
  if (!path) return null;
  const sekarang = Date.now();
  const tersimpan = cacheSignedUrl.get(path);
  if (tersimpan && tersimpan.kedaluwarsa > sekarang + 60_000) {
    return tersimpan.url;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_JAWABAN_ESSAY)
    .createSignedUrl(path, detikBerlaku);

  if (error || !data?.signedUrl) return null;
  cacheSignedUrl.set(path, {
    url: data.signedUrl,
    kedaluwarsa: sekarang + detikBerlaku * 1000,
  });
  return data.signedUrl;
}

/** Hapus satu atau lebih berkas draf lampiran dari Supabase Storage. */
export async function hapusLampiranStorage(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  const bersih = paths.map((p) => p.trim()).filter(Boolean);
  if (!bersih.length) return;
  for (const p of bersih) cacheSignedUrl.delete(p);
  await supabase.storage.from(BUCKET_JAWABAN_ESSAY).remove(bersih);
}
