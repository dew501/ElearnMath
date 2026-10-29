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
  pengumuman: { icon: Megaphone, warna: 'bg-[#FFF3E2] text-[#C66B08]' },
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
  const [rendered, setRendered] = useState(false);
  const [active, setActive] = useState(false);
  const kotak = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (buka) {
      setRendered(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setActive(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setActive(false);
    const t = setTimeout(() => setRendered(false), 140);
    return () => clearTimeout(t);
  }, [buka]);

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
        className={`btn-press relative w-9 h-9 flex items-center justify-center rounded-xl text-[#3E5470] ${
          buka
            ? 'bg-[#E8F0F9] text-[#133B63]'
            : 'hover:bg-[#F2F7FC] hover:text-[#133B63]'
        }`}
      >
        <Bell className={`w-[18px] h-[18px] ${belum ? 'anim-chip' : ''}`} />
        {belum > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E04B37] text-white text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white tabular">
            {belum > 9 ? '9+' : belum}
          </span>
        )}
      </button>

      {(buka || rendered) && (
        <div
          role="dialog"
          aria-label="Daftar notifikasi"
          data-open={buka && active ? 'true' : 'false'}
          className="popover-panel origin-top sm:origin-top-right fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-[70px] sm:top-12 sm:w-[392px] bg-white rounded-2xl border border-[#D5E3F1] shadow-[0_2px_6px_rgba(15,45,78,0.06),0_24px_48px_-16px_rgba(10,31,56,0.28)] overflow-hidden z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6EEF6]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-[#0E2A48] tracking-[-0.01em]">Notifikasi</span>
              {belum > 0 && (
                <span className="tabular text-xs font-bold px-2 py-0.5 rounded-full bg-[#FFF3E2] text-[#B45309]">
                  {belum} baru
                </span>
              )}
            </div>
            {belum > 0 && (
              <button type="button" onClick={bacaSemua} className="btn-press text-xs font-semibold text-[#1F63A8] hover:text-[#133B63] hover:bg-[#EEF4FB] flex items-center gap-1 px-2.5 py-1 rounded-lg">
                <CheckCheck className="w-3.5 h-3.5" /> Tandai dibaca
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {daftar.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <Bell className="w-7 h-7 text-[#BFDBFE] mx-auto mb-2" />
                <p className="text-xs font-medium text-[#66748C]">Belum ada notifikasi.</p>
              </div>
            ) : (
              daftar.map((n) => {
                const g = IKON[n.jenis] ?? IKON.pengumuman;
                const Icon = g.icon;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => pilih(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FBFF] transition-colors duration-150 ${n.dibaca_at ? '' : 'bg-[#F2F8FF]'}`}
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-black/[0.03] ${g.warna}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-xs leading-snug ${n.dibaca_at ? 'font-semibold text-[#4B5A70]' : 'font-extrabold text-[#1F2A37]'}`}>{n.judul}</span>
                      {n.isi && <span className="block text-xs text-[#66748C] mt-0.5 line-clamp-2">{n.isi}</span>}
                      <span className="block text-[11px] text-[#94A3B8] mt-1">{waktuRelatif(n.created_at)}</span>
                    </span>
                    {!n.dibaca_at && <span className="w-2 h-2 rounded-full bg-[#2E7BC4] mt-1.5 shrink-0 ring-2 ring-[#D3ECFF]" aria-label="belum dibaca" />}
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
