// Pembersih HTML ringan di browser (pratinjau editor & teks yang di-paste dari Word/web).
// Tampilan ke siswa tetap disanitasi ulang di server (lib/konten.ts).

const TAG_BOLEH = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
  'A', 'IMG', 'SPAN', 'DIV', 'SUP', 'SUB', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CODE', 'PRE', 'HR',
]);
const TAG_BUANG = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'SVG']);
const ATRIBUT_BOLEH: Record<string, string[]> = { A: ['href'], IMG: ['src', 'alt'], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'] };

export function bersihkanHtmlKlien(html: string, opsi: { buangGaya?: boolean } = {}): string {
  if (typeof window === 'undefined' || !html) return html || '';
  const doc = new DOMParser().parseFromString(`<div id="akar">${html}</div>`, 'text/html');
  const akar = doc.getElementById('akar');
  if (!akar) return '';

  // Komentar (termasuk komentar kondisional Word) dibuang
  const walker = doc.createTreeWalker(akar, NodeFilter.SHOW_COMMENT);
  const komentar: Node[] = [];
  while (walker.nextNode()) komentar.push(walker.currentNode);
  komentar.forEach((n) => n.parentNode?.removeChild(n));

  const bersihkan = (el: Element) => {
    for (const anak of Array.from(el.children)) {
      bersihkan(anak);
      if (TAG_BUANG.has(anak.tagName)) {
        anak.remove();
        continue;
      }
      if (!TAG_BOLEH.has(anak.tagName)) {
        anak.replaceWith(...Array.from(anak.childNodes));
        continue;
      }
      for (const attr of Array.from(anak.attributes)) {
        const nama = attr.name.toLowerCase();
        const boleh = (ATRIBUT_BOLEH[anak.tagName] ?? []).includes(nama) || (!opsi.buangGaya && nama === 'style');
        const berbahaya = /^\s*(javascript|vbscript|data:text)/i.test(attr.value);
        if (!boleh || berbahaya) anak.removeAttribute(attr.name);
      }
      if (anak.tagName === 'A') {
        anak.setAttribute('target', '_blank');
        anak.setAttribute('rel', 'noopener noreferrer');
      }
    }
  };
  bersihkan(akar);
  return akar.innerHTML;
}
