'use client';

import React from 'react';
import { HARI, hariIni, jamPendek } from '@/lib/waktu';
import { Clock, MapPin } from 'lucide-react';

export interface EntriJadwal {
  id: string;
  hari: number;
  jam_mulai: string;
  jam_selesai: string;
  mapel: string;
  ruang?: string | null;
  kelas_nama?: string | null;
  guru_nama?: string | null;
}

const WARNA = ['from-[#5FA8E8] to-[#2E7BC4]', 'from-[#FFB454] to-[#F0932B]', 'from-[#34C98A] to-[#15885A]', 'from-[#7C8CF8] to-[#4F5BD5]', 'from-[#F27E6B] to-[#C2412E]'];

/** Jadwal mingguan Senin–Sabtu (Minggu muncul bila ada isinya). */
export function JadwalMingguan({
  entri,
  tampil = 'kelas',
  onPilih,
  kosong = 'Belum ada jadwal.',
}: {
  entri: EntriJadwal[];
  /** 'kelas': tampilkan nama guru; 'guru': tampilkan nama kelas; 'lengkap': keduanya */
  tampil?: 'kelas' | 'guru' | 'lengkap';
  onPilih?: (e: EntriJadwal) => void;
  kosong?: string;
}) {
  const hari = hariIni();
  const daftarHari = [1, 2, 3, 4, 5, 6, ...(entri.some((e) => e.hari === 7) ? [7] : [])];
  const kunciWarna = new Map<string, string>();
  const warna = (k: string) => {
    if (!kunciWarna.has(k)) kunciWarna.set(k, WARNA[kunciWarna.size % WARNA.length]);
    return kunciWarna.get(k)!;
  };

  if (!entri.length) return <p className="text-sm text-[#66748C] text-center py-8">{kosong}</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
      {daftarHari.map((h) => {
        const isi = entri.filter((e) => e.hari === h).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));
        return (
          <section
            key={h}
            aria-label={`Jadwal ${HARI[h]}`}
            className={`rounded-2xl border p-3 min-h-[96px] ${h === hari ? 'border-[#2E7BC4] bg-[#EAF6FF]/70 ring-2 ring-[#2E7BC4]/15' : 'border-[#DCEAF7] bg-white/70'}`}
          >
            <h3 className={`text-xs font-extrabold mb-2 flex items-center justify-between ${h === hari ? 'text-[#2E7BC4]' : 'text-[#1B4E80]'}`}>
              {HARI[h]}
              {h === hari && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#2E7BC4] text-white">Hari ini</span>}
            </h3>
            {isi.length === 0 ? (
              <p className="text-xs text-[#94A3B8]">—</p>
            ) : (
              <ul className="space-y-2">
                {isi.map((e) => {
                  const Kartu = onPilih ? 'button' : 'div';
                  return (
                    <li key={e.id}>
                      <Kartu
                        {...(onPilih ? { type: 'button' as const, onClick: () => onPilih(e) } : {})}
                        className={`w-full text-left rounded-xl bg-white border border-[#E6EEF7] p-2.5 shadow-[0_1px_2px_rgba(27,78,128,0.04)] ${onPilih ? 'btn-press hover:border-[#2E7BC4]' : ''}`}
                      >
                        <span className={`block h-1 w-8 rounded-full bg-gradient-to-r mb-1.5 ${warna(tampil === 'guru' ? e.kelas_nama ?? '' : e.guru_nama ?? e.mapel)}`} />
                        <span className="flex items-center gap-1 text-xs font-bold text-[#1F2A37] tabular">
                          <Clock className="w-3 h-3 text-[#94A3B8]" /> {jamPendek(e.jam_mulai)}–{jamPendek(e.jam_selesai)}
                        </span>
                        <span className="block text-xs font-extrabold text-[#1B4E80] mt-0.5">{e.mapel}</span>
                        {(tampil !== 'kelas' && e.kelas_nama) && <span className="block text-xs font-semibold text-[#4B5A70]">Kelas {e.kelas_nama}</span>}
                        {(tampil !== 'guru' && e.guru_nama) && <span className="block text-xs text-[#66748C] truncate">{e.guru_nama}</span>}
                        {e.ruang && (
                          <span className="flex items-center gap-1 text-[11px] text-[#94A3B8] mt-0.5">
                            <MapPin className="w-3 h-3" /> {e.ruang}
                          </span>
                        )}
                      </Kartu>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
