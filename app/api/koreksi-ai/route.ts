import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UUID_RE } from '@/lib/akses';
import {
  isJenis,
  pesanGalat,
  petaJawaban,
  petaLampiran,
  tahapanDari,
  urutkanSoal,
  type Soal,
  type TahapLkpd,
} from '@/lib/pengerjaan';
import {
  BUCKET_JAWABAN_ESSAY,
  type HasilForensikAi,
  type TingkatIndikasiAi,
} from '@/lib/lampiran/tipe';
import {
  ekstrakTeksBerkas,
  pindaiForensikBerkas,
  pindaiForensikTeks,
} from '@/lib/lampiran/deteksi-ai';
import { keSoalKoreksi } from '@/lib/koreksi/siapkan';
import { koreksiAturan } from '@/lib/koreksi/aturan';
import { koreksiGemini, type MediaLampiranGemini } from '@/lib/koreksi/gemini';
import type { HasilKoreksi, Tingkat } from '@/lib/koreksi/tipe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TABEL = {
  lkpd: { tabel: 'jawaban_lkpd', kolom: 'file_answers_json' },
  latihan: { tabel: 'pengerjaan_latihan', kolom: 'answers_json' },
  evaluasi: { tabel: 'pengerjaan_evaluasi', kolom: 'answers_json' },
} as const;

const MIME_MULTIMODAL_GEMINI = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const BOBOT_TINGKAT: Record<TingkatIndikasiAi, number> = {
  rendah: 0,
  sedang: 1,
  tinggi: 2,
};

const tolak = (status: number, pesan: string) => NextResponse.json({ pesan }, { status });

/** Buat saran koreksi untuk satu pengumpulan (termasuk membaca lampiran foto/dokumen & bukti forensik AI). */
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
  const jawabanAsli = petaJawaban(baris[kolom]);
  const petaBerkas = petaLampiran(baris[kolom]);

  // Perkaya teks jawaban dari dokumen lampiran + siapkan media visual untuk Gemini + kumpulkan bukti forensik
  const jawabanDiperkaya: Record<string, string> = { ...jawabanAsli };
  const mediaGemini: MediaLampiranGemini[] = [];
  const soalDenganBerkasNonTeks = new Set<string>();
  let totalByteMedia = 0;
  let tingkatForensikTertinggi: TingkatIndikasiAi = 'rendah';
  const alasanForensikList: string[] = [];

  const catatForensik = (label: string, scan: HasilForensikAi | null | undefined) => {
    if (!scan || scan.tingkat === 'rendah') return;
    if (BOBOT_TINGKAT[scan.tingkat] > BOBOT_TINGKAT[tingkatForensikTertinggi]) {
      tingkatForensikTertinggi = scan.tingkat;
    }
    alasanForensikList.push(`${label}: ${scan.ringkasan}`);
  };

  for (const s of soal) {
    if (s.tipe !== 'essay') continue;
    const teksKetik = (jawabanAsli[s.id] ?? '').trim();
    if (teksKetik) {
      catatForensik(`Teks Soal #${s.nomor}`, pindaiForensikTeks(teksKetik));
    }

    const daftarBerkas = petaBerkas[s.id] ?? [];
    if (!daftarBerkas.length) continue;

    const potonganTeksBerkas: string[] = [];
    for (const item of daftarBerkas) {
      let scanServer: HasilForensikAi | null = null;
      try {
        const { data: blobUnduh } = await supabase.storage
          .from(BUCKET_JAWABAN_ESSAY)
          .download(item.path);
        if (blobUnduh) {
          const bytes = new Uint8Array(await blobUnduh.arrayBuffer());
          const [teksDok, forensikSegar] = await Promise.all([
            ekstrakTeksBerkas(bytes, item.name, item.mime),
            pindaiForensikBerkas(bytes, item.name, item.mime),
          ]);
          scanServer = forensikSegar;
          if (teksDok.trim()) {
            potonganTeksBerkas.push(`[Isi berkas ${item.original_name || item.name}]:\n${teksDok.trim()}`);
          } else {
            soalDenganBerkasNonTeks.add(s.id);
          }

          const mime = (item.mime || blobUnduh.type || '').toLowerCase();
          if (
            MIME_MULTIMODAL_GEMINI.has(mime) &&
            bytes.byteLength <= 4 * 1024 * 1024 &&
            totalByteMedia + bytes.byteLength <= 10 * 1024 * 1024
          ) {
            totalByteMedia += bytes.byteLength;
            mediaGemini.push({
              idSoal: s.id,
              nama: item.original_name || item.name,
              mimeType: mime,
              base64: Buffer.from(bytes).toString('base64'),
            });
          }
        } else {
          soalDenganBerkasNonTeks.add(s.id);
        }
      } catch {
        soalDenganBerkasNonTeks.add(s.id);
      }

      // Utamakan hasil pra-kompresi bila skor risikonya lebih tinggi (karena kompresi gambar menghapus metadata EXIF/C2PA)
      const scanTerbaik =
        item.ai_scan && (!scanServer || item.ai_scan.skor_risiko >= scanServer.skor_risiko)
          ? item.ai_scan
          : scanServer;
      catatForensik(`Berkas "${item.original_name || item.name}" (Soal #${s.nomor})`, scanTerbaik);
    }

    if (potonganTeksBerkas.length) {
      jawabanDiperkaya[s.id] = [teksKetik, ...potonganTeksBerkas].filter(Boolean).join('\n\n');
    }
  }

  const sesuaikanAturanUntukFoto = (h: HasilKoreksi): HasilKoreksi => {
    let adaManual = false;
    const perSoalBaru = h.per_soal.map((p) => {
      if (
        p.tipe === 'essay' &&
        !(jawabanDiperkaya[p.id_soal] ?? '').trim() &&
        soalDenganBerkasNonTeks.has(p.id_soal)
      ) {
        adaManual = true;
        return {
          ...p,
          alasan: 'Siswa melampirkan foto/berkas jawaban tanpa teks digital; periksa pratinjau berkas secara langsung.',
          perlu_manual: true,
        };
      }
      return p;
    });
    return {
      ...h,
      per_soal: perSoalBaru,
      ...(adaManual ? { keyakinan: 'rendah' as Tingkat } : {}),
    };
  };

  let hasil: HasilKoreksi;
  let sumber: 'gemini' | 'aturan' = 'aturan';
  let model: string | null = null;
  const kunci = process.env.GEMINI_API_KEY?.trim();
  const adaUraian = soal.some(
    (s) =>
      s.tipe === 'essay' &&
      ((jawabanDiperkaya[s.id] ?? '').trim().length > 0 || (petaBerkas[s.id]?.length ?? 0) > 0)
  );

  if (!adaUraian) {
    hasil = koreksiAturan(soal, jawabanDiperkaya);
    hasil.catatan_sistem = 'Lembar ini tidak berisi jawaban uraian, jadi nilainya dihitung otomatis dari kunci jawaban.';
  } else if (kunci && process.env.KOREKSI_AI_MODE !== 'aturan') {
    const g = await koreksiGemini(soal, jawabanDiperkaya, {
      kunci,
      jenis,
      model: process.env.GEMINI_MODELS?.split(',').map((s) => s.trim()).filter(Boolean),
      media: mediaGemini,
    });
    if (g.ok) {
      hasil = g.hasil;
      sumber = 'gemini';
      model = g.model;
    } else {
      hasil = sesuaikanAturanUntukFoto(koreksiAturan(soal, jawabanDiperkaya));
      hasil.catatan_sistem = `${g.alasan} Saran ini dibuat mesin koreksi cadangan (berbasis rubrik); coba lagi beberapa menit lagi untuk memakai AI.`;
    }
  } else {
    hasil = sesuaikanAturanUntukFoto(koreksiAturan(soal, jawabanDiperkaya));
    hasil.catatan_sistem = kunci
      ? 'Mode koreksi aturan aktif; saran dibuat dari rubrik dan jawaban ideal.'
      : 'Kunci Gemini belum dipasang di server; saran dibuat mesin koreksi berbasis rubrik.';
  }

  // Gabungkan temuan forensik metadata & watermark Unicode tak terlihat ke dalam indikasi_ai
  if (tingkatForensikTertinggi !== 'rendah' && alasanForensikList.length > 0) {
    const tingkatSaatIni = hasil.indikasi_ai?.tingkat ?? 'rendah';
    const tingkatGabung: Tingkat =
      BOBOT_TINGKAT[tingkatForensikTertinggi] > BOBOT_TINGKAT[tingkatSaatIni]
        ? tingkatForensikTertinggi
        : tingkatSaatIni;
    const ringkasForensik = alasanForensikList.join(' | ');
    const alasanLama = hasil.indikasi_ai?.alasan?.trim();
    hasil.indikasi_ai = {
      tingkat: tingkatGabung,
      alasan: [ringkasForensik, alasanLama].filter(Boolean).join(' — ').slice(0, 300),
    };
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
