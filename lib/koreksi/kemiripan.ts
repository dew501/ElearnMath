import { kataPenting, normal } from './teks';

/** Kemiripan dua jawaban uraian (0–1) dari pasangan kata berurutan; untuk mendeteksi jawaban yang disalin. */
export function kemiripan(a: string, b: string): number {
  const sa = sirap(a);
  const sb = sirap(b);
  if (!sa.size || !sb.size) return 0;
  let sama = 0;
  sa.forEach((x) => sb.has(x) && sama++);
  return sama / (sa.size + sb.size - sama);
}

function sirap(s: string): Set<string> {
  const k = kataPenting(s);
  const out = new Set<string>();
  if (k.length === 1) out.add(k[0]);
  for (let i = 0; i < k.length - 1; i++) out.add(`${k[i]} ${k[i + 1]}`);
  return out;
}

/** Jawaban terlalu pendek tidak dibandingkan (mis. "Lumayan paham"). */
export const layakDibandingkan = (s: string) => normal(s).length >= 25;

/** Kemiripan kata kunci (bukan berurutan) dengan jawaban ideal: 0–1. */
export function cakupanIdeal(jawaban: string, ideal: string): number {
  const ki = new Set(kataPenting(ideal));
  if (!ki.size) return 0;
  const kj = new Set(kataPenting(jawaban));
  let ada = 0;
  ki.forEach((x) => kj.has(x) && ada++);
  return ada / ki.size;
}
