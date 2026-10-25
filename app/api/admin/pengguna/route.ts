import { NextResponse } from 'next/server';
import { createClient as klienSupabase, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/akses';

export const dynamic = 'force-dynamic';

const PERAN = ['siswa', 'guru', 'admin'] as const;
const tolak = (status: number, pesan: string, extra: Record<string, unknown> = {}) => NextResponse.json({ pesan, ...extra }, { status });

/** Klien dengan secret key (service role) — hanya di server. Null bila belum dipasang. */
function klienLayanan(): SupabaseClient | null {
  const kunci = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!kunci) return null;
  return klienSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, kunci, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function pastikanAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { galat: tolak(401, 'Sesi Anda sudah berakhir. Silakan masuk kembali.') };
  const { data: profil } = await supabase.from('users').select('role, status_approval').eq('id', user.id).maybeSingle();
  if (profil?.role !== 'admin' || profil.status_approval !== 'APPROVED') return { galat: tolak(403, 'Tindakan ini khusus admin.') };
  return { user };
}

const pesanAuth = (e: { message?: string; code?: string } | null) => {
  const m = e?.message || '';
  if (e?.code === 'email_exists' || /already (been )?registered|already exists/i.test(m)) return 'Email itu sudah terdaftar.';
  if (e?.code === 'weak_password' || /password/i.test(m)) return 'Kata sandi terlalu lemah (minimal 8 karakter).';
  if (/email/i.test(m)) return 'Format email tidak valid.';
  return m || 'Terjadi kesalahan pada layanan akun.';
};

/** Apakah fitur yang butuh secret key (buat akun langsung, hapus akun, atur ulang sandi) tersedia. */
export async function GET() {
  const cek = await pastikanAdmin();
  if (cek.galat) return cek.galat;
  return NextResponse.json({ tersedia: !!klienLayanan() });
}

export async function POST(req: Request) {
  const cek = await pastikanAdmin();
  if (cek.galat) return cek.galat;
  const svc = klienLayanan();
  if (!svc) return tolak(501, 'SUPABASE_SECRET_KEY belum dipasang di server.', { kode: 'TANPA_SECRET_KEY' });
  const b = (await req.json().catch(() => null)) ?? {};

  if (b.aksi === 'buat') {
    const email = String(b.email ?? '').trim().toLowerCase();
    const nama = String(b.full_name ?? '').trim().slice(0, 100);
    const sandi = String(b.password ?? '');
    const peran = PERAN.includes(b.role) ? (b.role as (typeof PERAN)[number]) : 'siswa';
    const nomor = String(b.nomor_induk ?? '').trim().slice(0, 30) || null;
    const kelas = UUID_RE.test(String(b.kelas_id ?? '')) ? String(b.kelas_id) : null;
    const kelasGuru: string[] = Array.isArray(b.kelas_ids) ? b.kelas_ids.filter((k: unknown) => UUID_RE.test(String(k))) : [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return tolak(400, 'Format email tidak valid.');
    if (!nama) return tolak(400, 'Nama lengkap belum diisi.');
    if (sandi.length < 8) return tolak(400, 'Kata sandi minimal 8 karakter.');

    const { data, error } = await svc.auth.admin.createUser({
      email,
      password: sandi,
      email_confirm: true,
      user_metadata: { full_name: nama, peran: peran === 'guru' ? 'guru' : 'siswa', nomor_induk: nomor },
    });
    if (error || !data.user) return tolak(error?.status === 422 ? 409 : 400, pesanAuth(error));
    const uid = data.user.id;

    // Profil dibuat trigger pendaftaran; dipastikan ada & langsung disetujui (akun dibuat admin)
    const { error: galatProfil } = await svc
      .from('users')
      .upsert({ id: uid, email, full_name: nama, role: peran, status_approval: 'APPROVED', nomor_induk: nomor }, { onConflict: 'id' });
    if (galatProfil) {
      await svc.auth.admin.deleteUser(uid);
      return tolak(500, `Profil gagal dibuat: ${galatProfil.message}`);
    }
    if (peran === 'siswa' && kelas) {
      await svc.from('kelas_anggota').delete().eq('user_id', uid).eq('peran', 'siswa');
      await svc.from('kelas_anggota').insert({ kelas_id: kelas, user_id: uid, peran: 'siswa' });
    }
    if (peran === 'guru' && kelasGuru.length) {
      await svc.from('kelas_anggota').insert(kelasGuru.map((k) => ({ kelas_id: k, user_id: uid, peran: 'guru' })));
    }
    return NextResponse.json({ ok: true, id: uid });
  }

  if (b.aksi === 'reset_sandi') {
    const id = String(b.id ?? '');
    const sandi = String(b.password ?? '');
    if (!UUID_RE.test(id)) return tolak(400, 'Akun tidak valid.');
    if (sandi.length < 8) return tolak(400, 'Kata sandi minimal 8 karakter.');
    const { error } = await svc.auth.admin.updateUserById(id, { password: sandi });
    if (error) return tolak(400, pesanAuth(error));
    return NextResponse.json({ ok: true });
  }

  return tolak(400, 'Aksi tidak dikenal.');
}

export async function DELETE(req: Request) {
  const cek = await pastikanAdmin();
  if (cek.galat) return cek.galat;
  const svc = klienLayanan();
  if (!svc) return tolak(501, 'SUPABASE_SECRET_KEY belum dipasang di server.', { kode: 'TANPA_SECRET_KEY' });
  const b = (await req.json().catch(() => null)) ?? {};
  const id = String(b.id ?? '');
  if (!UUID_RE.test(id)) return tolak(400, 'Akun tidak valid.');
  if (id === cek.user!.id) return tolak(400, 'Akun Anda sendiri tidak bisa dihapus.');

  const { data: target } = await svc.from('users').select('id, role').eq('id', id).maybeSingle();
  if (target?.role === 'admin') {
    const { count } = await svc.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if ((count ?? 0) <= 1) return tolak(400, 'Admin terakhir tidak bisa dihapus.');
  }

  const tabelTugas = ['jawaban_lkpd', 'pengerjaan_latihan', 'pengerjaan_evaluasi'];
  let jumlah = 0;
  for (const t of tabelTugas) {
    const { count } = await svc.from(t).select('id', { count: 'exact', head: true }).eq('id_siswa', id);
    jumlah += count ?? 0;
  }
  if (jumlah > 0 && !b.paksa) return tolak(409, `Akun ini punya ${jumlah} pengumpulan tugas.`, { jumlah });

  for (const t of ['tab_switch_logs', ...tabelTugas]) {
    const { error } = await svc.from(t).delete().eq('id_siswa', id);
    if (error) return tolak(500, `Data ${t} gagal dihapus: ${error.message}`);
  }
  if (target) {
    const { error } = await svc.from('users').delete().eq('id', id);
    if (error) return tolak(500, `Profil gagal dihapus: ${error.message}`);
  }
  const { error } = await svc.auth.admin.deleteUser(id);
  if (error && !/not found/i.test(error.message)) return tolak(500, `Akun login gagal dihapus: ${error.message}`);
  return NextResponse.json({ ok: true });
}
