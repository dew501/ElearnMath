// Normalisasi teks jawaban siswa (bahasa Indonesia) & ekstraksi angka.

const STOPWORD = new Set(
  'yang dan di ke dari untuk dengan pada adalah itu ini atau juga karena jadi maka sehingga agar akan sudah telah dalam oleh sebagai tersebut nya kita kami saya aku kamu mereka dia ada tidak bukan bisa dapat lalu kemudian setelah sebelum maka jika kalau sebuah suatu para'.split(' ')
);

/** Huruf kecil, buang aksen & tanda baca berlebih, rapikan spasi. */
export function normal(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[“”"'`’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pemotongan akhiran/awalan sederhana agar "menjumlahkan" ≈ "jumlah". */
export function akar(kata: string): string {
  let k = kata;
  if (k.length > 5) k = k.replace(/(kan|lah|kah|nya|an|i)$/, '');
  if (k.length > 5) k = k.replace(/^(meng|meny|mem|men|me|peng|peny|pem|pen|pe|di|ter|ber|be|ke|se)/, '');
  return k;
}

export function kataPenting(s: string): string[] {
  return normal(s)
    .split(/[^a-z0-9,.]+/)
    .map((w) => w.replace(/^[,.]+|[,.]+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORD.has(w))
    .map(akar);
}

export const jumlahKata = (s: string) => normal(s).split(/\s+/).filter((w) => /[a-z0-9]/.test(w)).length;

/** Ambil semua bilangan dari teks: "154,5", "154.5", "1.000", "-3", "3/6" (→ 0,5 dan juga 3 & 6). */
export function angkaDari(s: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:[.,]\d+)*(?:\s*\/\s*-?\d+(?:[.,]\d+)?)?/g;
  for (const m of s.match(re) ?? []) {
    const bagian = m.split('/').map((x) => x.replace(/\s/g, ''));
    const nilai = bagian.map(keBilangan).filter((x): x is number => x !== null);
    if (bagian.length === 2 && nilai.length === 2 && nilai[1] !== 0) out.push(nilai[0] / nilai[1]);
    out.push(...nilai);
  }
  return out;
}

function keBilangan(t: string): number | null {
  if (!t) return null;
  // 1.000.000 → ribuan; 154,5 atau 154.5 → desimal
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  if (/^-?\d{1,3}(,\d{3})+$/.test(t) && !/^-?\d+,\d{1,2}$/.test(t)) return Number(t.replace(/,/g, ''));
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function angkaCocok(daftar: number[], target: number, toleransi = 0): boolean {
  const tol = Math.max(toleransi, 1e-9);
  return daftar.some((x) => Math.abs(x - target) <= tol);
}

/** Cocokkan salah satu alternatif ("rata-rata|mean") dengan jawaban. Alternatif pendek dicocokkan per kata. */
export function kataCocok(jawaban: string, alternatif: string): boolean {
  const j = normal(jawaban);
  const kataJ = new Set(kataPenting(jawaban));
  return alternatif
    .split('|')
    .map((a) => normal(a))
    .filter(Boolean)
    .some((a) => {
      if (/^[a-z0-9]{1,3}$/.test(a)) return new RegExp(`(^|[^a-z0-9])${a}([^a-z0-9]|$)`).test(j);
      if (/^[a-z]+$/.test(a)) return j.includes(a) || kataJ.has(akar(a));
      return j.includes(a);
    });
}
