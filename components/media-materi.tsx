import React from 'react';
import { FileText, PlayCircle } from 'lucide-react';
import { kenaliMedia } from '@/lib/url';

/** Video YouTube atau dokumen PDF pendukung materi (dipakai halaman siswa & pratinjau editor guru). */
export function MediaMateri({ url, judul }: { url: string | null | undefined; judul: string }) {
  const media = kenaliMedia(url);
  if (!media || media.jenis === 'lain') return null;

  if (media.jenis === 'youtube') {
    return (
      <div className="bg-white border border-[#DCEAF7] rounded-2xl p-4 sm:p-5 mb-6 shadow-[0_4px_15px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1 text-[11px] bg-[#FEE2E2] text-[#DC2626] px-2.5 py-1 rounded-full font-bold">
            <PlayCircle className="w-3.5 h-3.5" /> Video Pembelajaran
          </span>
          <strong className="text-sm text-[#1B4E80] truncate">{judul}</strong>
        </div>
        <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-xl border border-[#DCEAF7] bg-[#0F2A47]">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${media.id}`}
            title={`Video: ${judul}`}
            loading="lazy"
            className="absolute top-0 left-0 w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-4 sm:p-5 mb-6">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="font-bold text-[#92400E] text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" /> Dokumen Pendukung Materi (PDF)
        </div>
        <a
          href={media.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-press text-xs px-3.5 py-1.5 bg-[#2E7BC4] text-white rounded-[10px] font-semibold hover:bg-[#1B4E80]"
        >
          Unduh / Buka Dokumen &rarr;
        </a>
      </div>
      <iframe src={media.url} title={`Dokumen: ${judul}`} loading="lazy" className="w-full h-[450px] border-0 rounded-xl bg-white" />
    </div>
  );
}
