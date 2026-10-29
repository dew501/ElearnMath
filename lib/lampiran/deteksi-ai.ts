// Mesin forensik berkas & teks untuk mendeteksi watermark Unicode tak terlihat dan jejak metadata AI.
// Dapat dijalankan di peramban (sebelum kompresi) maupun di server Node.js (/api/koreksi-ai).

import { strFromU8, unzlibSync, unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import exifr from 'exifr';
import {
  ekstensiFile,
  type HasilForensikAi,
  type TemuanMetadata,
  type TemuanUnicode,
  type TingkatIndikasiAi,
} from '@/lib/lampiran/tipe';

interface DefinisiUnicode {
  nama: string;
  kategori: TemuanUnicode['kategori'];
  bobotPerTemuan: number;
  maksBobot: number;
}

const PETA_UNICODE_CURIGA: Record<number, DefinisiUnicode> = {
  0x200b: { nama: 'Zero Width Space (ZWSP)', kategori: 'zero_width', bobotPerTemuan: 14, maksBobot: 55 },
  0x200c: { nama: 'Zero Width Non-Joiner (ZWNJ)', kategori: 'zero_width', bobotPerTemuan: 12, maksBobot: 48 },
  0x200d: { nama: 'Zero Width Joiner (ZWJ tanpa emoji)', kategori: 'zero_width', bobotPerTemuan: 12, maksBobot: 48 },
  0x2060: { nama: 'Word Joiner (WJ)', kategori: 'zero_width', bobotPerTemuan: 15, maksBobot: 55 },
  0xfeff: { nama: 'Zero Width No-Break Space (Mid-text BOM)', kategori: 'zero_width', bobotPerTemuan: 15, maksBobot: 50 },
  0x180e: { nama: 'Mongolian Vowel Separator', kategori: 'zero_width', bobotPerTemuan: 16, maksBobot: 55 },
  0x034f: { nama: 'Combining Grapheme Joiner (CGJ)', kategori: 'zero_width', bobotPerTemuan: 14, maksBobot: 50 },
  0x061c: { nama: 'Arabic Letter Mark (ALM)', kategori: 'zero_width', bobotPerTemuan: 12, maksBobot: 40 },
  0x2061: { nama: 'Invisible Function Application', kategori: 'operator_tak_terlihat', bobotPerTemuan: 15, maksBobot: 55 },
  0x2062: { nama: 'Invisible Times', kategori: 'operator_tak_terlihat', bobotPerTemuan: 15, maksBobot: 55 },
  0x2063: { nama: 'Invisible Separator', kategori: 'operator_tak_terlihat', bobotPerTemuan: 15, maksBobot: 55 },
  0x2064: { nama: 'Invisible Plus', kategori: 'operator_tak_terlihat', bobotPerTemuan: 15, maksBobot: 55 },
  0x202f: { nama: 'Narrow No-Break Space (NNBSP — ciri khas LLM)', kategori: 'spasi_anomali', bobotPerTemuan: 12, maksBobot: 52 },
  0x2007: { nama: 'Figure Space', kategori: 'spasi_anomali', bobotPerTemuan: 6, maksBobot: 28 },
  0x2008: { nama: 'Punctuation Space', kategori: 'spasi_anomali', bobotPerTemuan: 6, maksBobot: 28 },
  0x2009: { nama: 'Thin Space', kategori: 'spasi_anomali', bobotPerTemuan: 5, maksBobot: 25 },
  0x200a: { nama: 'Hair Space', kategori: 'spasi_anomali', bobotPerTemuan: 8, maksBobot: 35 },
  0x205f: { nama: 'Medium Mathematical Space', kategori: 'spasi_anomali', bobotPerTemuan: 8, maksBobot: 32 },
};

const POLA_ALAT_AI_TINGGI =
  /\b(chatgpt|openai|dall[-·\s]?e|midjourney|stable\s*diffusion|automatic1111|comfyui|adobe\s*firefly|synthid|bing\s*image\s*creator|microsoft\s*designer|leonardo\.ai|ideogram|flux\.1|novelai|claude|anthropic|perplexity|deepseek|grok|meta\s*ai|imagen|canva\s*ai|magic\s*media)\b/i;

const POLA_KONVERTER_OTOMATIS =
  /\b(pandoc|wkhtmltopdf|weasyprint|princexml|md2pdf|markdown-pdf|python-docx|docxtemplater|pdfmake|jspdf|puppeteer|headlesschrome)\b/i;

function kodeHex(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

function apakahEmojiDasar(cp: number): boolean {
  return (
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x1f1e6 && cp <= 0x1f1ff)
  );
}

function hitungKata(teks: string): number {
  const bersih = teks.trim();
  if (!bersih) return 0;
  return bersih.split(/\s+/).filter(Boolean).length;
}

function cuplikanKonteks(cps: number[], idx: number): string {
  const mulai = Math.max(0, idx - 18);
  const akhir = Math.min(cps.length, idx + 19);
  let hasil = mulai > 0 ? '…' : '';
  for (let i = mulai; i < akhir; i++) {
    const c = cps[i];
    if (i === idx) {
      hasil += `[${kodeHex(c)}]`;
    } else if (
      PETA_UNICODE_CURIGA[c] ||
      (c >= 0xe0000 && c <= 0xe007f) ||
      (c >= 0xfe00 && c <= 0xfe0f) ||
      (c >= 0xe0100 && c <= 0xe01ef)
    ) {
      hasil += `[${kodeHex(c)}]`;
    } else if (c === 0x0a || c === 0x0d || c === 0x09) {
      hasil += ' ';
    } else {
      hasil += String.fromCodePoint(c);
    }
  }
  if (akhir < cps.length) hasil += '…';
  return hasil;
}

/** Pindai teks untuk mencari karakter watermark tak terlihat, tag steganografi, dan spasi khas LLM. */
export function pindaiUnicodeTeks(teks: string): {
  temuan: TemuanUnicode[];
  total: number;
  skorTambahan: number;
  pesanTersembunyiTag: string | null;
} {
  if (!teks) return { temuan: [], total: 0, skorTambahan: 0, pesanTersembunyiTag: null };

  const cps: number[] = [];
  for (const ch of teks) {
    cps.push(ch.codePointAt(0)!);
  }

  const kumpul = new Map<
    string,
    {
      kode: string;
      nama: string;
      kategori: TemuanUnicode['kategori'];
      jumlah: number;
      contoh: string[];
      bobotPerTemuan: number;
      maksBobot: number;
    }
  >();

  const catat = (
    kunci: string,
    nama: string,
    kategori: TemuanUnicode['kategori'],
    idx: number,
    bobotPerTemuan: number,
    maksBobot: number
  ) => {
    const ada = kumpul.get(kunci);
    if (ada) {
      ada.jumlah += 1;
      if (ada.contoh.length < 3) ada.contoh.push(cuplikanKonteks(cps, idx));
    } else {
      kumpul.set(kunci, {
        kode: kunci,
        nama,
        kategori,
        jumlah: 1,
        contoh: [cuplikanKonteks(cps, idx)],
        bobotPerTemuan,
        maksBobot,
      });
    }
  };

  const charTagAscii: string[] = [];
  let jumlahNbsp = 0;
  let jumlahSpasiBiasa = 0;

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const prev = i > 0 ? cps[i - 1] : 0;
    const next = i + 1 < cps.length ? cps[i + 1] : 0;

    if (cp === 0x20) {
      jumlahSpasiBiasa += 1;
      continue;
    }
    if (cp === 0x00a0) {
      jumlahNbsp += 1;
      continue;
    }

    // BOM di awal dokumen (indeks 0) adalah normal pada berkas UTF-8; hanya curigai jika di tengah teks.
    if (cp === 0xfeff && i === 0) continue;

    // ZWJ di antara dua emoji adalah urutan emoji sah (mis. keluarga/profesi), bukan watermark.
    if (cp === 0x200d && (apakahEmojiDasar(prev) || apakahEmojiDasar(next))) continue;

    // Blok Unicode Tags (U+E0000..U+E007F) — sering dipakai steganografi ASCII tak terlihat.
    if (cp >= 0xe0000 && cp <= 0xe007f) {
      if (cp >= 0xe0020 && cp <= 0xe007e) {
        charTagAscii.push(String.fromCodePoint(cp - 0xe0000));
      }
      catat('U+E0000..E007F', 'Unicode Tag Steganography Block', 'steganografi_tag', i, 25, 85);
      continue;
    }

    // Variation Selectors Supplement (U+E0100..U+E01EF) atau VS1..16 (U+FE00..U+FE0F) pada huruf biasa (bukan emoji).
    if ((cp >= 0xe0100 && cp <= 0xe01ef) || (cp >= 0xfe00 && cp <= 0xfe0f && !apakahEmojiDasar(prev))) {
      const labelKode = cp >= 0xe0100 ? 'U+E0100..E01EF' : kodeHex(cp);
      catat(
        labelKode,
        'Variation Selector Steganography (menempel pada teks non-emoji)',
        'steganografi_tag',
        i,
        18,
        75
      );
      continue;
    }

    const def = PETA_UNICODE_CURIGA[cp];
    if (def) {
      catat(kodeHex(cp), def.nama, def.kategori, i, def.bobotPerTemuan, def.maksBobot);
    }
  }

  // NBSP (U+00A0) baru dicurigai jika proporsinya tinggi terhadap total spasi.
  const totalSpasi = jumlahSpasiBiasa + jumlahNbsp;
  if (jumlahNbsp >= 6 && totalSpasi > 0 && jumlahNbsp / totalSpasi >= 0.12) {
    const idxPertama = cps.indexOf(0x00a0);
    kumpul.set('U+00A0', {
      kode: 'U+00A0',
      nama: `No-Break Space berdensitas tinggi (${Math.round((jumlahNbsp / totalSpasi) * 100)}% dari spasi)`,
      kategori: 'spasi_anomali',
      jumlah: jumlahNbsp,
      contoh: idxPertama >= 0 ? [cuplikanKonteks(cps, idxPertama)] : [],
      bobotPerTemuan: 3,
      maksBobot: 24,
    });
  }

  let skorTambahan = 0;
  let total = 0;
  const temuan: TemuanUnicode[] = [];
  const pesanTersembunyiTag = charTagAscii.length >= 2 ? charTagAscii.join('').slice(0, 160) : null;

  for (const item of Array.from(kumpul.values())) {
    total += item.jumlah;
    skorTambahan += Math.min(item.maksBobot, item.jumlah * item.bobotPerTemuan);
    const contoh = [...item.contoh];
    if (item.kode === 'U+E0000..E007F' && pesanTersembunyiTag) {
      contoh.unshift(`Pesan tersembunyi terdekode: "${pesanTersembunyiTag}"`);
    }
    temuan.push({
      kode: item.kode,
      nama: item.nama,
      kategori: item.kategori,
      jumlah: item.jumlah,
      contoh_konteks: contoh,
    });
  }

  temuan.sort((a, b) => b.jumlah - a.jumlah);
  return { temuan, total, skorTambahan: Math.min(90, skorTambahan), pesanTersembunyiTag };
}

function susunHasilForensik(
  temuanUnicode: TemuanUnicode[],
  unicodeTotal: number,
  skorUnicode: number,
  temuanMetadata: TemuanMetadata[],
  skorMeta: number,
  teksDiekstrak?: { teks: string; sumber: string } | null
): HasilForensikAi {
  const skor = Math.max(0, Math.min(100, Math.round(skorUnicode + skorMeta)));
  const adaBuktiTinggi =
    temuanMetadata.some((m) => m.bobot_curiga === 'tinggi') ||
    temuanUnicode.some((u) => u.kategori === 'steganografi_tag') ||
    skor >= 60;
  const adaBuktiSedang =
    temuanMetadata.some((m) => m.bobot_curiga === 'sedang') ||
    unicodeTotal > 0 ||
    skor >= 25;

  let tingkat: TingkatIndikasiAi = 'rendah';
  if (adaBuktiTinggi) tingkat = 'tinggi';
  else if (adaBuktiSedang) tingkat = 'sedang';

  const bagianRingkasan: string[] = [];
  if (unicodeTotal > 0) {
    bagianRingkasan.push(
      `Ditemukan ${unicodeTotal} karakter Unicode tak terlihat/anomali (${temuanUnicode.map((t) => `${t.kode} ×${t.jumlah}`).join(', ')})`
    );
  }
  const metaCuriga = temuanMetadata.filter((m) => m.bobot_curiga !== 'info');
  if (metaCuriga.length > 0) {
    bagianRingkasan.push(metaCuriga.map((m) => m.keterangan).join(' '));
  }

  const ringkasan =
    bagianRingkasan.length > 0
      ? bagianRingkasan.join('. ')
      : 'Tidak ditemukan watermark Unicode tak terlihat maupun tanda generator AI pada metadata berkas.';

  return {
    tingkat,
    skor_risiko: skor,
    ringkasan,
    unicode_total: unicodeTotal,
    temuan_unicode: temuanUnicode,
    temuan_metadata: temuanMetadata,
    ...(teksDiekstrak
      ? {
          statistik_teks: {
            jumlah_karakter: teksDiekstrak.teks.length,
            jumlah_kata: hitungKata(teksDiekstrak.teks),
            sumber_teks: teksDiekstrak.sumber,
          },
        }
      : {}),
    dipindai_pada: new Date().toISOString(),
  };
}

/** Pindai teks jawaban uraian yang diketik langsung oleh siswa. */
export function pindaiForensikTeks(teks: string, sumberLabel = 'Teks Jawaban Uraian'): HasilForensikAi {
  const u = pindaiUnicodeTeks(teks);
  return susunHasilForensik(u.temuan, u.total, u.skorTambahan, [], 0, { teks, sumber: sumberLabel });
}

function cuplikanAsciiBiner(bytes: Uint8Array): string {
  // Baca hingga 2 MB awal + 512 KB akhir agar pemindaian cepat untuk berkas besar (25 MB).
  const batasAwal = Math.min(bytes.length, 2 * 1024 * 1024);
  const dekoder = new TextDecoder('latin1');
  if (bytes.length <= batasAwal + 512 * 1024) {
    return dekoder.decode(bytes);
  }
  const awal = dekoder.decode(bytes.subarray(0, batasAwal));
  const akhir = dekoder.decode(bytes.subarray(bytes.length - 512 * 1024));
  return `${awal}\n${akhir}`;
}

function pindaiPenandaBinerAi(bytes: Uint8Array, temuanMeta: TemuanMetadata[]): number {
  let skor = 0;
  const raw = cuplikanAsciiBiner(bytes);

  if (/urn:c2pa|c2pa\.assertions|c2pa\.claim|c2pa\.actions/i.test(raw)) {
    skor += 70;
    temuanMeta.push({
      kunci: 'Content Credentials (C2PA / JUMBF)',
      nilai: 'Manifes urn:c2pa terdeteksi',
      bobot_curiga: 'tinggi',
      keterangan: 'Berkas memuat tanda kriptografis C2PA/Content Credentials yang umum disematkan oleh generator AI (ChatGPT/DALL-E, Adobe Firefly, Designer, Google).',
    });
  }

  if (/trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia/i.test(raw)) {
    skor += 75;
    temuanMeta.push({
      kunci: 'IPTC DigitalSourceType / SynthID',
      nilai: 'trainedAlgorithmicMedia',
      bobot_curiga: 'tinggi',
      keterangan: 'Metadata standar IPTC/SynthID menandai media ini dihasilkan oleh model algoritmik AI.',
    });
  }

  return skor;
}

function pindaiChunkPng(bytes: Uint8Array): { meta: TemuanMetadata[]; teksGabungan: string; skor: number } {
  const meta: TemuanMetadata[] = [];
  const teksPotongan: string[] = [];
  let skor = 0;

  // Magic PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return { meta, teksGabungan: '', skor };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  const utf8 = new TextDecoder('utf-8', { fatal: false });
  let pos = 8;

  while (pos + 12 <= bytes.length) {
    const len = view.getUint32(pos, false);
    const tipe = latin1.decode(bytes.subarray(pos + 4, pos + 8));
    const mulaiData = pos + 8;
    const akhirData = mulaiData + len;
    if (akhirData + 4 > bytes.length) break;

    if (tipe === 'tEXt' || tipe === 'zTXt' || tipe === 'iTXt') {
      const chunk = bytes.subarray(mulaiData, akhirData);
      const nol = chunk.indexOf(0);
      if (nol > 0) {
        const kunci = latin1.decode(chunk.subarray(0, nol)).trim();
        let isi = '';
        try {
          if (tipe === 'tEXt') {
            isi = utf8.decode(chunk.subarray(nol + 1));
          } else if (tipe === 'zTXt' && nol + 2 < chunk.length && chunk[nol + 1] === 0) {
            isi = utf8.decode(unzlibSync(chunk.subarray(nol + 2)));
          } else if (tipe === 'iTXt' && nol + 3 <= chunk.length) {
            const compFlag = chunk[nol + 1];
            let p = nol + 3;
            const nolBahasa = chunk.indexOf(0, p);
            if (nolBahasa >= 0) p = nolBahasa + 1;
            const nolTerjemah = chunk.indexOf(0, p);
            if (nolTerjemah >= 0) p = nolTerjemah + 1;
            const payload = chunk.subarray(p);
            isi = compFlag === 1 ? utf8.decode(unzlibSync(payload)) : utf8.decode(payload);
          }
        } catch {
          isi = '';
        }

        const isiRingkas = isi.trim();
        if (isiRingkas) {
          teksPotongan.push(isiRingkas);
          const curigaPromptSd =
            /^(parameters|prompt|workflow)$/i.test(kunci) ||
            (/\bSteps:\s*\d+/i.test(isiRingkas) && /\b(Sampler|CFG scale|Model hash):/i.test(isiRingkas));
          const cocokAi = POLA_ALAT_AI_TINGGI.exec(`${kunci} ${isiRingkas}`);

          if (curigaPromptSd || cocokAi) {
            skor += 70;
            meta.push({
              kunci: `PNG ${tipe} (${kunci})`,
              nilai: isiRingkas.slice(0, 220),
              bobot_curiga: 'tinggi',
              keterangan: curigaPromptSd
                ? `Chunk metadata PNG "${kunci}" berisi parameter prompt generator gambar AI (Stable Diffusion / ComfyUI).`
                : `Chunk metadata PNG "${kunci}" menyebut perangkat AI "${cocokAi?.[0]}".`,
            });
          } else if (/^(Software|Creator|Comment|Description|Source)$/i.test(kunci)) {
            meta.push({
              kunci: `PNG ${tipe} (${kunci})`,
              nilai: isiRingkas.slice(0, 180),
              bobot_curiga: 'info',
              keterangan: `Informasi pembuat pada chunk PNG (${kunci}).`,
            });
          }
        }
      }
    }

    if (tipe === 'IEND') break;
    pos = akhirData + 4;
  }

  return { meta, teksGabungan: teksPotongan.join('\n'), skor };
}

async function pindaiExifGambar(bytes: Uint8Array): Promise<{ meta: TemuanMetadata[]; teks: string; skor: number }> {
  const meta: TemuanMetadata[] = [];
  const teksList: string[] = [];
  let skor = 0;

  try {
    const data = await exifr.parse(bytes, {
      tiff: true,
      exif: true,
      xmp: true,
      iptc: true,
      icc: false,
      gps: false,
    });
    if (!data || typeof data !== 'object') return { meta, teks: '', skor };

    const bidangPeriksa: [string, unknown][] = [
      ['Software', data.Software],
      ['CreatorTool', data.CreatorTool],
      ['Make', data.Make],
      ['Model', data.Model],
      ['Artist', data.Artist ?? data.Creator],
      ['DigitalSourceType', data.DigitalSourceType],
      ['Credit', data.Credit],
      ['ImageDescription', data.ImageDescription ?? data.Description],
      ['UserComment', data.UserComment],
    ];

    for (const [nama, nilaiMentah] of bidangPeriksa) {
      if (nilaiMentah == null) continue;
      const nilai = (Array.isArray(nilaiMentah) ? nilaiMentah.join(', ') : String(nilaiMentah)).trim();
      if (!nilai) continue;
      teksList.push(nilai);

      const cocokAi = POLA_ALAT_AI_TINGGI.exec(nilai);
      if (cocokAi || /trainedAlgorithmicMedia/i.test(nilai)) {
        skor += 68;
        meta.push({
          kunci: `EXIF/XMP ${nama}`,
          nilai: nilai.slice(0, 200),
          bobot_curiga: 'tinggi',
          keterangan: `Metadata gambar (${nama}) menunjukkan tanda generator AI "${cocokAi?.[0] ?? 'trainedAlgorithmicMedia'}".`,
        });
      } else if (nama === 'Make' || nama === 'Model' || nama === 'Software' || nama === 'CreatorTool') {
        meta.push({
          kunci: `EXIF/XMP ${nama}`,
          nilai: nilai.slice(0, 160),
          bobot_curiga: 'info',
          keterangan: nama === 'Make' || nama === 'Model' ? 'Perangkat kamera yang terekam pada foto.' : 'Perangkat lunak penyunting/pembuat gambar.',
        });
      }
    }
  } catch {
    // Abaikan bila berkas gambar tidak memiliki blok EXIF/XMP standar.
  }

  return { meta, teks: teksList.join('\n'), skor };
}

function bersihkanXmlKeTeks(xml: string, tagBarisBaru: RegExp): string {
  return xml
    .replace(tagBarisBaru, '\n')
    .replace(/<w:tab\b[^>]*\/?>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    });
}

function ambilTagXml(xml: string, namaTag: string): string | null {
  const re = new RegExp(`<${namaTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${namaTag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function bongkarOfficeXml(bytes: Uint8Array, ext: string): {
  teks: string;
  meta: TemuanMetadata[];
  skor: number;
} {
  const meta: TemuanMetadata[] = [];
  let skor = 0;
  let arsip: Record<string, Uint8Array>;
  try {
    arsip = unzipSync(bytes);
  } catch {
    return { teks: '', meta, skor };
  }

  const potTeks: string[] = [];
  const namaEntri = Object.keys(arsip).sort();

  for (const nama of namaEntri) {
    if (
      nama === 'word/document.xml' ||
      /^word\/(header|footer)\d*\.xml$/i.test(nama) ||
      /^ppt\/slides\/slide\d+\.xml$/i.test(nama) ||
      nama === 'xl/sharedStrings.xml' ||
      nama === 'content.xml'
    ) {
      try {
        const xml = strFromU8(arsip[nama]);
        potTeks.push(bersihkanXmlKeTeks(xml, /<\/(w:p|a:p|text:p|si)>/gi));
      } catch {
        // Lewati entri XML yang gagal didekode.
      }
    }
  }

  const teks = potTeks.join('\n').trim();
  const jmlKata = hitungKata(teks);

  let aplikasi: string | null = null;
  let totalWaktuMenit: number | null = null;
  let revisi: number | null = null;
  let pembuat: string | null = null;

  if (arsip['docProps/app.xml']) {
    try {
      const appXml = strFromU8(arsip['docProps/app.xml']);
      aplikasi = ambilTagXml(appXml, 'Application');
      const tw = ambilTagXml(appXml, 'TotalTime');
      if (tw !== null && /^\d+$/.test(tw)) totalWaktuMenit = parseInt(tw, 10);
    } catch {
      // Abaikan
    }
  }

  if (arsip['docProps/core.xml']) {
    try {
      const coreXml = strFromU8(arsip['docProps/core.xml']);
      pembuat = ambilTagXml(coreXml, 'dc:creator') ?? ambilTagXml(coreXml, 'creator');
      const rev = ambilTagXml(coreXml, 'cp:revision') ?? ambilTagXml(coreXml, 'revision');
      if (rev !== null && /^\d+$/.test(rev)) revisi = parseInt(rev, 10);
    } catch {
      // Abaikan
    }
  }

  if (arsip['meta.xml']) {
    try {
      const metaXml = strFromU8(arsip['meta.xml']);
      aplikasi = aplikasi ?? ambilTagXml(metaXml, 'meta:generator');
      pembuat = pembuat ?? ambilTagXml(metaXml, 'dc:creator');
    } catch {
      // Abaikan
    }
  }

  if (aplikasi) {
    const cocokAi = POLA_ALAT_AI_TINGGI.exec(aplikasi);
    const cocokKonv = POLA_KONVERTER_OTOMATIS.exec(aplikasi);
    if (cocokAi) {
      skor += 68;
      meta.push({
        kunci: 'Aplikasi Pembuat Dokumen',
        nilai: aplikasi,
        bobot_curiga: 'tinggi',
        keterangan: `Metadata dokumen mencatat perangkat AI "${cocokAi[0]}".`,
      });
    } else if (cocokKonv) {
      skor += 30;
      meta.push({
        kunci: 'Aplikasi Pembuat Dokumen',
        nilai: aplikasi,
        bobot_curiga: 'sedang',
        keterangan: `Dokumen dihasilkan oleh konverter otomatis (${cocokKonv[0]}), lazim dipakai saat mengekspor hasil AI/Markdown ke ${ext.toUpperCase()}.`,
      });
    } else {
      meta.push({
        kunci: 'Aplikasi Pembuat Dokumen',
        nilai: aplikasi,
        bobot_curiga: 'info',
        keterangan: 'Aplikasi pengolah dokumen yang tercatat pada properti berkas.',
      });
    }
  }

  if (pembuat) {
    const cocokAi = POLA_ALAT_AI_TINGGI.exec(pembuat);
    meta.push({
      kunci: 'Pembuat (Creator)',
      nilai: pembuat.slice(0, 120),
      bobot_curiga: cocokAi ? 'tinggi' : 'info',
      keterangan: cocokAi ? `Nama pembuat dokumen menyebut layanan AI "${cocokAi[0]}".` : 'Nama akun pembuat pada properti dokumen.',
    });
    if (cocokAi) skor += 60;
  }

  if (totalWaktuMenit !== null) {
    const curigaTempel = totalWaktuMenit <= 1 && (revisi === null || revisi <= 2) && jmlKata >= 120;
    if (curigaTempel) {
      skor += 28;
      meta.push({
        kunci: 'Waktu Sunting & Revisi',
        nilai: `${totalWaktuMenit} menit · revisi ${revisi ?? '-'} · ${jmlKata} kata`,
        bobot_curiga: 'sedang',
        keterangan: `Dokumen memuat ${jmlKata} kata namun waktu sunting tercatat ${totalWaktuMenit} menit (revisi ${revisi ?? '-'}) — indikasi teks ditempel sekaligus (copy-paste) atau diekspor dari editor daring.`,
      });
    } else {
      meta.push({
        kunci: 'Waktu Sunting & Revisi',
        nilai: `${totalWaktuMenit} menit${revisi !== null ? ` · revisi ${revisi}` : ''}`,
        bobot_curiga: 'info',
        keterangan: 'Riwayat durasi penyuntingan pada properti Office.',
      });
    }
  }

  return { teks, meta, skor };
}

function dekodeHexPdf(hexMentah: string): string {
  const bersih = hexMentah.replace(/\s+/g, '');
  if (!bersih) return '';
  const pad = bersih.length % 2 === 1 ? `${bersih}0` : bersih;
  const buf = new Uint8Array(pad.length / 2);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = parseInt(pad.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16be', { fatal: false }).decode(buf.subarray(2));
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

function cariByteAscii(bytes: Uint8Array, pola: number[], mulai: number): number {
  const batas = bytes.length - pola.length;
  luar: for (let i = mulai; i <= batas; i++) {
    for (let j = 0; j < pola.length; j++) {
      if (bytes[i + j] !== pola[j]) continue luar;
    }
    return i;
  }
  return -1;
}

function ekstrakTeksPdfCadangan(bytes: Uint8Array): string {
  // Ekstraktor cadangan murni JS dari stream biner FlateDecode tanpa perantara Windows-1252 agar byte 0x80..0x9F utuh.
  const utf8 = new TextDecoder('utf-8', { fatal: false });
  const TOKEN_STREAM = [0x73, 0x74, 0x72, 0x65, 0x61, 0x6d]; // "stream"
  const TOKEN_ENDSTREAM = [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d]; // "endstream"
  const potongan: string[] = [];
  let kursor = 0;
  let hitung = 0;

  while (kursor < bytes.length && hitung < 60) {
    const idxStream = cariByteAscii(bytes, TOKEN_STREAM, kursor);
    if (idxStream < 0) break;
    // Pastikan bukan bagian dari kata "endstream"
    if (idxStream >= 3 && bytes[idxStream - 3] === 0x65 && bytes[idxStream - 2] === 0x6e && bytes[idxStream - 1] === 0x64) {
      kursor = idxStream + 6;
      continue;
    }

    let mulaiData = idxStream + 6;
    if (bytes[mulaiData] === 0x0d && bytes[mulaiData + 1] === 0x0a) mulaiData += 2;
    else if (bytes[mulaiData] === 0x0a || bytes[mulaiData] === 0x0d) mulaiData += 1;
    else {
      kursor = idxStream + 6;
      continue;
    }

    const idxEnd = cariByteAscii(bytes, TOKEN_ENDSTREAM, mulaiData);
    if (idxEnd < 0) break;

    let akhirData = idxEnd;
    if (akhirData >= 2 && bytes[akhirData - 2] === 0x0d && bytes[akhirData - 1] === 0x0a) akhirData -= 2;
    else if (akhirData >= 1 && (bytes[akhirData - 1] === 0x0a || bytes[akhirData - 1] === 0x0d)) akhirData -= 1;

    kursor = idxEnd + 9;
    if (akhirData <= mulaiData) continue;
    hitung++;

    const sliceBiner = bytes.subarray(mulaiData, akhirData);
    let dekomp = '';
    try {
      dekomp = utf8.decode(unzlibSync(sliceBiner));
    } catch {
      dekomp = utf8.decode(sliceBiner);
    }

    const reTj = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
    let mt: RegExpExecArray | null;
    while ((mt = reTj.exec(dekomp)) !== null) {
      potongan.push(mt[1].replace(/\\([()\\])/g, '$1'));
    }

    const reHexTj = /<([0-9a-fA-F\s]+)>\s*Tj/g;
    while ((mt = reHexTj.exec(dekomp)) !== null) {
      const teksHex = dekodeHexPdf(mt[1]);
      if (teksHex) potongan.push(teksHex);
    }

    const reTJ = /\[([\s\S]*?)\]\s*TJ/g;
    while ((mt = reTJ.exec(dekomp)) !== null) {
      const dalam = mt[1];
      const token = /\(([^()\\]*(?:\\.[^()\\]*)*)\)|<([0-9a-fA-F\s]+)>/g;
      let ms: RegExpExecArray | null;
      const baris: string[] = [];
      while ((ms = token.exec(dalam)) !== null) {
        if (ms[1] !== undefined) baris.push(ms[1].replace(/\\([()\\])/g, '$1'));
        else if (ms[2] !== undefined) baris.push(dekodeHexPdf(ms[2]));
      }
      if (baris.length) potongan.push(baris.join(''));
    }
  }
  return potongan.join(' ').trim();
}

export async function ekstrakTeksPdf(bytes: Uint8Array): Promise<string> {
  try {
    const mod: any = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfjs: any = mod?.getDocument ? mod : mod?.default ?? mod;
    if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }
    const diServer = typeof window === 'undefined';
    const tugas = pdfjs.getDocument({
      data: bytes.slice(),
      disableWorker: diServer,
      disableFontFace: diServer,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    });
    const dok = await tugas.promise;
    const maksHal = Math.min(dok.numPages || 0, 25);
    const halamanTeks: string[] = [];
    for (let h = 1; h <= maksHal; h++) {
      const page = await dok.getPage(h);
      const konten = await page.getTextContent();
      const baris = (konten.items || [])
        .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
        .join(' ');
      if (baris.trim()) halamanTeks.push(baris.trim());
    }
    try {
      await dok.destroy();
    } catch {
      // Abaikan
    }
    const gabung = halamanTeks.join('\n').trim();
    if (gabung) return gabung;
  } catch {
    // Lanjut ke ekstraktor cadangan
  }
  return ekstrakTeksPdfCadangan(bytes);
}

async function pindaiPdf(bytes: Uint8Array): Promise<{ teks: string; meta: TemuanMetadata[]; skor: number }> {
  const meta: TemuanMetadata[] = [];
  let skor = 0;

  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const bidang: [string, string | undefined][] = [
      ['Title', pdf.getTitle()],
      ['Author', pdf.getAuthor()],
      ['Subject', pdf.getSubject()],
      ['Creator', pdf.getCreator()],
      ['Producer', pdf.getProducer()],
      ['Keywords', pdf.getKeywords()],
    ];

    for (const [kunci, nilaiMentah] of bidang) {
      const nilai = (nilaiMentah ?? '').trim();
      if (!nilai) continue;
      const cocokAi = POLA_ALAT_AI_TINGGI.exec(nilai);
      const cocokKonv = POLA_KONVERTER_OTOMATIS.exec(nilai);
      if (cocokAi) {
        skor += 70;
        meta.push({
          kunci: `PDF ${kunci}`,
          nilai: nilai.slice(0, 180),
          bobot_curiga: 'tinggi',
          keterangan: `Properti PDF (${kunci}) menyebut platform AI "${cocokAi[0]}".`,
        });
      } else if (cocokKonv) {
        skor += 28;
        meta.push({
          kunci: `PDF ${kunci}`,
          nilai: nilai.slice(0, 180),
          bobot_curiga: 'sedang',
          keterangan: `PDF dibuat melalui konverter otomatis (${cocokKonv[0]}).`,
        });
      } else {
        meta.push({
          kunci: `PDF ${kunci}`,
          nilai: nilai.slice(0, 160),
          bobot_curiga: 'info',
          keterangan: `Metadata dokumen PDF (${kunci}).`,
        });
      }
    }

    meta.push({
      kunci: 'Jumlah Halaman PDF',
      nilai: `${pdf.getPageCount()} halaman`,
      bobot_curiga: 'info',
      keterangan: 'Total halaman pada dokumen PDF.',
    });
  } catch {
    // Abaikan bila header PDF non-standar
  }

  const teks = await ekstrakTeksPdf(bytes);
  return { teks, meta, skor };
}

/** Ekstrak teks yang dapat dibaca dari berkas dokumen/teks untuk keperluan koreksi AI & aturan rubrik. */
export async function ekstrakTeksBerkas(
  bytes: Uint8Array,
  namaFile: string,
  mimeType = ''
): Promise<string> {
  const ext = ekstensiFile(namaFile);
  const mime = mimeType.toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') {
    return ekstrakTeksPdf(bytes);
  }

  if (['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods'].includes(ext) || /officedocument|opendocument/.test(mime)) {
    return bongkarOfficeXml(bytes, ext || 'docx').teks;
  }

  if (['txt', 'md', 'csv', 'rtf'].includes(ext) || mime.startsWith('text/')) {
    const teks = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return ext === 'rtf' ? teks.replace(/\\[a-z]+\d*\s?|[{}]/gi, ' ').replace(/\s+/g, ' ').trim() : teks.trim();
  }

  return '';
}

/**
 * Pindai berkas mentah (sebelum kompresi) untuk mendeteksi:
 * 1) Watermark Unicode tak terlihat di dalam isi dokumen / metadata teks
 * 2) Tanda kriptografis & metadata generator AI (C2PA, SynthID, EXIF/XMP, PNG prompt chunk, PDF Producer, Office TotalTime)
 */
export async function pindaiForensikBerkas(
  bytes: Uint8Array,
  namaFile: string,
  mimeType = ''
): Promise<HasilForensikAi> {
  const ext = ekstensiFile(namaFile);
  const mime = mimeType.toLowerCase();
  const temuanMeta: TemuanMetadata[] = [];
  let skorMeta = pindaiPenandaBinerAi(bytes, temuanMeta);

  let teksUntukUnicode = '';
  let sumberTeks = '';

  const adalahGambar =
    mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(ext);
  const adalahPdf = mime === 'application/pdf' || ext === 'pdf';
  const adalahOffice =
    ['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods'].includes(ext) || /officedocument|opendocument/.test(mime);
  const adalahTeks = ['txt', 'md', 'csv', 'rtf'].includes(ext) || mime.startsWith('text/');

  if (adalahGambar) {
    const [hasilPng, hasilExif] = await Promise.all([
      Promise.resolve(pindaiChunkPng(bytes)),
      pindaiExifGambar(bytes),
    ]);
    temuanMeta.push(...hasilPng.meta, ...hasilExif.meta);
    skorMeta += hasilPng.skor + hasilExif.skor;
    teksUntukUnicode = [hasilPng.teksGabungan, hasilExif.teks].filter(Boolean).join('\n');
    sumberTeks = 'Metadata Gambar';
  } else if (adalahPdf) {
    const hasilPdf = await pindaiPdf(bytes);
    temuanMeta.push(...hasilPdf.meta);
    skorMeta += hasilPdf.skor;
    teksUntukUnicode = hasilPdf.teks;
    sumberTeks = 'Isi Dokumen PDF';
  } else if (adalahOffice) {
    const hasilOffice = bongkarOfficeXml(bytes, ext || 'docx');
    temuanMeta.push(...hasilOffice.meta);
    skorMeta += hasilOffice.skor;
    teksUntukUnicode = hasilOffice.teks;
    sumberTeks = `Isi Dokumen ${ext.toUpperCase() || 'Office'}`;
  } else if (adalahTeks) {
    teksUntukUnicode = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    sumberTeks = `Berkas Teks (${ext.toUpperCase() || 'TXT'})`;
  }

  const hasilUnicode = pindaiUnicodeTeks(teksUntukUnicode);
  return susunHasilForensik(
    hasilUnicode.temuan,
    hasilUnicode.total,
    hasilUnicode.skorTambahan,
    temuanMeta,
    skorMeta,
    teksUntukUnicode ? { teks: teksUntukUnicode, sumber: sumberTeks } : null
  );
}
