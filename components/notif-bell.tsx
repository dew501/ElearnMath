'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { waktuRelatif } from '@/lib/waktu';
import { Bell, Inbox, Award, RotateCcw, Megaphone, CalendarDays, UserPlus, UserCheck, CheckCheck } from 'lucide-react';

interface Notif {
  id: string;
  jenis: string;
  judul: string;
  isi: string | null;
  tautan: string | null;
  dibaca_at: string | null;
  created_at: string;
}

const IKON: Record<string, { icon: React.ElementType; warna: string }> = {
  tugas_masuk: { icon: Inbox, warna: 'bg-[#EAF6FF] text-[#2E7BC4]' },
  nilai: { icon: Award, warna: 'bg-[#E4F8EE] text-[#15885A]' },
  izin_ulang: { icon: RotateCcw, warna: 'bg-[#FFF1DD] text-[#E37A12]' },
  pengumuman: { icon: Megaphone, warna: 'bg-[#F3E8FF] text-[#7C3AED]' },
  agenda: { icon: CalendarDays, warna: 'bg-[#FFF1DD] text-[#B45309]' },
  akun_baru: { icon: UserPlus, warna: 'bg-[#FFF1DD] text-[#E37A12]' },
  akun: { icon: UserCheck, warna: 'bg-[#E4F8EE] text-[#15885A]' },
};

/** Lonceng notifikasi: tugas masuk, nilai terbit, pengumuman, agenda, akun baru. */
export function NotifBell() {
  const router = useRouter();
  const supabase = createClient();
  const [tersedia, setTersedia] = useState(true);
  const [daftar, setDaftar] = useState<Notif[]>([]);
  const [belum, setBelum] = useState(0);
  const [buka, setBuka] = useState(false);
  const kotak = useRef<HTMLDivElement>(null);

  const muat = useCallback(async () => {
    const [list, hitung] = await Promise.all([
      supabase.from('notifikasi').select('id, jenis, judul, isi, tautan, dibaca_at, created_at').order('created_at', { ascending: false }).limit(15),
      supabase.from('notifikasi').select('id', { count: 'exact', head: true }).is('dibaca_at', null),
    ]);
    if (list.error) {
      // Tabel belum ada (migrasi belum dijalankan) atau sesi berakhir: lonceng disembunyikan
      setTersedia(false);
      return;
    }
    setTersedia(true);
    setDaftar((list.data ?? []) as Notif[]);
    setBelum(hitung.count ?? 0);
  }, [supabase]);

  useEffect(() => {
    muat();
    const t = setInterval(() => document.visibilityState === 'visible' && muat(), 45_000);
    const v = () => document.visibilityState === 'visible' && muat();
    document.addEventListener('visibilitychange', v);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', v);
    };
  }, [muat]);

  useEffect(() => {
    if (!buka) return;
    const luar = (e: MouseEvent) => !kotak.current?.contains(e.target as Node) && setBuka(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBuka(false);
    document.addEventListener('mousedown', luar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', luar);
      document.removeEventListener('keydown', esc);
    };
  }, [buka]);

  const bacaSemua = async () => {
    const { error } = await supabase.rpc('baca_semua_notifikasi');
    if (!error) {
      const kini = new Date().toISOString();
      setDaftar((d) => d.map((n) => ({ ...n, dibaca_at: n.dibaca_at ?? kini })));
      setBelum(0);
    }
  };

  const pilih = async (n: Notif) => {
    setBuka(false);
    if (!n.dibaca_at) {
      setDaftar((d) => d.map((x) => (x.id === n.id ? { ...x, dibaca_at: new Date().toISOString() } : x)));
      setBelum((b) => Math.max(0, b - 1));
      await supabase.from('notifikasi').update({ dibaca_at: new Date().toISOString() }).eq('id', n.id);
    }
    if (n.tautan) router.push(n.tautan);
  };

  if (!tersedia) return null;

  return (
    <div ref={kotak} className="relative">
      <button
        type="button"
        onClick={() => {
          setBuka((b) => !b);
          if (!buka) muat();
        }}
        aria-label={belum ? `Notifikasi, ${belum} belum dibaca` : 'Notifikasi'}
        aria-expanded={buka}
        className="btn-press relative w-9 h-9 flex items-center justify-center rounded-xl text-[#1B4E80] hover:bg-[#EAF6FF]"
      >
        <Bell className={`w-[18px] h-[18px] ${belum ? 'anim-chip' : ''}`} />
        {belum > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E3543F] text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white tabular">
            {belum > 9 ? '9+' : belum}
          </span>
        )}
      </button>

      {buka && (
        <div
          role="dialog"
          aria-label="Daftar notifikasi"
          className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-[68px] sm:top-12 sm:w-[380px] bg-white rounded-2xl border border-[#DCEAF7] shadow-[0_24px_60px_rgba(15,42,71,0.22)] overflow-hidden anim-pop z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6EEF7]">
            <span className="text-sm font-extrabold text-[#1B4E80]">Notifikasi</span>
            {belum > 0 && (
              <button type="button" onClick={bacaSemua} className="text-[11px] font-bold text-[#2E7BC4] hover:underline flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" /> Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {daftar.length === 0 ? (
              <p className="text-xs text-[#66748C] text-center py-10">Belum ada notifikasi.</p>
            ) : (
              daftar.map((n) => {
                const g = IKON[n.jenis] ?? IKON.pengumuman;
                const Icon = g.icon;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => pilih(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FBFF] transition-colors ${n.dibaca_at ? '' : 'bg-[#F4F9FF]'}`}
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${g.warna}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-xs leading-snug ${n.dibaca_at ? 'font-semibold text-[#4B5A70]' : 'font-extrabold text-[#1F2A37]'}`}>{n.judul}</span>
                      {n.isi && <span className="block text-[11px] text-[#66748C] mt-0.5 line-clamp-2">{n.isi}</span>}
                      <span className="block text-[10px] text-[#94A3B8] mt-1">{waktuRelatif(n.created_at)}</span>
                    </span>
                    {!n.dibaca_at && <span className="w-2 h-2 rounded-full bg-[#2E7BC4] mt-1.5 shrink-0" aria-label="belum dibaca" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
