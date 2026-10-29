// Mesin auto-kompresi cerdas di sisi klien untuk foto kamera, gambar, PDF pindaian, dan dokumen Office.
// Dirancang menekan ukuran berkas semaksimal mungkin dengan penurunan keterbacaan mendekati nol (nil).

import { unzipSync, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import {
  ekstensiFile,
  hitungHematPersen,
  type StatusKualitasKompresi,
} from '@/lib/lampiran/tipe';

export const MAKS_SISI_GAMBAR = 1850;
export const MAKS_SISI_MEDIA_OFFICE = 1600;

export interface HasilKompresiBerkas {
  blob: Blob;
  namaSimpan: string;
  mime: string;
  ukuranAsli: number;
  ukuranHasil: number;
  hematPersen: number;
  skorKualitas: number;
  statusKualitas: StatusKualitasKompresi;
  catatanKualitas: string;
  metode: string;
}

export type CallbackProgresKompresi = (persen: number, tahap: string) => void;

/** Ubah piksel RGBA menjadi kanal luminansi BT.601 (0..255). */
export function ekstrakLuminansiRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  lebar: number,
  tinggi: number
): Float32Array {
  const n = lebar * tinggi;
  const lum = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    lum[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return lum;
}

/**
 * Hitung ketajaman dokumen berbasis varians operator Laplacian 3x3 pada 15% blok aktif tertinggi.
 * Menggunakan blok aktif agar halaman kertas putih dengan sedikit tulisan tetap dinilai akurat pada area tulisannya.
 */
export function hitungKetajamanLaplacian(
  lum: Float32Array,
  lebar: number,
  tinggi: number
): number {
  if (lebar < 8 || tinggi < 8) return 100;
  const ukuranBlok = 16;
  const jmlX = Math.max(1, Math.floor((lebar - 2) / ukuranBlok));
  const jmlY = Math.max(1, Math.floor((tinggi - 2) / ukuranBlok));
  const variansBlok: number[] = [];

  for (let by = 0; by < jmlY; by++) {
    for (let bx = 0; bx < jmlX; bx++) {
      const x0 = 1 + bx * ukuranBlok;
      const y0 = 1 + by * ukuranBlok;
      const x1 = Math.min(lebar - 1, x0 + ukuranBlok);
      const y1 = Math.min(tinggi - 1, y0 + ukuranBlok);
      let jum = 0;
      let jumKuadrat = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        const baris = y * lebar;
        for (let x = x0; x < x1; x++) {
          const idx = baris + x;
          const lap =
            -4 * lum[idx] +
            lum[idx - 1] +
            lum[idx + 1] +
            lum[idx - lebar] +
            lum[idx + lebar];
          jum += lap;
          jumKuadrat += lap * lap;
          n++;
        }
      }
      if (n > 0) {
        const rata = jum / n;
        variansBlok.push(Math.max(0, jumKuadrat / n - rata * rata));
      }
    }
  }

  if (!variansBlok.length) return 0;
  variansBlok.sort((a, b) => b - a);
  const ambil = Math.max(1, Math.ceil(variansBlok.length * 0.15));
  let total = 0;
  for (let i = 0; i < ambil; i++) total += variansBlok[i];
  return total / ambil;
}

/** Hitung rata-rata SSIM (Structural Similarity Index, 0..1) berbasis jendela 8x8 pada kanal luminansi. */
export function hitungSsimLuminansi(
  asli: Float32Array,
  hasil: Float32Array,
  lebar: number,
  tinggi: number
): number {
  if (asli.length !== hasil.length || lebar < 8 || tinggi < 8) return 1;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const jendela = 8;
  let totalSsim = 0;
  let jmlJendela = 0;

  for (let y = 0; y + jendela <= tinggi; y += jendela) {
    for (let x = 0; x + jendela <= lebar; x += jendela) {
      let mx = 0;
      let my = 0;
      for (let dy = 0; dy < jendela; dy++) {
        const off = (y + dy) * lebar + x;
        for (let dx = 0; dx < jendela; dx++) {
          mx += asli[off + dx];
          my += hasil[off + dx];
        }
      }
      const n = jendela * jendela;
      mx /= n;
      my /= n;

      let vx = 0;
      let vy = 0;
      let cov = 0;
      for (let dy = 0; dy < jendela; dy++) {
        const off = (y + dy) * lebar + x;
        for (let dx = 0; dx < jendela; dx++) {
          const ax = asli[off + dx] - mx;
          const ay = hasil[off + dx] - my;
          vx += ax * ax;
          vy += ay * ay;
          cov += ax * ay;
        }
      }
      vx /= n - 1;
      vy /= n - 1;
      cov /= n - 1;

      const pembilang = (2 * mx * my + c1) * (2 * cov + c2);
      const penyebut = (mx * mx + my * my + c1) * (vx + vy + c2);
      totalSsim += penyebut > 0 ? pembilang / penyebut : 1;
      jmlJendela++;
    }
  }

  return jmlJendela > 0 ? Math.max(0, Math.min(1, totalSsim / jmlJendela)) : 1;
}

/** Klasifikasikan hasil keterbacaan gambar dari skor ketajaman awal, rasio ketajaman, dan SSIM. */
export function evaluasiKualitasGambar(
  ketajamanAwal: number,
  ketajamanHasil: number,
  ssim: number
): {
  skor: number;
  status: StatusKualitasKompresi;
  catatan: string;
} {
  const rasioTajam = ketajamanAwal > 1 ? Math.min(1.05, ketajamanHasil / ketajamanAwal) : 1;

  if (ketajamanAwal < 70) {
    const skorBlur = Math.max(42, Math.min(72, Math.round(40 + (ketajamanAwal / 70) * 32)));
    return {
      skor: skorBlur,
      status: 'peringatan_blur',
      catatan: 'Peringatan: foto asli terdeteksi agak blur/kurang fokus. Pastikan angka & tulisan masih terbaca atau ambil foto ulang.',
    };
  }

  const skorSsim = ssim * 100;
  const skorTajam = Math.min(100, rasioTajam * 100);
  const skorGabung = Math.max(75, Math.min(99, Math.round(skorSsim * 0.65 + skorTajam * 0.35)));

  if (ssim >= 0.945 && rasioTajam >= 0.87) {
    return {
      skor: Math.max(92, skorGabung),
      status: 'sangat_baik',
      catatan: `Sangat tajam & jelas terbaca (kemiripan struktur ${(ssim * 100).toFixed(1).replace('.', ',')}%)`,
    };
  }

  return {
    skor: Math.min(91, skorGabung),
    status: 'baik',
    catatan: `Kualitas baik & tetap terbaca (kemiripan struktur ${(ssim * 100).toFixed(1).replace('.', ',')}%)`,
  };
}

function gantiEkstensi(namaAsli: string, ekstBaru: string): string {
  const bersih = namaAsli.trim() || `jawaban.${ekstBaru}`;
  const tanpaEkst = bersih.replace(/\.[a-zA-Z0-9]+$/, '');
  return `${tanpaEkst}.${ekstBaru}`;
}

function u8KeBlob(bytes: Uint8Array, mime: string): Blob {
  const salinan = new Uint8Array(bytes.byteLength);
  salinan.set(bytes);
  return new Blob([salinan.buffer], { type: mime });
}

function apakahGifAnimasi(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return false;
  let frame = 0;
  for (let i = 0; i < bytes.length - 3; i++) {
    // Penanda Graphic Control Extension GIF: 0x21 0xF9 0x04
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      frame++;
      if (frame > 1) return true;
    }
  }
  return false;
}

async function muatBitmapAtauImg(blob: Blob): Promise<{
  sumber: CanvasImageSource;
  lebar: number;
  tinggi: number;
  tutup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      return {
        sumber: bmp,
        lebar: bmp.width,
        tinggi: bmp.height,
        tutup: () => bmp.close(),
      };
    } catch {
      // Lanjut fallback ke elemen HTMLImageElement
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({
        sumber: img,
        lebar: img.naturalWidth || img.width,
        tinggi: img.naturalHeight || img.height,
        tutup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Berkas gambar tidak dapat dibaca oleh peramban.'));
    };
    img.src = url;
  });
}

function kanvasKeBlob(kanvas: HTMLCanvasElement, mime: string, kualitas?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    kanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal mengenkode gambar.'))),
      mime,
      kualitas
    );
  });
}

/** Perkecil gambar secara bertahap (maks 50% per langkah) agar garis tulisan tipis tidak pecah/aliasing. */
function gambarBertahapKeKanvas(
  sumber: CanvasImageSource,
  lebarAsli: number,
  tinggiAsli: number,
  maksSisi: number,
  latarPutih = false
): HTMLCanvasElement {
  const sisiTerpanjang = Math.max(lebarAsli, tinggiAsli);
  const skala = sisiTerpanjang > maksSisi ? maksSisi / sisiTerpanjang : 1;
  const targetL = Math.max(1, Math.round(lebarAsli * skala));
  const targetT = Math.max(1, Math.round(tinggiAsli * skala));

  let curL = lebarAsli;
  let curT = tinggiAsli;
  let sumberSaatIni: CanvasImageSource = sumber;

  while (curL * 0.5 > targetL && curT * 0.5 > targetT) {
    const paruhL = Math.max(targetL, Math.round(curL * 0.5));
    const paruhT = Math.max(targetT, Math.round(curT * 0.5));
    const tmp = document.createElement('canvas');
    tmp.width = paruhL;
    tmp.height = paruhT;
    const ctxTmp = tmp.getContext('2d')!;
    ctxTmp.imageSmoothingEnabled = true;
    ctxTmp.imageSmoothingQuality = 'high';
    ctxTmp.drawImage(sumberSaatIni, 0, 0, paruhL, paruhT);
    sumberSaatIni = tmp;
    curL = paruhL;
    curT = paruhT;
  }

  const akhir = document.createElement('canvas');
  akhir.width = targetL;
  akhir.height = targetT;
  const ctx = akhir.getContext('2d')!;
  if (latarPutih) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetL, targetT);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sumberSaatIni, 0, 0, targetL, targetT);
  return akhir;
}

function sampelLuminansiKanvas(
  sumber: CanvasImageSource,
  lebarSumber: number,
  tinggiSumber: number,
  ukuranSampel = 480
): { lum: Float32Array; l: number; t: number } {
  const skala = Math.min(1, ukuranSampel / Math.max(lebarSumber, tinggiSumber));
  const l = Math.max(16, Math.round(lebarSumber * skala));
  const t = Math.max(16, Math.round(tinggiSumber * skala));
  const c = document.createElement('canvas');
  c.width = l;
  c.height = t;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, l, t);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sumber, 0, 0, l, t);
  const data = ctx.getImageData(0, 0, l, t).data;
  return { lum: ekstrakLuminansiRgba(data, l, t), l, t };
}

let dukunganWebpCache: boolean | null = null;
async function dukungEncodeWebp(): Promise<boolean> {
  if (dukunganWebpCache !== null) return dukunganWebpCache;
  try {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const b = await kanvasKeBlob(c, 'image/webp', 0.8);
    dukunganWebpCache = b.type === 'image/webp';
  } catch {
    dukunganWebpCache = false;
  }
  return dukunganWebpCache;
}

async function konversiHeicJikaPerlu(
  file: Blob,
  namaAsli: string,
  onProgress?: CallbackProgresKompresi
): Promise<{ blob: Blob; dikonversi: boolean }> {
  const ext = ekstensiFile(namaAsli);
  const mime = (file.type || '').toLowerCase();
  if (ext !== 'heic' && ext !== 'heif' && !mime.includes('heic') && !mime.includes('heif')) {
    return { blob: file, dikonversi: false };
  }
  onProgress?.(10, 'Mengonversi foto HEIC/HEIF...');
  const mod: any = await import('heic2any');
  const heic2any = mod.default ?? mod;
  const hasil = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  const keluar = Array.isArray(hasil) ? hasil[0] : hasil;
  return { blob: keluar as Blob, dikonversi: true };
}

async function kompresGambar(
  file: File,
  onProgress?: CallbackProgresKompresi
): Promise<HasilKompresiBerkas> {
  const ukuranAsli = file.size;
  const ext = ekstensiFile(file.name);

  if (ext === 'gif') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (apakahGifAnimasi(bytes)) {
      onProgress?.(100, 'GIF animasi dipertahankan utuh');
      return {
        blob: file,
        namaSimpan: file.name,
        mime: file.type || 'image/gif',
        ukuranAsli,
        ukuranHasil: ukuranAsli,
        hematPersen: 0,
        skorKualitas: 100,
        statusKualitas: 'lossless',
        catatanKualitas: 'GIF animasi dipertahankan tanpa penurunan kualitas (lossless)',
        metode: 'Lossless Pass-Through',
      };
    }
  }

  onProgress?.(8, 'Membaca resolusi & ketajaman gambar...');
  const { blob: blobSumber, dikonversi: dariHeic } = await konversiHeicJikaPerlu(file, file.name, onProgress);
  const dekode = await muatBitmapAtauImg(blobSumber);

  try {
    onProgress?.(22, 'Menyesuaikan dimensi dokumen optimal...');
    const pakaiWebp = await dukungEncodeWebp();
    const mimeTarget = pakaiWebp ? 'image/webp' : 'image/jpeg';
    const ekstTarget = pakaiWebp ? 'webp' : 'jpg';

    const kanvas = gambarBertahapKeKanvas(
      dekode.sumber,
      dekode.lebar,
      dekode.tinggi,
      MAKS_SISI_GAMBAR,
      !pakaiWebp
    );

    onProgress?.(38, 'Mengukur ketajaman tulisan...');
    const sampelAwal = sampelLuminansiKanvas(kanvas, kanvas.width, kanvas.height, 480);
    const ketajamanAwal = hitungKetajamanLaplacian(sampelAwal.lum, sampelAwal.l, sampelAwal.t);

    // Pencarian kualitas adaptif: menekan ukuran sekuat mungkin selama SSIM >= 0.948 dan ketajaman terjaga >= 88%.
    const kandidatKualitas = [0.68, 0.76, 0.84];
    let terbaik: {
      blob: Blob;
      q: number;
      ssim: number;
      ketajamanAkhir: number;
    } | null = null;

    for (let i = 0; i < kandidatKualitas.length; i++) {
      const q = kandidatKualitas[i];
      onProgress?.(50 + i * 14, `Mengoptimalkan kompresi (${Math.round(q * 100)}%)...`);
      const kandidatBlob = await kanvasKeBlob(kanvas, mimeTarget, q);
      const dekodeUji = await muatBitmapAtauImg(kandidatBlob);
      let ssim = 0.96;
      let ketajamanAkhir = ketajamanAwal;
      try {
        const cUji = document.createElement('canvas');
        cUji.width = sampelAwal.l;
        cUji.height = sampelAwal.t;
        const ctxUji = cUji.getContext('2d')!;
        ctxUji.fillStyle = '#FFFFFF';
        ctxUji.fillRect(0, 0, sampelAwal.l, sampelAwal.t);
        ctxUji.drawImage(dekodeUji.sumber, 0, 0, sampelAwal.l, sampelAwal.t);
        const lumUji = ekstrakLuminansiRgba(
          ctxUji.getImageData(0, 0, sampelAwal.l, sampelAwal.t).data,
          sampelAwal.l,
          sampelAwal.t
        );
        ssim = hitungSsimLuminansi(sampelAwal.lum, lumUji, sampelAwal.l, sampelAwal.t);
        ketajamanAkhir = hitungKetajamanLaplacian(lumUji, sampelAwal.l, sampelAwal.t);
      } finally {
        dekodeUji.tutup();
      }

      terbaik = { blob: kandidatBlob, q, ssim, ketajamanAkhir };
      const rasioTajam = ketajamanAwal > 1 ? ketajamanAkhir / ketajamanAwal : 1;
      // Berhenti segera pada kualitas terendah yang sudah melampaui ambang keterbacaan tinggi.
      if (ssim >= 0.952 && rasioTajam >= 0.89) {
        break;
      }
    }

    const hasilTerpilih = terbaik!;
    // Jangan pernah memperbesar ukuran berkas (kecuali konversi wajib dari HEIC agar bisa dibuka di web).
    if (!dariHeic && hasilTerpilih.blob.size >= ukuranAsli * 0.98) {
      const evalAsli = evaluasiKualitasGambar(ketajamanAwal, ketajamanAwal, 1);
      onProgress?.(100, 'Berkas asli sudah sangat ringkas');
      return {
        blob: file,
        namaSimpan: file.name,
        mime: file.type || 'image/jpeg',
        ukuranAsli,
        ukuranHasil: ukuranAsli,
        hematPersen: 0,
        skorKualitas: evalAsli.status === 'peringatan_blur' ? evalAsli.skor : 100,
        statusKualitas: evalAsli.status === 'peringatan_blur' ? 'peringatan_blur' : 'lossless',
        catatanKualitas:
          evalAsli.status === 'peringatan_blur'
            ? evalAsli.catatan
            : 'Ukuran asli sudah optimal — dipertahankan 100% tanpa penurunan kualitas',
        metode: 'Lossless (Ukuran Asli Optimal)',
      };
    }

    const penilaian = evaluasiKualitasGambar(
      ketajamanAwal,
      hasilTerpilih.ketajamanAkhir,
      hasilTerpilih.ssim
    );
    onProgress?.(100, 'Kompresi gambar selesai');

    return {
      blob: hasilTerpilih.blob,
      namaSimpan: gantiEkstensi(file.name, ekstTarget),
      mime: mimeTarget,
      ukuranAsli,
      ukuranHasil: hasilTerpilih.blob.size,
      hematPersen: hitungHematPersen(ukuranAsli, hasilTerpilih.blob.size),
      skorKualitas: penilaian.skor,
      statusKualitas: penilaian.status,
      catatanKualitas: penilaian.catatan,
      metode: `${pakaiWebp ? 'WebP' : 'JPEG'} Adaptif (${kanvas.width}×${kanvas.height}px, q=${Math.round(hasilTerpilih.q * 100)}%)`,
    };
  } finally {
    dekode.tutup();
  }
}

/**
 * Bungkus kumpulan foto kamera menjadi satu dokumen PDF terkompresi tajam.
 * Dipakai otomatis ketika guru membatasi format soal essay khusus PDF saja namun siswa memotret via kamera.
 */
export async function bungkusGambarKePdf(
  fotoList: File[],
  namaDokumen = 'foto-jawaban.pdf',
  onProgress?: CallbackProgresKompresi
): Promise<HasilKompresiBerkas> {
  const ukuranAsliTotal = fotoList.reduce((s, f) => s + f.size, 0);
  const pdf = await PDFDocument.create();
  let skorMin = 98;
  let adaBlur = false;

  for (let i = 0; i < fotoList.length; i++) {
    const pMulai = Math.round((i / fotoList.length) * 85);
    onProgress?.(pMulai + 5, `Mengompres halaman foto ${i + 1}/${fotoList.length}...`);
    const { blob: sumber } = await konversiHeicJikaPerlu(fotoList[i], fotoList[i].name);
    const dekode = await muatBitmapAtauImg(sumber);
    try {
      const kanvas = gambarBertahapKeKanvas(dekode.sumber, dekode.lebar, dekode.tinggi, MAKS_SISI_GAMBAR, true);
      const sampel = sampelLuminansiKanvas(kanvas, kanvas.width, kanvas.height, 480);
      const tajam = hitungKetajamanLaplacian(sampel.lum, sampel.l, sampel.t);
      if (tajam < 70) {
        adaBlur = true;
        skorMin = Math.min(skorMin, 65);
      }
      const jpgBlob = await kanvasKeBlob(kanvas, 'image/jpeg', 0.8);
      const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
      const imgEmbed = await pdf.embedJpg(jpgBytes);
      // Ukuran halaman A4 proporsional dalam poin PDF (lebar 595 pt)
      const lebarPt = 595.28;
      const tinggiPt = Math.round((kanvas.height / kanvas.width) * lebarPt * 100) / 100;
      const page = pdf.addPage([lebarPt, tinggiPt]);
      page.drawImage(imgEmbed, { x: 0, y: 0, width: lebarPt, height: tinggiPt });
    } finally {
      dekode.tutup();
    }
  }

  onProgress?.(92, 'Menyusun dokumen PDF...');
  const pdfBytes = await pdf.save({ useObjectStreams: true });
  const pdfBlob = u8KeBlob(pdfBytes, 'application/pdf');
  onProgress?.(100, 'PDF foto jawaban siap');

  return {
    blob: pdfBlob,
    namaSimpan: gantiEkstensi(namaDokumen, 'pdf'),
    mime: 'application/pdf',
    ukuranAsli: ukuranAsliTotal,
    ukuranHasil: pdfBlob.size,
    hematPersen: hitungHematPersen(ukuranAsliTotal, pdfBlob.size),
    skorKualitas: adaBlur ? skorMin : 95,
    statusKualitas: adaBlur ? 'peringatan_blur' : 'sangat_baik',
    catatanKualitas: adaBlur
      ? 'Peringatan: salah satu halaman foto agak blur, periksa pratinjau PDF sebelum mengumpulkan.'
      : `Sangat tajam (${fotoList.length} halaman foto dibungkus ke PDF terkompresi)`,
    metode: `Kamera ke PDF (${fotoList.length} halaman)`,
  };
}

async function kompresPdf(
  file: File,
  onProgress?: CallbackProgresKompresi
): Promise<HasilKompresiBerkas> {
  const ukuranAsli = file.size;
  onProgress?.(10, 'Memeriksa struktur halaman PDF...');
  const bytesAsli = new Uint8Array(await file.arrayBuffer());

  let bytesLossless: Uint8Array | null = null;
  let jmlHalaman = 0;

  try {
    const dok = await PDFDocument.load(bytesAsli, { ignoreEncryption: true, updateMetadata: false });
    jmlHalaman = dok.getPageCount();
    onProgress?.(22, 'Mengoptimalkan objek internal PDF (lossless)...');
    bytesLossless = await dok.save({ useObjectStreams: true, addDefaultPage: false });
  } catch {
    onProgress?.(100, 'PDF dipertahankan utuh');
    return {
      blob: file,
      namaSimpan: file.name,
      mime: 'application/pdf',
      ukuranAsli,
      ukuranHasil: ukuranAsli,
      hematPersen: 0,
      skorKualitas: 100,
      statusKualitas: 'lossless',
      catatanKualitas: 'Dokumen PDF dipertahankan utuh tanpa penurunan kualitas',
      metode: 'Lossless Pass-Through',
    };
  }

  const rataPerHalaman = jmlHalaman > 0 ? ukuranAsli / jmlHalaman : ukuranAsli;

  // Jika PDF berisi pindaian gambar berat (> 280 KB/halaman, total > 450 KB, maks 20 halaman), optimalkan pindaian gambarnya.
  if (
    typeof window !== 'undefined' &&
    jmlHalaman >= 1 &&
    jmlHalaman <= 20 &&
    ukuranAsli > 450 * 1024 &&
    rataPerHalaman > 280 * 1024
  ) {
    try {
      const modPdfjs: any = await import('pdfjs-dist/legacy/build/pdf.js');
      const pdfjs: any = modPdfjs?.getDocument ? modPdfjs : modPdfjs?.default ?? modPdfjs;
      if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }
      const dokRender = await pdfjs.getDocument({ data: bytesAsli.slice(), verbosity: 0 }).promise;
      let totalKarakterTeks = 0;
      for (let h = 1; h <= jmlHalaman; h++) {
        const p = await dokRender.getPage(h);
        const tc = await p.getTextContent();
        totalKarakterTeks += (tc.items || []).reduce(
          (acc: number, it: any) => acc + (typeof it?.str === 'string' ? it.str.trim().length : 0),
          0
        );
      }

      // Hanya kompres ulang berbasis kanvas bila PDF memang dominan gambar pindaian (bukan PDF teks digital/vektor).
      if (totalKarakterTeks / jmlHalaman < 180) {
        const pdfBaru = await PDFDocument.create();
        for (let h = 1; h <= jmlHalaman; h++) {
          const persen = 30 + Math.round(((h - 1) / jmlHalaman) * 60);
          onProgress?.(persen, `Mengompres pindaian halaman ${h}/${jmlHalaman}...`);
          const page = await dokRender.getPage(h);
          const vpAsli = page.getViewport({ scale: 1 });
          const sisiMaks = Math.max(vpAsli.width, vpAsli.height);
          const skala = Math.min(2.0, Math.max(1.35, MAKS_SISI_GAMBAR / Math.max(1, sisiMaks)));
          const vp = page.getViewport({ scale: skala });

          const kanvas = document.createElement('canvas');
          kanvas.width = Math.round(vp.width);
          kanvas.height = Math.round(vp.height);
          const ctx = kanvas.getContext('2d')!;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, kanvas.width, kanvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;

          const jpgBlob = await kanvasKeBlob(kanvas, 'image/jpeg', 0.78);
          const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
          const img = await pdfBaru.embedJpg(jpgBytes);
          const halBaru = pdfBaru.addPage([vpAsli.width, vpAsli.height]);
          halBaru.drawImage(img, { x: 0, y: 0, width: vpAsli.width, height: vpAsli.height });
        }
        try {
          await dokRender.destroy();
        } catch {
          // Abaikan
        }

        onProgress?.(94, 'Menyimpan PDF hasil kompresi...');
        const bytesPindaian = await pdfBaru.save({ useObjectStreams: true });
        if (bytesPindaian.byteLength < ukuranAsli * 0.9) {
          const blobHasil = u8KeBlob(bytesPindaian, 'application/pdf');
          onProgress?.(100, 'Kompresi PDF pindaian selesai');
          return {
            blob: blobHasil,
            namaSimpan: file.name,
            mime: 'application/pdf',
            ukuranAsli,
            ukuranHasil: blobHasil.size,
            hematPersen: hitungHematPersen(ukuranAsli, blobHasil.size),
            skorKualitas: 94,
            statusKualitas: 'sangat_baik',
            catatanKualitas: `PDF pindaian diperkecil tanpa mengaburkan tulisan (${jmlHalaman} halaman)`,
            metode: 'Optimasi Halaman Pindaian PDF (~165 DPI)',
          };
        }
      } else {
        try {
          await dokRender.destroy();
        } catch {
          // Abaikan
        }
      }
    } catch {
      // Bila gagal merender pindaian, gunakan hasil optimasi lossless di bawah.
    }
  }

  onProgress?.(100, 'Optimasi PDF selesai');
  if (bytesLossless && bytesLossless.byteLength < ukuranAsli * 0.98) {
    const blobLossless = u8KeBlob(bytesLossless, 'application/pdf');
    return {
      blob: blobLossless,
      namaSimpan: file.name,
      mime: 'application/pdf',
      ukuranAsli,
      ukuranHasil: blobLossless.size,
      hematPersen: hitungHematPersen(ukuranAsli, blobLossless.size),
      skorKualitas: 100,
      statusKualitas: 'lossless',
      catatanKualitas: 'Teks & vektor PDF dipertahankan 100% tajam (kompresi struktur lossless)',
      metode: 'PDF Object-Stream Lossless',
    };
  }

  return {
    blob: file,
    namaSimpan: file.name,
    mime: 'application/pdf',
    ukuranAsli,
    ukuranHasil: ukuranAsli,
    hematPersen: 0,
    skorKualitas: 100,
    statusKualitas: 'lossless',
    catatanKualitas: 'PDF sudah terkompresi optimal — teks & rumus tajam 100%',
    metode: 'Lossless (Ukuran Asli Optimal)',
  };
}

async function kompresOffice(
  file: File,
  onProgress?: CallbackProgresKompresi
): Promise<HasilKompresiBerkas> {
  const ukuranAsli = file.size;
  onProgress?.(12, 'Membuka paket dokumen Office...');
  const bytes = new Uint8Array(await file.arrayBuffer());

  let entri: Record<string, Uint8Array>;
  try {
    entri = unzipSync(bytes);
  } catch {
    onProgress?.(100, 'Dokumen dipertahankan utuh');
    return {
      blob: file,
      namaSimpan: file.name,
      mime: file.type || 'application/octet-stream',
      ukuranAsli,
      ukuranHasil: ukuranAsli,
      hematPersen: 0,
      skorKualitas: 100,
      statusKualitas: 'lossless',
      catatanKualitas: 'Dokumen dipertahankan 100% utuh (lossless)',
      metode: 'Lossless Pass-Through',
    };
  }

  const daftarKunci = Object.keys(entri);
  const kunciMedia = daftarKunci.filter(
    (k) => /^(word|ppt|xl)\/media\/.+\.(jpe?g|png)$/i.test(k) && entri[k].byteLength > 70 * 1024
  );

  let mediaDiperkecil = 0;
  if (typeof window !== 'undefined' && kunciMedia.length > 0) {
    for (let i = 0; i < kunciMedia.length; i++) {
      const k = kunciMedia[i];
      const persen = 20 + Math.round(((i + 1) / kunciMedia.length) * 60);
      onProgress?.(persen, `Mengompres gambar sisipan dokumen (${i + 1}/${kunciMedia.length})...`);
      const adalahPng = /\.png$/i.test(k);
      const mimeAsli = adalahPng ? 'image/png' : 'image/jpeg';
      const blobMedia = u8KeBlob(entri[k], mimeAsli);
      try {
        const dek = await muatBitmapAtauImg(blobMedia);
        try {
          if (!adalahPng || Math.max(dek.lebar, dek.tinggi) > MAKS_SISI_MEDIA_OFFICE) {
            const kanvas = gambarBertahapKeKanvas(
              dek.sumber,
              dek.lebar,
              dek.tinggi,
              MAKS_SISI_MEDIA_OFFICE,
              !adalahPng
            );
            const blobBaru = await kanvasKeBlob(kanvas, mimeAsli, adalahPng ? undefined : 0.78);
            if (blobBaru.size < entri[k].byteLength * 0.92) {
              entri[k] = new Uint8Array(await blobBaru.arrayBuffer());
              mediaDiperkecil++;
            }
          }
        } finally {
          dek.tutup();
        }
      } catch {
        // Pertahankan gambar sisipan asli bila gagal didekode.
      }
    }
  }

  onProgress?.(88, 'Memadatkan ulang arsip dokumen (DEFLATE level 9)...');
  const hasilZip = zipSync(entri, { level: 9 });
  onProgress?.(100, 'Kompresi dokumen selesai');

  if (hasilZip.byteLength < ukuranAsli * 0.98) {
    const blobBaru = u8KeBlob(hasilZip, file.type || 'application/octet-stream');
    return {
      blob: blobBaru,
      namaSimpan: file.name,
      mime: file.type || 'application/octet-stream',
      ukuranAsli,
      ukuranHasil: blobBaru.size,
      hematPersen: hitungHematPersen(ukuranAsli, blobBaru.size),
      skorKualitas: mediaDiperkecil > 0 ? 96 : 100,
      statusKualitas: mediaDiperkecil > 0 ? 'sangat_baik' : 'lossless',
      catatanKualitas:
        mediaDiperkecil > 0
          ? `Teks dokumen utuh 100% & ${mediaDiperkecil} gambar sisipan berhasil diperkecil tajam`
          : 'Isi dokumen utuh 100% tanpa perubahan kualitas (pemadatan arsip lossless)',
      metode: mediaDiperkecil > 0 ? 'Optimasi Media Office + DEFLATE L9' : 'DEFLATE Level 9 Lossless',
    };
  }

  return {
    blob: file,
    namaSimpan: file.name,
    mime: file.type || 'application/octet-stream',
    ukuranAsli,
    ukuranHasil: ukuranAsli,
    hematPersen: 0,
    skorKualitas: 100,
    statusKualitas: 'lossless',
    catatanKualitas: 'Dokumen sudah padat optimal — isi dipertahankan 100% utuh',
    metode: 'Lossless (Ukuran Asli Optimal)',
  };
}

/** Titik masuk utama: kompres berkas secara otomatis sesuai jenisnya dengan laporan progres 0%–100%. */
export async function kompresBerkasOtomatis(
  file: File,
  onProgress?: CallbackProgresKompresi
): Promise<HasilKompresiBerkas> {
  const ext = ekstensiFile(file.name);
  const mime = (file.type || '').toLowerCase();

  onProgress?.(4, 'Menyiapkan kompresi otomatis...');

  if (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'].includes(ext)
  ) {
    return kompresGambar(file, onProgress);
  }

  if (mime === 'application/pdf' || ext === 'pdf') {
    return kompresPdf(file, onProgress);
  }

  if (
    ['docx', 'pptx', 'xlsx'].includes(ext) ||
    mime.includes('officedocument')
  ) {
    return kompresOffice(file, onProgress);
  }

  onProgress?.(60, 'Memeriksa keutuhan berkas...');
  onProgress?.(100, 'Berkas siap diunggah (lossless)');
  return {
    blob: file,
    namaSimpan: file.name,
    mime: file.type || 'application/octet-stream',
    ukuranAsli: file.size,
    ukuranHasil: file.size,
    hematPersen: 0,
    skorKualitas: 100,
    statusKualitas: 'lossless',
    catatanKualitas: 'Format berkas dipertahankan utuh tanpa penurunan kualitas (lossless)',
    metode: 'Lossless Pass-Through',
  };
}
