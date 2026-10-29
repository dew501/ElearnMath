'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/skeleton';
import {
  formatUkuranByte,
  type HasilForensikAi,
  type LampiranJawaban,
  type TingkatIndikasiAi,
} from '@/lib/lampiran/tipe';
import { pindaiForensikBerkas, pindaiForensikTeks } from '@/lib/lampiran/deteksi-ai';
import { buatUrlLampiran } from '@/lib/lampiran/unggah-xhr';
import {
  FileText,
  Image as ImageIcon,
  Camera,
  Eye,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Fingerprint,
} from 'lucide-react';

function gayaTingkatAi(tingkat: TingkatIndikasiAi) {
  if (tingkat === 'tinggi') {
    return {
      lencana: 'bg-[#FDEAE7] text-[#C2412E] border-[#FECACA] hover:bg-[#FADCD7]',
      panel: 'bg-[#FDEAE7]/70 border-[#FECACA] text-[#991B1B]',
      ikon: ShieldAlert,
      label: 'Indikasi AI / Watermark Tinggi',
    };
  }
  if (tingkat === 'sedang') {
    return {
      lencana: 'bg-[#FFF1DD] text-[#B45309] border-[#FBD38D] hover:bg-[#FFE6C2]',
      panel: 'bg-[#FFF8EC] border-[#FBD38D] text-[#92400E]',
      ikon: AlertTriangle,
      label: 'Jejak Unicode / Metadata Perlu Ditinjau',
    };
  }
  return {
    lencana: 'bg-[#E4F8EE] text-[#15885A] border-[#BBF7D0] hover:bg-[#D1F4E1]',
    panel: 'bg-[#F0FBF5] border-[#BBF7D0] text-[#14532D]',
    ikon: ShieldCheck,
    label: 'Forensik Bersih',
  };
}

function labelKategoriUnicode(kat: string): string {
  switch (kat) {
    case 'zero_width':
      return 'Zero-Width Invisible';
    case 'steganografi_tag':
      return 'Steganografi Tag / Variation';
    case 'spasi_anomali':
      return 'Spasi Anomali LLM';
    case 'operator_tak_terlihat':
      return 'Operator Tak Terlihat';
    default:
      return kat;
  }
}

export function DaftarLampiran({
  lampiran,
  teksJawaban,
  mode = 'siswa',
}: {
  lampiran: LampiranJawaban[];
  teksJawaban?: string;
  mode?: 'siswa' | 'guru';
}) {
  const supabase = useMemo(() => createClient(), []);
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [pratinjau, setPratinjau] = useState<{ item: LampiranJawaban; url: string | null; memuat: boolean } | null>(null);
  const [modalForensik, setModalForensik] = useState<{
    judul: string;
    subjudul: string;
    hasil: HasilForensikAi;
    lampiranTarget?: LampiranJawaban;
    memindaiUlang?: boolean;
  } | null>(null);

  // Muat URL gambar kecil secara otomatis agar thumbnail foto tulisan tangan langsung tampak
  useEffect(() => {
    let batal = false;
    const gbr = lampiran.filter((l) => l.mime?.startsWith('image/') && !urlMap[l.path]);
    if (!gbr.length) return;
    (async () => {
      const entriBaru: Record<string, string> = {};
      for (const item of gbr) {
        const u = await buatUrlLampiran(supabase, item.path);
        if (u) entriBaru[item.path] = u;
      }
      if (!batal && Object.keys(entriBaru).length) {
        setUrlMap((prev) => ({ ...prev, ...entriBaru }));
      }
    })();
    return () => {
      batal = true;
    };
  }, [lampiran, supabase, urlMap]);

  // Pindai juga teks jawaban ketikan siswa bila mode guru (untuk menangkap copy-paste LLM ber-watermark Unicode)
  const forensikTeks = useMemo(() => {
    if (mode !== 'guru' || !(teksJawaban ?? '').trim()) return null;
    return pindaiForensikTeks(teksJawaban!);
  }, [mode, teksJawaban]);

  const bukaPratinjau = async (item: LampiranJawaban) => {
    const sudahAda = urlMap[item.path];
    if (sudahAda) {
      setPratinjau({ item, url: sudahAda, memuat: false });
      return;
    }
    setPratinjau({ item, url: null, memuat: true });
    const u = await buatUrlLampiran(supabase, item.path);
    if (u) setUrlMap((prev) => ({ ...prev, [item.path]: u }));
    setPratinjau((prev) => (prev && prev.item.path === item.path ? { item, url: u, memuat: false } : prev));
  };

  const unduhLangsung = async (item: LampiranJawaban) => {
    const u = urlMap[item.path] ?? (await buatUrlLampiran(supabase, item.path));
    if (!u) return;
    setUrlMap((prev) => ({ ...prev, [item.path]: u }));
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  const pindaiUlangBerkasStorage = async (item: LampiranJawaban) => {
    setModalForensik((prev) => (prev ? { ...prev, memindaiUlang: true } : prev));
    try {
      const u = urlMap[item.path] ?? (await buatUrlLampiran(supabase, item.path));
      if (!u) throw new Error('URL berkas tidak ditemukan.');
      const res = await fetch(u);
      const buf = new Uint8Array(await res.arrayBuffer());
      const hasilSegar = await pindaiForensikBerkas(buf, item.name, item.mime);
      // Gabungkan bila pemindaian pra-kompresi sebelumnya menangkap metadata asli yang terhapus saat kompresi gambar
      const lama = item.ai_scan;
      const gabung: HasilForensikAi = lama && lama.skor_risiko > hasilSegar.skor_risiko
        ? {
            ...lama,
            dipindai_pada: new Date().toISOString(),
          }
        : hasilSegar;
      setModalForensik((prev) =>
        prev ? { ...prev, hasil: gabung, memindaiUlang: false } : prev
      );
    } catch {
      setModalForensik((prev) => (prev ? { ...prev, memindaiUlang: false } : prev));
    }
  };

  const adaTeksBerwatermark =
    mode === 'guru' && forensikTeks && (forensikTeks.unicode_total > 0 || forensikTeks.tingkat !== 'rendah');

  if (!lampiran.length && !adaTeksBerwatermark) return null;

  return (
    <div className="space-y-2.5">
      {/* Lencana forensik teks ketikan bila terdeteksi watermark Unicode tak terlihat */}
      {adaTeksBerwatermark && forensikTeks && (
        <div className="flex items-center justify-between gap-2 flex-wrap p-2.5 rounded-xl bg-[#FFF8EC] border border-[#FBD38D]">
          <span className="text-xs font-bold text-[#92400E] flex items-center gap-1.5">
            <Fingerprint className="w-4 h-4 text-[#F0932B] shrink-0" />
            Teks ketikan memuat {forensikTeks.unicode_total} karakter Unicode tak terlihat / khas AI
          </span>
          <button
            type="button"
            onClick={() =>
              setModalForensik({
                judul: 'Forensik Deteksi AI & Watermark — Teks Jawaban',
                subjudul: 'Pemindaian karakter Unicode tersembunyi pada teks uraian yang diketik siswa',
                hasil: forensikTeks,
              })
            }
            className="btn-press inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white border border-[#F0932B] text-xs font-extrabold text-[#92400E] hover:bg-[#FFF1DD]"
          >
            <Fingerprint className="w-3.5 h-3.5" /> Lihat Detail Watermark
          </button>
        </div>
      )}

      {lampiran.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {lampiran.map((item) => {
            const adalahGambar = item.mime?.startsWith('image/');
            const thumb = urlMap[item.path];
            const scan: HasilForensikAi = item.ai_scan ?? {
              tingkat: 'rendah',
              skor_risiko: 0,
              ringkasan: 'Belum ada catatan pemindaian pra-kompresi. Klik Pindai Ulang untuk memeriksa berkas di penyimpanan.',
              unicode_total: 0,
              temuan_unicode: [],
              temuan_metadata: [],
              dipindai_pada: item.uploaded_at || new Date().toISOString(),
            };
            const gayaAi = gayaTingkatAi(scan.tingkat);

            return (
              <div
                key={item.path}
                className="rounded-xl bg-white/95 border border-[#DCEAF7] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {adalahGambar && thumb ? (
                    <button
                      type="button"
                      onClick={() => bukaPratinjau(item)}
                      className="w-16 h-16 rounded-xl overflow-hidden border border-[#DCEAF7] bg-[#0F172A]/90 shrink-0 group relative"
                      title="Klik untuk memperbesar gambar jawaban"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb} alt={item.original_name || item.name} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => bukaPratinjau(item)}
                      className="w-12 h-12 rounded-xl bg-[#EAF6FF] text-[#2E7BC4] flex items-center justify-center shrink-0 hover:bg-[#D3ECFF]"
                      title="Pratinjau berkas"
                    >
                      {adalahGambar ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                    </button>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-[#1F2A37] truncate max-w-[230px] sm:max-w-[320px]">
                        {item.original_name || item.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#4B5A70]">
                        {item.source === 'camera' ? (
                          <>
                            <Camera className="w-2.5 h-2.5" /> Foto Kamera
                          </>
                        ) : (
                          'Berkas Unggahan'
                        )}
                      </span>
                    </div>

                    <div className="text-xs text-[#66748C] tabular">
                      Ukuran tersimpan: <strong className="text-[#1B4E80]">{formatUkuranByte(item.compressed_size)}</strong>
                      {item.hemat_persen > 0 && (
                        <span> (dari {formatUkuranByte(item.original_size)}, hemat {String(item.hemat_persen).replace('.', ',')}%)</span>
                      )}
                    </div>

                    {mode === 'guru' && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setModalForensik({
                              judul: 'Forensik Deteksi AI & Watermark Berkas',
                              subjudul: item.original_name || item.name,
                              hasil: scan,
                              lampiranTarget: item,
                            })
                          }
                          className={`btn-press inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-extrabold transition-colors ${gayaAi.lencana}`}
                        >
                          <gayaAi.ikon className="w-3.5 h-3.5" />
                          {gayaAi.label}
                          {scan.skor_risiko > 0 && ` (${scan.skor_risiko}/100)`}
                          {scan.unicode_total > 0 && ` · ${scan.unicode_total} Unicode`}
                          <span className="underline ml-0.5">Detail</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => bukaPratinjau(item)}
                    className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#DCEAF7] bg-white text-xs font-bold text-[#1B4E80] hover:bg-[#F4F9FF]"
                  >
                    <Eye className="w-3.5 h-3.5" /> Pratinjau
                  </button>
                  <button
                    type="button"
                    onClick={() => unduhLangsung(item)}
                    className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#DCEAF7] bg-white text-xs font-bold text-[#4B5A70] hover:bg-[#F4F9FF]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Buka
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Pratinjau Gambar / PDF */}
      <Modal
        open={pratinjau !== null}
        lebar="lg"
        onClose={() => setPratinjau(null)}
        title={pratinjau?.item.original_name || pratinjau?.item.name || 'Pratinjau Berkas'}
        actions={
          <>
            {pratinjau?.url && (
              <a
                href={pratinjau.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-press px-4 py-2.5 rounded-xl border border-[#DCEAF7] text-[#1B4E80] font-bold text-sm hover:bg-[#F4F9FF] inline-flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" /> Buka / Unduh Asli
              </a>
            )}
            <button
              type="button"
              onClick={() => setPratinjau(null)}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm"
            >
              Tutup
            </button>
          </>
        }
      >
        {pratinjau && (
          <div>
            {pratinjau.memuat ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs font-bold text-[#66748C]">
                <Spinner /> Memuat berkas dari penyimpanan...
              </div>
            ) : !pratinjau.url ? (
              <p className="py-8 text-center text-xs text-[#66748C]">
                Berkas tidak dapat dimuat (mungkin sudah dihapus atau sesi berakhir).
              </p>
            ) : pratinjau.item.mime?.startsWith('image/') ? (
              <div className="rounded-2xl overflow-hidden border border-[#DCEAF7] bg-[#0F172A]/95 max-h-[65vh] flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pratinjau.url}
                  alt={pratinjau.item.original_name || pratinjau.item.name}
                  className="max-h-[63vh] w-auto object-contain"
                />
              </div>
            ) : pratinjau.item.mime === 'application/pdf' ? (
              <iframe
                title={pratinjau.item.name}
                src={pratinjau.url}
                className="w-full h-[60vh] rounded-2xl border border-[#DCEAF7]"
              />
            ) : (
              <div className="p-8 rounded-2xl border border-[#DCEAF7] bg-[#F8FAFC] text-center space-y-2">
                <FileText className="w-10 h-10 text-[#2E7BC4] mx-auto" />
                <p className="text-xs font-bold text-[#1B4E80]">
                  {pratinjau.item.original_name || pratinjau.item.name}
                </p>
                <p className="text-xs text-[#66748C]">
                  Format dokumen ini tidak ditampilkan di dalam bingkai web. Klik <strong>Buka / Unduh Asli</strong> untuk membukanya.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal / Popup Forensik Deteksi AI & Watermark (Khusus Guru) */}
      <Modal
        open={modalForensik !== null}
        lebar="lg"
        onClose={() => setModalForensik(null)}
        title={modalForensik?.judul || 'Forensik Deteksi AI & Watermark'}
        actions={
          <>
            {modalForensik?.lampiranTarget && (
              <button
                type="button"
                disabled={modalForensik.memindaiUlang}
                onClick={() => pindaiUlangBerkasStorage(modalForensik.lampiranTarget!)}
                className="btn-press px-4 py-2.5 rounded-xl border border-[#DCEAF7] text-[#1B4E80] font-bold text-sm hover:bg-[#F4F9FF] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {modalForensik.memindaiUlang ? <Spinner /> : <RefreshCw className="w-4 h-4" />}
                Pindai Ulang Berkas
              </button>
            )}
            <button
              type="button"
              onClick={() => setModalForensik(null)}
              className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm"
            >
              Tutup
            </button>
          </>
        }
      >
        {modalForensik && (() => {
          const h = modalForensik.hasil;
          const gaya = gayaTingkatAi(h.tingkat);
          return (
            <div className="space-y-4 text-[#1F2A37]">
              <p className="text-xs font-semibold text-[#66748C] -mt-1">{modalForensik.subjudul}</p>

              {/* Kartu Ringkasan Skor Risiko */}
              <div className={`p-4 rounded-2xl border ${gaya.panel} space-y-1.5`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <gaya.ikon className="w-4 h-4" /> {gaya.label}
                  </span>
                  <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-white/80 tabular">
                    Skor Indikasi: {h.skor_risiko} / 100
                  </span>
                </div>
                <p className="text-xs leading-relaxed font-medium">{h.ringkasan}</p>
                {h.statistik_teks && (
                  <p className="text-xs opacity-85 pt-1 tabular">
                    Sumber teks teranalisis: <strong>{h.statistik_teks.sumber_teks}</strong> &bull; {h.statistik_teks.jumlah_kata} kata ({h.statistik_teks.jumlah_karakter} karakter)
                  </p>
                )}
              </div>

              {/* Bagian 1: Invisible Unicode Watermark */}
              <div className="rounded-2xl border border-[#DCEAF7] bg-[#F8FBFF] p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold text-[#1B4E80] flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-[#2E7BC4]" />
                    1. Deteksi Invisible Unicode Watermark
                  </h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-[#DCEAF7] text-[#4B5A70] tabular">
                    {h.unicode_total} karakter terdeteksi
                  </span>
                </div>

                {h.temuan_unicode.length === 0 ? (
                  <p className="text-xs text-[#15885A] font-semibold bg-[#E4F8EE]/70 border border-[#BBF7D0] rounded-xl px-3 py-2">
                    Bersih — tidak ditemukan karakter Zero-Width (ZWSP/ZWNJ/WJ), blok Tag Steganografi (U+E0000), Variation Selector tersembunyi, maupun spasi NNBSP khas LLM.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {h.temuan_unicode.map((u) => (
                      <div key={u.kode} className="rounded-xl bg-white border border-[#DCEAF7] p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <code className="px-2 py-0.5 rounded-md bg-[#FDEAE7] text-[#C2412E] text-xs font-extrabold">
                              {u.kode}
                            </code>
                            <span className="text-xs font-bold text-[#1F2A37]">{u.nama}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#4B5A70]">
                              {labelKategoriUnicode(u.kategori)}
                            </span>
                          </div>
                          <span className="text-xs font-extrabold text-[#C2412E] tabular">
                            {u.jumlah}× muncul
                          </span>
                        </div>
                        {u.contoh_konteks.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#66748C]">
                              Posisi karakter tersembunyi dalam kalimat:
                            </span>
                            {u.contoh_konteks.map((c, idx) => (
                              <pre
                                key={idx}
                                className="text-xs font-mono bg-[#0F172A] text-[#E2E8F0] px-2.5 py-1.5 rounded-lg overflow-x-auto whitespace-pre-wrap break-all"
                              >
                                {c}
                              </pre>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bagian 2: Metadata Berkas (C2PA, SynthID, EXIF/XMP, PDF, Office) */}
              <div className="rounded-2xl border border-[#DCEAF7] bg-[#F8FBFF] p-4 space-y-2.5">
                <h3 className="text-xs font-extrabold text-[#1B4E80]">
                  2. Jejak Metadata Berkas (C2PA, SynthID, EXIF/XMP, PDF &amp; Properti Office)
                </h3>
                {h.temuan_metadata.length === 0 ? (
                  <p className="text-xs text-[#66748C] bg-white border border-[#E6EEF7] rounded-xl px-3 py-2">
                    Tidak ada metadata khusus atau tanda generator AI pada header berkas ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {h.temuan_metadata.map((m, idx) => {
                      const warnaBobot =
                        m.bobot_curiga === 'tinggi'
                          ? 'bg-[#FDEAE7] text-[#C2412E] border-[#FECACA]'
                          : m.bobot_curiga === 'sedang'
                          ? 'bg-[#FFF1DD] text-[#B45309] border-[#FBD38D]'
                          : 'bg-[#F1F5F9] text-[#4B5A70] border-[#E2E8F0]';
                      return (
                        <div key={`${m.kunci}-${idx}`} className="rounded-xl bg-white border border-[#DCEAF7] p-3 space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-[#1B4E80]">{m.kunci}</span>
                            <span className={`text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${warnaBobot}`}>
                              {m.bobot_curiga === 'tinggi'
                                ? 'Indikasi Kuat'
                                : m.bobot_curiga === 'sedang'
                                ? 'Anomali Sedang'
                                : 'Info Properti'}
                            </span>
                          </div>
                          <div className="text-xs font-mono bg-[#F8FAFC] border border-[#E6EEF7] rounded-lg px-2.5 py-1.5 text-[#1F2A37] break-all">
                            {m.nilai}
                          </div>
                          <p className="text-xs text-[#66748C]">{m.keterangan}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-xs text-[#66748C] bg-[#F4F9FF] border border-[#DCEAF7] rounded-xl px-3 py-2">
                <strong>Catatan penilaian:</strong> Pemindaian ini memeriksa bukti teknis pada byte mentah berkas sebelum dikompresi. Gunakan hasil forensik ini sebagai bahan pertimbangan pendukung bersama penilaian akademik Guru.
              </p>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
