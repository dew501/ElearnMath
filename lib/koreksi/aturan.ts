// Mesin koreksi berbasis aturan (tanpa internet): kunci PG, rubrik angka/kata/panjang, dan kemiripan dengan
// jawaban ideal. Dipakai sebagai cadangan bila AI tidak tersedia, dan sebagai pembanding hasil AI.
import type { HasilKoreksi, HasilKriteria, HasilSoal, SoalKoreksi, Tingkat } from './tipe';
import { angkaCocok, angkaDari, jumlahKata, kataCocok } from './teks';
import { cakupanIdeal } from './kemiripan';

const bulat = (x: number) => Math.round(x * 2) / 2;

export function nilaiPg(soal: SoalKoreksi, jawaban: string | undefined): HasilSoal {
  const j = (jawaban ?? '').trim().toUpperCase();
  const kunci = (soal.kunci_jawaban ?? '').trim().toUpperCase();
  const benar = !!j && !!kunci && j === kunci;
  return {
    id_soal: soal.id,
    nomor: soal.nomor,
    tipe: 'pg',
    skor: benar ? soal.bobot : 0,
    maks: soal.bobot,
    alasan: !j ? 'Tidak dijawab.' : benar ? `Benar (${kunci}).` : `Salah: menjawab ${j}, kunci ${kunci || '-'}.`,
  };
}

export function nilaiUraian(soal: SoalKoreksi, jawaban: string | undefined): HasilSoal & { ambigu?: boolean } {
  const teks = (jawaban ?? '').trim();
  const dasar = { id_soal: soal.id, nomor: soal.nomor, tipe: 'essay' as const, maks: soal.bobot };
  if (!teks) return { ...dasar, skor: 0, alasan: 'Tidak dijawab.' };

  const rubrik = (soal.rubrik ?? []).filter((k) => k && Number(k.poin) > 0);
  if (rubrik.length) {
    const angkaJawaban = angkaDari(teks);
    const angkaSoal = angkaDari(soal.pertanyaan);
    let ambigu = false;
    const kriteria: HasilKriteria[] = rubrik.map((k) => {
      let ok = false;
      if (k.jenis === 'angka') {
        const target = Number(String(k.nilai).replace(',', '.'));
        ok = Number.isFinite(target) && angkaCocok(angkaJawaban, target, Number(k.toleransi ?? 0));
        // Angka yang juga tertulis di soal bisa saja hanya disalin, bukan hasil hitungan
        if (ok && angkaCocok(angkaSoal, target, Number(k.toleransi ?? 0))) ambigu = true;
      } else if (k.jenis === 'kata') {
        ok = kataCocok(teks, String(k.nilai ?? ''));
      } else if (k.jenis === 'panjang') {
        ok = jumlahKata(teks) >= Number(k.nilai || 0);
      }
      return { label: k.label || String(k.nilai), ok, poin: Number(k.poin) };
    });
    const total = kriteria.reduce((s, k) => s + k.poin, 0);
    const dapat = kriteria.filter((k) => k.ok).reduce((s, k) => s + k.poin, 0);
    const skor = total ? bulat((dapat / total) * soal.bobot) : 0;
    const daftar = (ok: boolean) => kriteria.filter((k) => k.ok === ok).map((k) => k.label).join(', ');
    const alasan = [daftar(true) && `Terpenuhi: ${daftar(true)}.`, daftar(false) && `Belum: ${daftar(false)}.`].filter(Boolean).join(' ') + (ambigu ? ' (sebagian angka juga ada di soal — periksa manual)' : '');
    return { ...dasar, skor, alasan, kriteria, ambigu };
  }

  if (soal.jawaban_ideal?.trim()) {
    const c = cakupanIdeal(teks, soal.jawaban_ideal);
    const angkaIdeal = angkaDari(soal.jawaban_ideal);
    const angkaJawaban = angkaDari(teks);
    const angkaKena = angkaIdeal.length ? angkaIdeal.filter((x) => angkaCocok(angkaJawaban, x, 0.01)).length / angkaIdeal.length : c;
    const kecocokan = 0.6 * c + 0.4 * angkaKena;
    const skor = bulat(Math.min(1, Math.max(0, (kecocokan - 0.15) / 0.6)) * soal.bobot);
    return {
      ...dasar,
      skor,
      alasan: `Dibandingkan dengan jawaban ideal: kecocokan isi ±${Math.round(c * 100)}%${angkaIdeal.length ? `, angka penting ±${Math.round(angkaKena * 100)}%` : ''}.`,
      ambigu: true,
    };
  }

  return { ...dasar, skor: 0, alasan: 'Belum ada rubrik atau jawaban ideal untuk soal ini — nilai secara manual.', perlu_manual: true };
}

function susunFeedback(per: HasilSoal[], nilai: number): string {
  const pembuka =
    nilai >= 85 ? 'Kerja bagus!' : nilai >= 70 ? 'Sudah baik.' : nilai >= 50 ? 'Cukup, tetapi masih perlu diperbaiki.' : 'Ayo pelajari kembali materinya.';
  const kuat = per.flatMap((p) => (p.kriteria ?? []).filter((k) => k.ok).map((k) => k.label)).slice(0, 2);
  const lemah = per.flatMap((p) => (p.kriteria ?? []).filter((k) => !k.ok).map((k) => k.label)).slice(0, 3);
  const pgSalah = per.filter((p) => p.tipe === 'pg' && p.skor < p.maks).length;
  const kosong = per.filter((p) => p.alasan === 'Tidak dijawab.').length;
  const kalimat = [pembuka];
  if (kuat.length) kalimat.push(`Yang sudah tepat: ${kuat.join(', ').toLowerCase()}.`);
  if (lemah.length) kalimat.push(`Periksa kembali: ${lemah.join(', ').toLowerCase()}.`);
  if (pgSalah) kalimat.push(`Ada ${pgSalah} soal pilihan ganda yang belum tepat.`);
  if (kosong) kalimat.push(`${kosong} soal belum dijawab.`);
  return kalimat.join(' ');
}

/** Koreksi seluruh lembar jawaban dengan aturan. */
export function koreksiAturan(soal: SoalKoreksi[], jawaban: Record<string, string>): HasilKoreksi {
  let ambigu = false;
  let manual = false;
  let tanpaRubrik = false;
  const per_soal: HasilSoal[] = soal.map((s) => {
    if (s.tipe === 'pg') return nilaiPg(s, jawaban[s.id]);
    const h = nilaiUraian(s, jawaban[s.id]);
    if (h.ambigu) ambigu = true;
    if (h.perlu_manual) manual = true;
    if (!s.rubrik?.length) tanpaRubrik = true;
    const { ambigu: _a, ...rest } = h;
    return rest;
  });
  const skor = per_soal.reduce((a, p) => a + p.skor, 0);
  const maks = per_soal.reduce((a, p) => a + p.maks, 0);
  const nilai_100 = maks ? Math.round((skor / maks) * 100) : 0;
  const keyakinan: Tingkat = manual ? 'rendah' : ambigu || tanpaRubrik ? 'sedang' : 'tinggi';
  return { versi: 1, nilai_100, skor: bulat(skor), maks, feedback: susunFeedback(per_soal, nilai_100), per_soal, keyakinan };
}
