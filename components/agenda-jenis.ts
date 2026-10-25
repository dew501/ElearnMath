import type React from 'react';
import { Flag, ClipboardCheck, PartyPopper, Bookmark } from 'lucide-react';

/** Jenis agenda kelas beserta label, ikon, dan warnanya. */
export const JENIS_AGENDA: Record<string, { label: string; ikon: React.ElementType; warna: string }> = {
  kegiatan: { label: 'Kegiatan', ikon: PartyPopper, warna: 'bg-[#EAF6FF] text-[#1B4E80]' },
  tenggat: { label: 'Tenggat tugas', ikon: Flag, warna: 'bg-[#FDEAE7] text-[#C2412E]' },
  ujian: { label: 'Ujian / ulangan', ikon: ClipboardCheck, warna: 'bg-[#F3E8FF] text-[#6D28D9]' },
  lainnya: { label: 'Lainnya', ikon: Bookmark, warna: 'bg-[#F1F5F9] text-[#4B5A70]' },
};
