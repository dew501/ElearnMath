import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/akses';
import { isJenis, pesanGalat, petaJawaban, tahapanDari, urutkanSoal, type Soal, type TahapLkpd } from '@/lib/pengerjaan';
import { keSoalKoreksi } from '@/lib/koreksi/siapkan';
import { koreksiAturan } from '@/lib/koreksi/aturan';
import { koreksiGemini } from '@/lib/koreksi/gemini';
import type { HasilKoreksi } from '@/lib/koreksi/tipe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TABEL = {
  lkpd: { tabel: 'jawaban_lkpd', kolom: 'file_answers_json' },
  latihan: { tabel: 'pengerjaan_latihan', kolom: 'answers_json' },
  evaluasi: { tabel: 'pengerjaan_evaluasi', kolom: 'answers_json' },
} as const;

const tolak = (status: number, pesan: string) => NextResponse.json({ pesan }, { status });

/** Buat saran koreksi untuk satu pengumpulan. Saran disimpan dan baru menjadi nilai setelah guru menyimpannya. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const jenis = body?.jenis;
  const id = String(body?.id ?? '');
  if (!isJenis(jenis) || !UUID_RE.test(id)) return tolak(400, 'Permintaan tidak valid.');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return tolak(401, 'Sesi Anda sudah berakhir. Silakan masuk kembali.');
  const { data: profil } = await supabase.from('users').select('role, status_approval').eq('id', user.id).maybeSingle();
  if (!profil || !['guru', 'admin'].includes(profil.role) || profil.status_approval !== 'APPROVED') {
    return tolak(403, 'Koreksi AI khusus guru.');
  }

  const { tabel, kolom } = TABEL[jenis];
  const { data: sub, error: galatSub } = await supabase.from(tabel).select(`id, id_materi, ${kolom}`).eq('id', id).maybeSingle();
  if (galatSub) return tolak(500, pesanGalat(galatSub));
  if (!sub) return tolak(404, 'Pengumpulan tidak ditemukan (mungkin sudah dihapus).');
  const baris = sub as unknown as Record<string, unknown> & { id_materi: string | null };

  const { data: soalData, error: galatSoal } = await supabase.rpc('soal_dengan_kunci', { p_jenis: jenis, p_id_materi: baris.id_materi });
  if (galatSoal) return tolak(500, pesanGalat(galatSoal));
  let tahapan: TahapLkpd[] | undefined;
  if (jenis === 'lkpd' && baris.id_materi) {
    const { data: l } = await supabase.from('lkpd').select('tahapan').eq('id_materi', baris.id_materi).maybeSingle();
    if (l) tahapan = tahapanDari(l.tahapan);
  }
  const soal = keSoalKoreksi(urutkanSoal((soalData ?? []) as Soal[], tahapan));
  if (!soal.length) return tolak(422, 'Belum ada soal untuk tugas ini.');
  const jawaban = petaJawaban(baris[kolom]);

  let hasil: HasilKoreksi;
  let sumber: 'gemini' | 'aturan' = 'aturan';
  let model: string | null = null;
  const kunci = process.env.GEMINI_API_KEY?.trim();
  const adaUraian = soal.some((s) => s.tipe === 'essay' && (jawaban[s.id] ?? '').trim());

  if (!adaUraian) {
    hasil = koreksiAturan(soal, jawaban);
    hasil.catatan_sistem = 'Lembar ini tidak berisi jawaban uraian, jadi nilainya dihitung otomatis dari kunci jawaban.';
  } else if (kunci && process.env.KOREKSI_AI_MODE !== 'aturan') {
    const g = await koreksiGemini(soal, jawaban, {
      kunci,
      jenis,
      model: process.env.GEMINI_MODELS?.split(',').map((s) => s.trim()).filter(Boolean),
    });
    if (g.ok) {
      hasil = g.hasil;
      sumber = 'gemini';
      model = g.model;
    } else {
      hasil = koreksiAturan(soal, jawaban);
      hasil.catatan_sistem = `${g.alasan} Saran ini dibuat mesin koreksi cadangan (berbasis rubrik); coba lagi beberapa menit lagi untuk memakai AI.`;
    }
  } else {
    hasil = koreksiAturan(soal, jawaban);
    hasil.catatan_sistem = kunci
      ? 'Mode koreksi aturan aktif; saran dibuat dari rubrik dan jawaban ideal.'
      : 'Kunci Gemini belum dipasang di server; saran dibuat mesin koreksi berbasis rubrik.';
  }

  const { error: galatSimpan } = await supabase.rpc('simpan_koreksi_ai', {
    p_jenis: jenis,
    p_id: id,
    p_hasil: hasil,
    p_sumber: sumber,
    p_model: model,
  });

  return NextResponse.json({
    hasil,
    sumber,
    model,
    jenis,
    tersimpan: !galatSimpan,
    ...(galatSimpan ? { pesan: `Saran tidak tersimpan: ${pesanGalat(galatSimpan)}` } : {}),
  });
}
