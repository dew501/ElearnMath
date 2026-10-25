'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { JENIS, OPSI, bobotSoal, pesanGalat, teksOpsi, type JenisPengerjaan, type Soal } from '@/lib/pengerjaan';
import { Plus, PencilLine, Trash2, Inbox, AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';

interface MateriRingkas {
  id: string;
  chapter_number: number | null;
  title: string | null;
}

interface FormSoal {
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
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-sm text-[#1F2A37] focus:outline-none focus:border-[#2E7BC4] focus:ring-4 focus:ring-[#2E7BC4]/10 transition-all';

const KATEGORI = Object.keys(JENIS) as JenisPengerjaan[];

export default function BankSoalPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profil, setProfil] = useState<{ nama: string; role: 'guru' | 'admin' } | null>(null);
  const [kategori, setKategori] = useState<JenisPengerjaan>('lkpd');
  const [cakupan, setCakupan] = useState<string>('semua');
  const [materi, setMateri] = useState<MateriRingkas[]>([]);
  const [soal, setSoal] = useState<Soal[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [form, setForm] = useState<FormSoal | null>(null);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hapus, setHapus] = useState<Soal | null>(null);
  const [menghapus, setMenghapus] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const namaBab = useCallback(
    (id: string | null | undefined) => {
      if (!id) return 'Semua bab';
      const m = materi.find((x) => x.id === id);
      return m ? `Bab ${m.chapter_number}: ${m.title}` : 'Bab terhapus';
    },
    [materi]
  );

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    const { data, error } = await supabase.rpc('soal_dengan_kunci', { p_jenis: kategori });
    if (error) setGalat(pesanGalat(error));
    setSoal((data ?? []) as Soal[]);
    setMemuat(false);
  }, [kategori, supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const [p, m] = await Promise.all([
        supabase.from('users').select('full_name, role').eq('id', user.id).maybeSingle(),
        supabase.from('materi').select('id, chapter_number, title').order('chapter_number', { ascending: true }),
      ]);
      setProfil({ nama: p.data?.full_name || user.email?.split('@')[0] || 'Guru', role: p.data?.role === 'admin' ? 'admin' : 'guru' });
      setMateri((m.data ?? []) as MateriRingkas[]);
    })();
  }, [router, supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Kelompok: soal umum lalu per bab (sesuai filter cakupan)
  const kelompok = useMemo(() => {
    const grup: { kunci: string; judul: string; isi: Soal[] }[] = [];
    const umum = soal.filter((q) => !q.id_materi);
    if (cakupan === 'semua' || cakupan === 'umum') grup.push({ kunci: 'umum', judul: 'Soal umum (dipakai semua bab)', isi: umum });
    materi.forEach((m) => {
      if (cakupan !== 'semua' && cakupan !== m.id) return;
      const isi = soal.filter((q) => q.id_materi === m.id);
      if (isi.length || cakupan === m.id) grup.push({ kunci: m.id, judul: `Soal khusus Bab ${m.chapter_number}: ${m.title}`, isi });
    });
    return grup;
  }, [soal, materi, cakupan]);

  // Total bobot yang benar-benar dikerjakan siswa per bab (soal umum + soal khusus bab itu)
  const totalPerBab = useMemo(() => {
    const umum = soal.filter((q) => !q.id_materi).reduce((s, q) => s + bobotSoal(q), 0);
    return materi.map((m) => ({ m, total: umum + soal.filter((q) => q.id_materi === m.id).reduce((s, q) => s + bobotSoal(q), 0) }));
  }, [soal, materi]);

  const bukaBaru = () => {
    const idMateri = cakupan !== 'semua' && cakupan !== 'umum' ? cakupan : '';
    const sejenis = soal.filter((q) => (q.id_materi ?? '') === idMateri);
    setGalatForm(null);
    setForm({
      id: null, category: kategori, id_materi: idMateri, tipe: 'pg', pertanyaan: '', opsi_a: '', opsi_b: '', opsi_c: '', opsi_d: '',
      kunci_jawaban: '', bobot: '50', urutan: String((sejenis.reduce((mx, q) => Math.max(mx, q.urutan ?? 0), 0) || 0) + 1),
    });
  };
  const bukaUbah = (q: Soal) => {
    setGalatForm(null);
    setForm({
      id: q.id, category: kategori, id_materi: q.id_materi ?? '', tipe: q.tipe === 'essay' ? 'essay' : 'pg', pertanyaan: q.pertanyaan ?? '',
      opsi_a: q.opsi_a ?? '', opsi_b: q.opsi_b ?? '', opsi_c: q.opsi_c ?? '', opsi_d: q.opsi_d ?? '',
      kunci_jawaban: (q.kunci_jawaban ?? '').toUpperCase(), bobot: String(q.bobot ?? 50), urutan: String(q.urutan ?? 1),
    });
  };

  const simpan = async () => {
    if (!form) return;
    setGalatForm(null);
    if (!form.pertanyaan.trim()) return setGalatForm('Teks pertanyaan belum diisi.');
    const bobot = Number(form.bobot);
    if (!Number.isFinite(bobot) || bobot < 0 || bobot > 100) return setGalatForm('Bobot harus antara 0 sampai 100.');
    const urutan = Number(form.urutan);
    if (!Number.isInteger(urutan) || urutan < 1) return setGalatForm('Nomor urut harus bilangan bulat mulai dari 1.');
    if (form.tipe === 'pg') {
      if (!form.opsi_a.trim() || !form.opsi_b.trim()) return setGalatForm('Isi minimal opsi A dan B.');
      const kunci = form.kunci_jawaban;
      if (!kunci || !form[`opsi_${kunci.toLowerCase()}` as 'opsi_a'].trim()) return setGalatForm('Pilih kunci jawaban dari opsi yang sudah diisi.');
    }
    setMenyimpan(true);
    const { error } = await supabase.rpc('simpan_soal', {
      p_soal: { ...form, bobot, urutan, id: form.id ?? '', id_materi: form.id_materi || '' },
    });
    setMenyimpan(false);
    if (error) return setGalatForm(pesanGalat(error));
    const pindahKategori = form.category !== kategori;
    setForm(null);
    setToast({ id: Date.now(), tone: 'success', text: form.id ? 'Soal diperbarui.' : 'Soal baru tersimpan.' });
    if (pindahKategori) setKategori(form.category);
    else muat();
  };

  const hapusSoal = async () => {
    if (!hapus) return;
    setMenghapus(true);
    const { error } = await supabase.rpc('hapus_soal', { p_id: hapus.id });
    setMenghapus(false);
    setHapus(null);
    if (error) return setToast({ id: Date.now(), tone: 'error', text: `Soal gagal dihapus. ${pesanGalat(error)}` });
    setToast({ id: Date.now(), tone: 'success', text: 'Soal dihapus.' });
    muat();
  };

  const ubahForm = (patch: Partial<FormSoal>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Bank Soal" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role ?? null} />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1040px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80]">Bank Soal</h1>
            <p className="text-xs text-[#66748C] mt-1">Soal umum dipakai semua bab; soal khusus hanya muncul di bab yang dipilih.</p>
          </div>
          <button
            type="button"
            onClick={bukaBaru}
            className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)]"
          >
            <Plus className="w-4 h-4" /> Tambah Soal
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5 anim-rise" style={{ ['--i' as string]: 1 }}>
          <div className="grid grid-cols-3 gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm" role="tablist">
            {KATEGORI.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kategori === k}
                onClick={() => setKategori(k)}
                className={`btn-press px-4 py-2 rounded-xl text-xs font-bold ${kategori === k ? 'bg-[#2E7BC4] text-white shadow-[0_4px_12px_rgba(46,123,196,0.3)]' : 'text-[#66748C] hover:text-[#1B4E80]'}`}
              >
                {JENIS[k].singkat}
              </button>
            ))}
          </div>
          <select
            value={cakupan}
            onChange={(e) => setCakupan(e.target.value)}
            aria-label="Filter cakupan soal"
            className="w-full sm:w-auto sm:max-w-xs min-w-0 truncate px-3 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80] focus:outline-none focus:border-[#2E7BC4]"
          >
            <option value="semua">Semua soal</option>
            <option value="umum">Hanya soal umum</option>
            {materi.map((m) => (
              <option key={m.id} value={m.id}>
                Khusus Bab {m.chapter_number}: {m.title}
              </option>
            ))}
          </select>
        </div>

        {!memuat && materi.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5" aria-label="Total bobot per bab">
            {totalPerBab.map(({ m, total }) => (
              <span
                key={m.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border ${
                  total === 100 ? 'bg-[#E4F8EE] border-[#BBF7D0] text-[#15885A]' : 'bg-[#FFF1DD] border-[#FBD38D] text-[#B45309]'
                }`}
                title="Total bobot = soal umum + soal khusus bab"
              >
                {total === 100 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {JENIS[kategori].singkat} Bab {m.chapter_number}: total bobot {total}
                {total !== 100 && ' (disarankan 100)'}
              </span>
            ))}
          </div>
        )}

        {galat && (
          <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {galat}
          </div>
        )}

        {memuat ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="glass-card p-5 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : kelompok.every((g) => g.isi.length === 0) ? (
          <div className="glass-card p-10 text-center anim-rise">
            <Inbox className="w-12 h-12 text-[#BFDBFE] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[#1B4E80]">Belum ada soal {JENIS[kategori].singkat} di cakupan ini.</p>
            <button type="button" onClick={bukaBaru} className="btn-press mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] text-white text-sm font-bold">
              <Plus className="w-4 h-4" /> Tambah Soal
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {kelompok.map((g) => (
              <section key={g.kunci} className="anim-rise">
                <h2 className="text-xs font-bold text-[#1B4E80] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4" /> {g.judul}
                  <span className="normal-case font-semibold text-[#94A3B8]">· {g.isi.length} soal · bobot {g.isi.reduce((s, q) => s + bobotSoal(q), 0)}</span>
                </h2>
                {g.isi.length === 0 ? (
                  <p className="text-xs text-[#66748C] px-1">Belum ada soal.</p>
                ) : (
                  <div className="space-y-3">
                    {g.isi.map((q) => (
                      <article key={q.id} className="glass-card p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2E7BC4] to-[#1B4E80] text-white text-xs font-extrabold flex items-center justify-center tabular">{q.urutan ?? '-'}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#EAF6FF] text-[#1B4E80]">{q.tipe === 'pg' ? 'Pilihan Ganda' : 'Uraian'}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#4B5A70]">Bobot {bobotSoal(q)}</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button type="button" onClick={() => bukaUbah(q)} className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#1B4E80] hover:bg-[#EAF6FF]">
                              <PencilLine className="w-3.5 h-3.5" /> Ubah
                            </button>
                            <button type="button" onClick={() => setHapus(q)} aria-label="Hapus soal" className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7]">
                              <Trash2 className="w-3.5 h-3.5" /> Hapus
                            </button>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-[#1F2A37] mt-3 leading-relaxed whitespace-pre-wrap">{q.pertanyaan}</p>
                        {q.tipe === 'pg' && (
                          <div className="grid sm:grid-cols-2 gap-1.5 mt-3">
                            {OPSI.map((h) => {
                              const t = teksOpsi(q, h);
                              if (!t) return null;
                              const kunci = (q.kunci_jawaban ?? '').toUpperCase() === h;
                              return (
                                <div key={h} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${kunci ? 'bg-[#E4F8EE] text-[#15885A] font-bold' : 'bg-white/70 text-[#4B5A70]'}`}>
                                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold ${kunci ? 'bg-[#22B573] text-white' : 'bg-[#F1F5F9]'}`}>{h}</span>
                                  {t}
                                  {kunci && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" />}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Form tambah / ubah soal */}
      <Modal
        open={form !== null}
        busy={menyimpan}
        lebar="lg"
        onClose={() => setForm(null)}
        title={form?.id ? 'Ubah Soal' : 'Tambah Soal'}
        actions={
          <>
            <button type="button" onClick={() => setForm(null)} disabled={menyimpan} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50">
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
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-kategori" className="block text-xs font-bold mb-1.5">Kategori</label>
                <select id="f-kategori" value={form.category} onChange={(e) => ubahForm({ category: e.target.value as JenisPengerjaan })} className={inputClass}>
                  {KATEGORI.map((k) => (
                    <option key={k} value={k}>{JENIS[k].judul}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-bab" className="block text-xs font-bold mb-1.5">Berlaku untuk</label>
                <select id="f-bab" value={form.id_materi} onChange={(e) => ubahForm({ id_materi: e.target.value })} className={inputClass}>
                  <option value="">Semua bab (soal umum)</option>
                  {materi.map((m) => (
                    <option key={m.id} value={m.id}>Bab {m.chapter_number}: {m.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-[#F4F9FF] border border-[#DCEAF7] rounded-xl" role="radiogroup" aria-label="Tipe soal">
              {(['pg', 'essay'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={form.tipe === t}
                  onClick={() => ubahForm({ tipe: t })}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors ${form.tipe === t ? 'bg-white text-[#1B4E80] shadow-sm' : 'text-[#66748C]'}`}
                >
                  {t === 'pg' ? 'Pilihan Ganda' : 'Uraian / Essay'}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="f-pertanyaan" className="block text-xs font-bold mb-1.5">Pertanyaan</label>
              <textarea id="f-pertanyaan" rows={3} value={form.pertanyaan} onChange={(e) => ubahForm({ pertanyaan: e.target.value })} className={`${inputClass} resize-y`} placeholder="Tulis pertanyaan..." />
            </div>

            {form.tipe === 'pg' && (
              <fieldset>
                <legend className="block text-xs font-bold mb-1.5">Opsi jawaban — pilih bulatan untuk menandai kunci</legend>
                <div className="space-y-2">
                  {OPSI.map((h) => {
                    const kunci = form.kunci_jawaban === h;
                    const kolom = `opsi_${h.toLowerCase()}` as 'opsi_a';
                    return (
                      <div key={h} className={`flex items-center gap-2 p-1.5 pr-2 rounded-xl border transition-colors ${kunci ? 'border-[#22B573] bg-[#F0FBF6]' : 'border-[#E6EEF7]'}`}>
                        <label className="flex items-center gap-1.5 pl-1.5 cursor-pointer shrink-0" title={`Jadikan ${h} kunci jawaban`}>
                          <input type="radio" name="kunci" checked={kunci} onChange={() => ubahForm({ kunci_jawaban: h })} className="w-4 h-4 accent-[#22B573]" aria-label={`Kunci jawaban ${h}`} />
                          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-extrabold ${kunci ? 'bg-[#22B573] text-white' : 'bg-[#F1F5F9] text-[#4B5A70]'}`}>{h}</span>
                        </label>
                        <input
                          type="text"
                          aria-label={`Opsi ${h}`}
                          value={form[kolom]}
                          onChange={(e) => ubahForm({ [kolom]: e.target.value } as Partial<FormSoal>)}
                          placeholder={h === 'A' || h === 'B' ? `Opsi ${h} (wajib)` : `Opsi ${h} (opsional)`}
                          className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none bg-transparent"
                        />
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="f-bobot" className="block text-xs font-bold mb-1.5">Bobot (poin)</label>
                <input id="f-bobot" type="number" min={0} max={100} value={form.bobot} onChange={(e) => ubahForm({ bobot: e.target.value })} className={`${inputClass} tabular`} />
              </div>
              <div>
                <label htmlFor="f-urutan" className="block text-xs font-bold mb-1.5">Nomor urut</label>
                <input id="f-urutan" type="number" min={1} value={form.urutan} onChange={(e) => ubahForm({ urutan: e.target.value })} className={`${inputClass} tabular`} />
              </div>
            </div>

            {form.id && (
              <p className="text-[11px] text-[#B45309] bg-[#FFF8EC] border border-[#FBD38D] rounded-lg px-3 py-2">
                Mengubah kunci atau bobot tidak menghitung ulang skor yang sudah tersimpan; guru tetap bisa menyesuaikan nilai akhir di panel koreksi.
              </p>
            )}

            {galatForm && (
              <div role="alert" className="p-3 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex gap-2 anim-shake">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {galatForm}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={hapus !== null}
        busy={menghapus}
        onClose={() => setHapus(null)}
        title="Hapus soal ini?"
        icon={
          <div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-[#C2412E]" />
          </div>
        }
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} disabled={menghapus} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50">
              Batal
            </button>
            <button type="button" onClick={hapusSoal} disabled={menghapus} className="btn-press px-5 py-2.5 rounded-xl bg-[#E3543F] hover:bg-[#C2412E] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {menghapus && <Spinner />}
              {menghapus ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </>
        }
      >
        <p className="line-clamp-3">&ldquo;{hapus?.pertanyaan}&rdquo;</p>
        <p className="mt-2">Jawaban siswa yang sudah terkumpul tetap tersimpan, tetapi soal ini tidak muncul lagi untuk siswa.</p>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
