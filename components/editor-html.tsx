'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Heading2, Heading3, Pilcrow, List, ListOrdered, Quote, Link2, ImagePlus, RemoveFormatting, Undo2, Redo2,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/skeleton';
import { bersihkanHtmlKlien } from '@/lib/sanitasi-klien';

interface EditorHtmlProps {
  /** Nilai awal; editor tidak dikontrol penuh agar posisi kursor tidak lompat saat mengetik. */
  initialValue: string;
  onChange: (html: string) => void;
  onUploadImage?: (file: File) => Promise<{ url?: string; error?: string }>;
  placeholder?: string;
}

/** Editor teks kaya sederhana untuk guru (tebal, judul, daftar, kutipan, tautan, gambar) tanpa menulis HTML. */
export function EditorHtml({ initialValue, onChange, onUploadImage, placeholder = 'Tulis uraian materi di sini...' }: EditorHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [mengunggah, setMengunggah] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialValue || '';
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* peramban lama */
    }
    // hanya saat dipasang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kirim = () => onChange(ref.current?.innerHTML ?? '');
  const simpanSeleksi = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
  };
  const pulihkanSeleksi = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (range.current && sel) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
  };
  const perintah = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    kirim();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    const teks = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (html) document.execCommand('insertHTML', false, bersihkanHtmlKlien(html, { buangGaya: true }));
    else document.execCommand('insertText', false, teks);
    kirim();
  };

  const pilihGambar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadImage) return;
    setMengunggah(true);
    setPesan(null);
    const { url, error } = await onUploadImage(file);
    setMengunggah(false);
    if (error || !url) {
      setPesan(error || 'Gambar gagal diunggah.');
      return;
    }
    pulihkanSeleksi();
    document.execCommand('insertImage', false, url);
    kirim();
  };

  const tombol: { icon: React.ElementType; label: string; aksi: () => void }[] = [
    { icon: Bold, label: 'Tebal (Ctrl+B)', aksi: () => perintah('bold') },
    { icon: Italic, label: 'Miring (Ctrl+I)', aksi: () => perintah('italic') },
    { icon: Underline, label: 'Garis bawah (Ctrl+U)', aksi: () => perintah('underline') },
    { icon: Heading2, label: 'Judul besar', aksi: () => perintah('formatBlock', 'H2') },
    { icon: Heading3, label: 'Subjudul', aksi: () => perintah('formatBlock', 'H3') },
    { icon: Pilcrow, label: 'Paragraf biasa', aksi: () => perintah('formatBlock', 'P') },
    { icon: List, label: 'Daftar berbutir', aksi: () => perintah('insertUnorderedList') },
    { icon: ListOrdered, label: 'Daftar bernomor', aksi: () => perintah('insertOrderedList') },
    { icon: Quote, label: 'Kutipan / catatan penting', aksi: () => perintah('formatBlock', 'BLOCKQUOTE') },
    {
      icon: Link2,
      label: 'Sisipkan tautan',
      aksi: () => {
        simpanSeleksi();
        setLinkUrl('https://');
        setLinkOpen(true);
      },
    },
    ...(onUploadImage
      ? [{ icon: ImagePlus, label: 'Sisipkan gambar', aksi: () => { simpanSeleksi(); fileRef.current?.click(); } }]
      : []),
    { icon: RemoveFormatting, label: 'Hapus format', aksi: () => perintah('removeFormat') },
    { icon: Undo2, label: 'Urungkan (Ctrl+Z)', aksi: () => perintah('undo') },
    { icon: Redo2, label: 'Ulangi (Ctrl+Y)', aksi: () => perintah('redo') },
  ];

  return (
    <div className="rounded-2xl border border-[#DCEAF7] bg-white overflow-hidden focus-within:border-[#2E7BC4] focus-within:ring-4 focus-within:ring-[#2E7BC4]/10 transition-all">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-[#E6EEF7] bg-[#F8FBFF]" role="toolbar" aria-label="Format teks">
        {tombol.map(({ icon: Icon, label, aksi }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={aksi}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#4B5A70] hover:bg-[#EAF6FF] hover:text-[#1B4E80] transition-colors"
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
        {mengunggah && (
          <span className="ml-2 text-[11px] font-semibold text-[#2E7BC4] flex items-center gap-1.5">
            <Spinner className="w-3.5 h-3.5" /> Mengunggah gambar...
          </span>
        )}
      </div>
      {pesan && <div role="alert" className="px-4 py-2 text-xs font-semibold text-[#991B1B] bg-[#FDEAE7]">{pesan}</div>}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Isi materi"
        data-placeholder={placeholder}
        onInput={kirim}
        onBlur={kirim}
        onPaste={onPaste}
        onKeyUp={simpanSeleksi}
        onMouseUp={simpanSeleksi}
        className="materi-content min-h-[260px] max-h-[560px] overflow-y-auto px-5 py-4 text-[15px] leading-[1.85] text-[#1F2A37] focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-[#A0AEC0]"
      />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={pilihGambar} />

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="Sisipkan tautan"
        actions={
          <>
            <button type="button" onClick={() => setLinkOpen(false)} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm">
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setLinkOpen(false);
                if (!/^https?:\/\/\S+\.\S+/i.test(linkUrl.trim())) return;
                pulihkanSeleksi();
                const sel = window.getSelection();
                if (sel && sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${linkUrl.trim().replace(/"/g, '&quot;')}">${linkUrl.trim().replace(/</g, '&lt;')}</a>`);
                else document.execCommand('createLink', false, linkUrl.trim());
                kirim();
              }}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm"
            >
              Sisipkan
            </button>
          </>
        }
      >
        <label htmlFor="url-tautan" className="block text-xs font-bold text-[#1F2A37] mb-1.5">
          Alamat tautan (diawali https://)
        </label>
        <input
          id="url-tautan"
          data-autofocus
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] text-sm focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10"
        />
        <p className="text-xs text-[#66748C] mt-2">Jika ada teks yang dipilih, teks itu menjadi tautan.</p>
      </Modal>
    </div>
  );
}
