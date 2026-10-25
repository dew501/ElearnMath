// Utilitas URL media materi (aman dipakai di komponen server maupun klien).

/** Hanya izinkan URL http(s) untuk iframe/tautan media. */
export function urlAman(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const YT_RE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i;

export type JenisMedia = { jenis: 'youtube'; id: string; url: string } | { jenis: 'pdf'; url: string } | { jenis: 'lain'; url: string };

/** Kenali jenis media pendukung materi: video YouTube, berkas PDF, atau tautan lain (tidak ditampilkan). */
export function kenaliMedia(url: string | null | undefined): JenisMedia | null {
  const aman = urlAman(url);
  if (!aman) return null;
  const yt = aman.match(YT_RE);
  if (yt) return { jenis: 'youtube', id: yt[1], url: aman };
  if (/\.pdf$/i.test(new URL(aman).pathname)) return { jenis: 'pdf', url: aman };
  return { jenis: 'lain', url: aman };
}
