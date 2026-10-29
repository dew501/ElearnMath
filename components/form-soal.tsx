'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/skeleton';
import { JENIS, OPSI, TAHAPAN_BAWAAN, pesanGalat, tahapanDari, type JenisPengerjaan, type KriteriaRubrik, type Soal, type TahapLkpd } from '@/lib/pengerjaan';
import { FORMAT_DEFAULT_ESSAY, GRUP_FORMAT_ESSAY, labelFormatFile, normalisasiFormatFile } from '@/lib/lampiran/tipe';
import { AlertTriangle, Plus, Trash2, Sparkles, Paperclip, Check } from 'lucide-react';

export interface MateriRingkas {
  id: string;
  chapter_number: number | null;
  title: string | null;
}

interface Form {
  id: string | null;
  category: JenisPengerjaan;
  id_materi: string;
  tipe: 'pg' | 'essay';
  pertanyaan: string;
  opsi_a: string;
  opsi_b: string;
  opsi_c: string;
  opsi_d: string;
  kunci_jawaban: string;
  bobot: string;
  urutan: string;
  tahap: string;
  jawaban_ideal: string;
  rubrik: (Omit<KriteriaRubrik, 'nilai' | 'poin' | 'toleransi'> & { nilai: string; poin: string; toleransi: string })[];
  format_file: string[];
  ekstensi_kustom: string;
}

export type AwalSoal = Partial<Soal> & { category: JenisPengerjaan };

const inputClass =
  'input-field w-full px-3.5 py-2.5 rounded-xl text-sm text-[#1F2A37]';
const kecil = 'input-field px-2.5 py-2 rounded-lg text-xs text-[#1F2A37]';
const KATEGORI = Object.keys(JENIS) as JenisPengerjaan[];
const KUNCI_GRUP_FORMAT = new Set(GRUP_FORMAT_ESSAY.map((g) => g.kunci));

function daftarFormatAkhir(f: Pick<Form, 'format_file' | 'ekstensi_kustom'>): string[] {
  if (f.format_file.includes('*')) return ['*'];
  const kustom = f.ekstensi_kustom
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9.]/g, ''))
    .filter((s) => s && s !== '.')
    .map((s) => (s.startsWith('.') ? s : `.${s}`));
  const gabung = [...f.format_file, ...kustom];
  return gabung.length ? normalisasiFormatFile(gabung) : [...FORMAT_DEFAULT_ESSAY];
}

function keForm(a: AwalSoal): Form {
  const norm = normalisasiFormatFile(a.format_file);
  return {
    id: a.id ?? null,
    category: a.category,
    id_materi: a.id_materi ?? '',
    tipe: a.tipe === 'essay' ? 'essay' : 'pg',
    pertanyaan: a.pertanyaan ?? '',
    opsi_a: a.opsi_a ?? '',
    opsi_b: a.opsi_b ?? '',
    opsi_c: a.opsi_c ?? '',
    opsi_d: a.opsi_d ?? '',
    kunci_jawaban: (a.kunci_jawaban ?? '').toUpperCase(),
    bobot: String(a.bobot ?? 50),
    urutan: String(a.urutan ?? 1),
    tahap: a.tahap ?? '',
    jawaban_ideal: a.jawaban_ideal ?? '',
    rubrik: (Array.isArray(a.rubrik) ? a.rubrik : []).map((k) => ({ jenis: k.jenis, label: k.label ?? '', nilai: String(k.nilai ?? ''), poin: String(k.poin ?? ''), toleransi: k.toleransi != null ? String(k.toleransi) : '' })),
    format_file: norm.filter((x) => KUNCI_GRUP_FORMAT.has(x)),
    ekstensi_kustom: norm.filter((x) => !KUNCI_GRUP_FORMAT.has(x)).join(', '),
  };
}

/** Form tambah/ubah soal (bank soal & penyusun LKPD). Termasuk tahap LKPD dan rubrik untuk koreksi AI. */
export function FormSoal({
  awal,
  materi,
  onClose,
  onTersimpan,
}: {
  awal: AwalSoal | null;
  materi: MateriRingkas[];
  onClose: () => void;
  onTersimpan: (info: { baru: boolean; kategori: JenisPengerjaan }) => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState<Form | null>(null);
  const [tahapan, setTahapan] = useState<TahapLkpd[]>(TAHAPAN_BAWAAN);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    setForm(awal ? keForm(awal) : null);
    setGalat(null);
  }, [awal]);

  // Tahapan LKPD milik bab yang dipilih
  useEffect(() => {
    if (form?.category !== 'lkpd' || !form.id_materi) return;
    supabase
      .from('lkpd')
      .select('tahapan')
      .eq('id_materi', form.id_materi)
      .maybeSingle()
      .then(({ data }) => setTahapan(data ? tahapanDari(data.tahapan) : TAHAPAN_BAWAAN));
  }, [form?.category, form?.id_materi, supabase]);

  const ubah = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const ubahKriteria = (i: number, patch: Partial<Form['rubrik'][number]>) => ubah({ rubrik: form!.rubrik.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  const simpan = async () => {
    if (!form) return;
    setGalat(null);
    if (!form.pertanyaan.trim()) return setGalat('Teks pertanyaan belum diisi.');
    const bobot = Number(form.bobot);
    if (!Number.isFinite(bobot) || bobot < 0 || bobot > 100) return setGalat('Bobot harus antara 0 sampai 100.');
    const urutan = Number(form.urutan);
    if (!Number.isInteger(urutan) || urutan < 1) return setGalat('Nomor urut harus bilangan bulat mulai dari 1.');
    if (form.tipe === 'pg') {
      if (!form.opsi_a.trim() || !form.opsi_b.trim()) return setGalat('Isi minimal opsi A dan B.');
      const kunci = form.kunci_jawaban;
      if (!kunci || !form[`opsi_${kunci.toLowerCase()}` as 'opsi_a'].trim()) return setGalat('Pilih kunci jawaban dari opsi yang sudah diisi.');
    }
    const rubrik: KriteriaRubrik[] = [];
    if (form.tipe === 'essay') {
      for (let i = 0; i < form.rubrik.length; i++) {
        const k = form.rubrik[i];
        if (!k.label.trim() && !k.nilai.trim()) continue;
        const poin = Number(k.poin);
        if (!Number.isFinite(poin) || poin <= 0) return setGalat(`Kriteria ${i + 1}: poin harus lebih dari 0.`);
        if (k.jenis === 'angka' && !Number.isFinite(Number(k.nilai.replace(',', '.')))) return setGalat(`Kriteria ${i + 1}: nilai harus berupa angka (pakai titik atau koma untuk desimal).`);
        if (k.jenis === 'panjang' && !(Number(k.nilai) > 0)) return setGalat(`Kriteria ${i + 1}: isi jumlah kata minimal.`);
        if (k.jenis === 'kata' && !k.nilai.trim()) return setGalat(`Kriteria ${i + 1}: isi kata kunci yang dicari.`);
        rubrik.push({
          jenis: k.jenis,
          label: k.label.trim() || k.nilai.trim(),
          nilai: k.jenis === 'kata' ? k.nilai.trim() : Number(k.nilai.replace(',', '.')),
          ...(k.jenis === 'angka' && k.toleransi ? { toleransi: Number(k.toleransi.replace(',', '.')) || 0 } : {}),
          poin,
        });
      }
    }
    setMenyimpan(true);
    const formatAkhir = form.tipe === 'essay' ? daftarFormatAkhir(form) : null;
    const { ekstensi_kustom: _abaikanKustom, ...muatanForm } = form;
    const { error } = await supabase.rpc('simpan_soal', {
      p_soal: {
        ...muatanForm,
        bobot,
        urutan,
        id: form.id ?? '',
        id_materi: form.id_materi || '',
        tahap: form.category === 'lkpd' && form.id_materi ? form.tahap : '',
        jawaban_ideal: form.tipe === 'essay' ? form.jawaban_ideal : '',
        rubrik: form.tipe === 'essay' ? rubrik : [],
        format_file: formatAkhir,
      },
    });
    setMenyimpan(false);
    if (error) return setGalat(pesanGalat(error));
    onTersimpan({ baru: !form.id, kategori: form.category });
  };

  const totalRubrik = form?.rubrik.reduce((s, k) => s + (Number(k.poin) || 0), 0) ?? 0;

  return (
    <Modal
      open={form !== null}
      busy={menyimpan}
      lebar="lg"
      onClose={onClose}
      title={form?.id ? 'Ubah Soal' : 'Tambah Soal'}
      actions={
        <>
          <button type="button" onClick={onClose} disabled={menyimpan} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50">
            Batal
          </button>
          <button type="button" onClick={simpan} disabled={menyimpan} className="btn-press px-5 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
            {menyimpan && <Spinner />}
            {menyimpan ? 'Menyimpan...' : 'Simpan Soal'}
          </button>
        </>
      }
    >
      {form && (
        <div className="space-y-4 text-[#1F2A37]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-kategori" className="block text-xs font-bold mb-1.5">Kategori</label>
              <select id="f-kategori" value={form.category} onChange={(e) => ubah({ category: e.target.value as JenisPengerjaan })} className={inputClass}>
                {KATEGORI.map((k) => <option key={k} value={k}>{JENIS[k].judul}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-bab" className="block text-xs font-bold mb-1.5">Berlaku untuk</label>
              <select id="f-bab" value={form.id_materi} onChange={(e) => ubah({ id_materi: e.target.value })} className={inputClass}>
                <option value="">Semua bab (soal umum)</option>
                {materi.map((m) => <option key={m.id} value={m.id}>Bab {m.chapter_number}: {m.title}</option>)}
              </select>
            </div>
          </div>

          {form.category === 'lkpd' && form.id_materi && (
            <div>
              <label htmlFor="f-tahap" className="block text-xs font-bold mb-1.5">Tahap kegiatan LKPD</label>
              <select id="f-tahap" value={form.tahap} onChange={(e) => ubah({ tahap: e.target.value })} className={inputClass}>
                <option value="">— Tanpa tahap (tampil di akhir) —</option>
                {tahapan.map((t, i) => <option key={t.kunci} value={t.kunci}>{i + 1}. {t.judul}</option>)}
              </select>
            </div>
          )}

          <div className="surface-inset grid grid-cols-2 gap-1 p-1 rounded-xl" role="radiogroup" aria-label="Tipe soal">
            {(['pg', 'essay'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={form.tipe === t} onClick={() => ubah({ tipe: t })} className={`btn-press py-2 rounded-lg text-xs font-bold ${form.tipe === t ? 'bg-white text-[#1B4E80] shadow-[0_2px_6px_rgba(27,78,128,0.08)]' : 'text-[#66748C] hover:text-[#1B4E80]'}`}>
                {t === 'pg' ? 'Pilihan Ganda' : 'Uraian / Essay'}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="f-pertanyaan" className="block text-xs font-bold mb-1.5">Pertanyaan</label>
            <textarea id="f-pertanyaan" rows={3} value={form.pertanyaan} onChange={(e) => ubah({ pertanyaan: e.target.value })} className={`${inputClass} resize-y`} placeholder="Tulis pertanyaan..." />
          </div>

          {form.tipe === 'pg' ? (
            <fieldset>
              <legend className="block text-xs font-bold mb-1.5">Opsi jawaban — pilih bulatan untuk menandai kunci</legend>
              <div className="space-y-2">
                {OPSI.map((h) => {
                  const kunci = form.kunci_jawaban === h;
                  const kolom = `opsi_${h.toLowerCase()}` as 'opsi_a';
                  return (
                    <div key={h} className={`flex items-center gap-2 p-1.5 pr-2 rounded-xl border transition-colors ${kunci ? 'border-[#22B573] bg-[#F0FBF6]' : 'border-[#E6EEF7]'}`}>
                      <label className="flex items-center gap-1.5 pl-1.5 cursor-pointer shrink-0" title={`Jadikan ${h} kunci jawaban`}>
                        <input type="radio" name="kunci" checked={kunci} onChange={() => ubah({ kunci_jawaban: h })} className="w-4 h-4 accent-[#22B573]" aria-label={`Kunci jawaban ${h}`} />
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-extrabold ${kunci ? 'bg-[#22B573] text-white' : 'bg-[#F1F5F9] text-[#4B5A70]'}`}>{h}</span>
                      </label>
                      <input type="text" aria-label={`Opsi ${h}`} value={form[kolom]} onChange={(e) => ubah({ [kolom]: e.target.value } as Partial<Form>)} placeholder={h === 'A' || h === 'B' ? `Opsi ${h} (wajib)` : `Opsi ${h} (opsional)`} className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none bg-transparent" />
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-[#DCEAF7] bg-[#F4F9FF] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-extrabold text-[#1B4E80] flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-[#2E7BC4]" /> Format berkas / foto jawaban yang diterima
                  </p>
                  <button
                    type="button"
                    onClick={() => ubah({ format_file: [...FORMAT_DEFAULT_ESSAY], ekstensi_kustom: '' })}
                    className="text-xs font-bold text-[#2E7BC4] hover:underline"
                  >
                    Reset ke bawaan (PDF, Word, Gambar)
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Format berkas yang diizinkan">
                  {GRUP_FORMAT_ESSAY.map((g) => {
                    const dipilih = form.format_file.includes(g.kunci);
                    return (
                      <button
                        key={g.kunci}
                        type="button"
                        aria-pressed={dipilih}
                        onClick={() => {
                          if (g.kunci === '*') {
                            ubah({ format_file: dipilih ? [...FORMAT_DEFAULT_ESSAY] : ['*'], ekstensi_kustom: dipilih ? form.ekstensi_kustom : '' });
                            return;
                          }
                          const tanpaSemua = form.format_file.filter((x) => x !== '*');
                          const baru = tanpaSemua.includes(g.kunci)
                            ? tanpaSemua.filter((x) => x !== g.kunci)
                            : [...tanpaSemua, g.kunci];
                          ubah({ format_file: baru });
                        }}
                        className={`btn-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                          dipilih
                            ? 'bg-[#2E7BC4] border-[#2E7BC4] text-white shadow-sm'
                            : 'bg-white border-[#DCEAF7] text-[#4B5A70] hover:border-[#2E7BC4]/50'
                        }`}
                      >
                        {dipilih && <Check className="w-3.5 h-3.5" />}
                        {g.label}
                      </button>
                    );
                  })}
                </div>
                {!form.format_file.includes('*') && (
                  <div>
                    <label htmlFor="f-ekstensi-kustom" className="block text-xs font-bold text-[#4B5A70] mb-1">
                      Ekstensi khusus lainnya <span className="font-normal text-[#94A3B8]">(opsional, pisahkan dengan koma — mis. .ggb, .py)</span>
                    </label>
                    <input
                      id="f-ekstensi-kustom"
                      type="text"
                      value={form.ekstensi_kustom}
                      onChange={(e) => ubah({ ekstensi_kustom: e.target.value })}
                      placeholder="Contoh: .ggb, .svg"
                      className={kecil + ' w-full'}
                    />
                  </div>
                )}
                <p className="text-xs text-[#66748C]">
                  Aktif untuk siswa: <strong className="text-[#1B4E80]">{labelFormatFile(daftarFormatAkhir(form))}</strong>. Bila semua pilihan dikosongkan, sistem otomatis memakai bawaan (PDF, Word, Gambar). Siswa juga dapat memotret jawaban langsung dari kamera web.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E3D7FF] bg-[#FAF7FF] p-4 space-y-3">
                <p className="text-xs font-extrabold text-[#6D28D9] flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Bahan koreksi AI (tidak terlihat siswa)</p>
                <div>
                  <label htmlFor="f-ideal" className="block text-xs font-bold mb-1.5">Jawaban ideal</label>
                  <textarea id="f-ideal" rows={3} value={form.jawaban_ideal} onChange={(e) => ubah({ jawaban_ideal: e.target.value })} className={`${inputClass} resize-y`} placeholder="Contoh: Mean = 927/6 = 154,5 cm. Median = 153,5 cm. Modus = 152 cm." />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold">Rubrik penilaian</span>
                    <button type="button" onClick={() => ubah({ rubrik: [...form.rubrik, { jenis: 'angka', label: '', nilai: '', poin: '', toleransi: '' }] })} className="text-xs font-bold text-[#6D28D9] flex items-center gap-1 hover:underline">
                      <Plus className="w-3.5 h-3.5" /> Tambah kriteria
                    </button>
                  </div>
                  {form.rubrik.length === 0 ? (
                    <p className="text-xs text-[#66748C]">Belum ada kriteria. Tanpa rubrik, AI menilai berdasarkan jawaban ideal; mesin cadangan hanya membandingkan kemiripan.</p>
                  ) : (
                    <div className="space-y-2">
                      {form.rubrik.map((k, i) => (
                        <div key={i} className="grid grid-cols-[110px,1fr,90px,auto] sm:grid-cols-[120px,1.3fr,1fr,70px,auto] gap-1.5 items-center">
                          <select aria-label={`Jenis kriteria ${i + 1}`} value={k.jenis} onChange={(e) => ubahKriteria(i, { jenis: e.target.value as KriteriaRubrik['jenis'] })} className={kecil}>
                            <option value="angka">Angka hasil</option>
                            <option value="kata">Kata kunci</option>
                            <option value="panjang">Min. kata</option>
                          </select>
                          <input aria-label={`Keterangan kriteria ${i + 1}`} value={k.label} onChange={(e) => ubahKriteria(i, { label: e.target.value })} placeholder="Keterangan, mis. Mean = 154,5" className={`${kecil} hidden sm:block`} />
                          <input
                            aria-label={`Nilai kriteria ${i + 1}`}
                            value={k.nilai}
                            onChange={(e) => ubahKriteria(i, { nilai: e.target.value })}
                            placeholder={k.jenis === 'angka' ? '154,5' : k.jenis === 'kata' ? 'tengah|urut' : '10'}
                            className={kecil}
                          />
                          <input aria-label={`Poin kriteria ${i + 1}`} value={k.poin} inputMode="decimal" onChange={(e) => ubahKriteria(i, { poin: e.target.value })} placeholder="poin" className={`${kecil} tabular`} />
                          <button type="button" aria-label={`Hapus kriteria ${i + 1}`} onClick={() => ubah({ rubrik: form.rubrik.filter((_, j) => j !== i) })} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#E3543F] hover:bg-[#FDEAE7]">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <p className="text-xs text-[#66748C]">
                        Angka: hasil yang harus muncul (koma/titik desimal & pecahan dikenali). Kata kunci: pisahkan alternatif dengan &ldquo;|&rdquo;. Total poin rubrik {totalRubrik} akan disesuaikan ke bobot soal ({form.bobot || 0}).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-bobot" className="block text-xs font-bold mb-1.5">Bobot (poin)</label>
              <input id="f-bobot" type="number" min={0} max={100} value={form.bobot} onChange={(e) => ubah({ bobot: e.target.value })} className={`${inputClass} tabular`} />
            </div>
            <div>
              <label htmlFor="f-urutan" className="block text-xs font-bold mb-1.5">Nomor urut</label>
              <input id="f-urutan" type="number" min={1} value={form.urutan} onChange={(e) => ubah({ urutan: e.target.value })} className={`${inputClass} tabular`} />
            </div>
          </div>

          {form.id && (
            <p className="text-xs text-[#B45309] bg-[#FFF8EC] border border-[#FBD38D] rounded-lg px-3 py-2">
              Mengubah kunci atau bobot tidak menghitung ulang skor yang sudah tersimpan; guru tetap bisa menyesuaikan nilai akhir di panel koreksi.
            </p>
          )}

          {galat && (
            <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {galat}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
