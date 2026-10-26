'use client';

import { createClient as klienSupabase, type SupabaseClient } from '@supabase/supabase-js';

export type PeranAkun = 'siswa' | 'guru' | 'admin';
export interface AkunBaru {
  full_name: string;
  email: string;
  password: string;
  role: PeranAkun;
  nomor_induk?: string | null;
  kelas_id?: string | null;
  kelas_ids?: string[];
}

/** Kata sandi awal yang mudah dibaca (tanpa huruf/angka yang mirip seperti l/1/0/o). */
export function sandiAcak(): string {
  const huruf = 'abcdefghjkmnpqrstuvwxyz';
  const angka = '23456789';
  const ambil = (s: string, n: number) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, (x) => s[x % s.length]).join('');
  };
  const awal = ambil(huruf, 1).toUpperCase() + ambil(huruf, 3);
  return `${awal}${ambil(angka, 4)}${ambil(huruf, 2)}`;
}

/**
 * Buat akun yang langsung aktif. Jalur utama: API server dengan secret key.
 * Cadangan (secret key belum dipasang): pendaftaran biasa lewat klien sementara, lalu disetujui admin.
 */
export async function buatAkun(
  admin: SupabaseClient,
  a: AkunBaru,
  opsi: { lewatApi?: boolean } = {}
): Promise<{ ok: true; id: string } | { ok: false; pesan: string }> {
  // lewatApi = false bila sudah diketahui secret key belum dipasang (langsung pakai jalur cadangan)
  const r =
    opsi.lewatApi === false
      ? null
      : await fetch('/api/admin/pengguna', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aksi: 'buat', ...a }),
        }).catch(() => null);
  if (r && r.status !== 501) {
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, id: j.id } : { ok: false, pesan: j.pesan || 'Akun gagal dibuat.' };
  }

  // Cadangan tanpa secret key
  const sementara = klienSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'elearnmath-akun-sementara' },
  });
  const { data, error } = await sementara.auth.signUp({
    email: a.email,
    password: a.password,
    options: { data: { full_name: a.full_name, peran: a.role === 'guru' ? 'guru' : 'siswa', nomor_induk: a.nomor_induk || null, kelas_id: a.kelas_id || null } },
  });
  if (error) {
    const m = error.message || '';
    return { ok: false, pesan: /already|exists/i.test(m) ? 'Email itu sudah terdaftar.' : /password/i.test(m) ? 'Kata sandi terlalu lemah.' : m };
  }
  const uid = data.user?.id;
  if (!uid || data.user?.identities?.length === 0) return { ok: false, pesan: 'Email itu sudah terdaftar.' };
  await sementara.auth.signOut().catch(() => {});

  const kelasAwal = a.role === 'siswa' ? a.kelas_id || null : a.role === 'guru' ? a.kelas_ids?.[0] || null : null;
  const { error: e1 } = await admin.rpc('setujui_pengguna', { p_user: uid, p_kelas: kelasAwal });
  if (e1) return { ok: false, pesan: `Akun dibuat tetapi belum disetujui: ${e1.message}` };
  if (a.role === 'admin') await admin.from('users').update({ role: 'admin' }).eq('id', uid);
  if (a.role === 'guru' && (a.kelas_ids?.length ?? 0) > 1) {
    await admin.from('kelas_anggota').insert(a.kelas_ids!.slice(1).map((k) => ({ kelas_id: k, user_id: uid, peran: 'guru' })));
  }
  return { ok: true, id: uid };
}

/** Parse CSV sederhana (pemisah koma atau titik koma, mendukung tanda kutip). */
export function parseCsv(teks: string): string[][] {
  const baris = teks.replace(/^﻿/, '').split(/\r?\n/).filter((b) => b.trim());
  if (!baris.length) return [];
  const pemisah = (baris[0].match(/;/g)?.length ?? 0) > (baris[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  return baris.map((b) => {
    const out: string[] = [];
    let cur = '';
    let kutip = false;
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (c === '"') {
        if (kutip && b[i + 1] === '"') {
          cur += '"';
          i++;
        } else kutip = !kutip;
      } else if (c === pemisah && !kutip) {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  });
}

export function keCsv(baris: (string | number | null | undefined)[][]): string {
  return '﻿' + baris.map((b) => b.map((x) => {
    const s = String(x ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
}

export function unduhTeks(nama: string, isi: string, tipe = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([isi], { type: tipe }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
