'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Navbar } from '@/components/navbar';
import { StaffNav } from '@/components/staff-nav';
import { Modal } from '@/components/ui/modal';
import { Toast, type ToastData } from '@/components/ui/toast';
import { Skeleton, Spinner } from '@/components/ui/skeleton';
import { FormSoal, type AwalSoal, type MateriRingkas } from '@/components/form-soal';
import { JENIS, OPSI, TAHAPAN_BAWAAN, bobotSoal, pesanGalat, teksOpsi, type JenisPengerjaan, type Soal } from '@/lib/pengerjaan';
import { Plus, PencilLine, Trash2, Inbox, AlertTriangle, CheckCircle2, ListChecks, Sparkles, Layers } from 'lucide-react';

const KATEGORI = Object.keys(JENIS) as JenisPengerjaan[];
const namaTahap = (k?: string | null) => TAHAPAN_BAWAAN.find((t) => t.kunci === k)?.judul ?? k;

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
  const [awal, setAwal] = useState<AwalSoal | null>(null);
  const [hapus, setHapus] = useState<Soal | null>(null);
  const [menghapus, setMenghapus] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

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
    setAwal({ category: kategori, id_materi: idMateri || null, tipe: 'pg', bobot: 50, urutan: (sejenis.reduce((mx, q) => Math.max(mx, q.urutan ?? 0), 0) || 0) + 1 });
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

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Bank Soal" userRole={profil?.role ?? null} userName={profil?.nama ?? '…'} />
      <StaffNav role={profil?.role ?? null} />

      <div className="flex-1 p-5 sm:p-6 md:p-8 max-w-[1040px] w-full mx-auto">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5 anim-rise">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1B4E80]">Bank Soal</h1>
            <p className="text-xs text-[#66748C] mt-1">Soal umum dipakai semua bab; soal khusus hanya muncul di bab yang dipilih. Soal uraian bisa diberi rubrik untuk koreksi AI.</p>
          </div>
          <button type="button" onClick={bukaBaru} className="btn-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2E7BC4] hover:bg-[#1B4E80] text-white text-sm font-bold shadow-[0_6px_16px_rgba(46,123,196,0.3)]">
            <Plus className="w-4 h-4" /> Tambah Soal
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5 anim-rise" style={{ ['--i' as string]: 1 }}>
          <div className="grid grid-cols-3 gap-1 p-1.5 bg-white/90 border border-[#DCEAF7] rounded-2xl shadow-sm" role="tablist">
            {KATEGORI.map((k) => (
              <button key={k} role="tab" aria-selected={kategori === k} onClick={() => setKategori(k)} className={`btn-press px-4 py-2 rounded-xl text-xs font-bold ${kategori === k ? 'bg-[#2E7BC4] text-white shadow-[0_4px_12px_rgba(46,123,196,0.3)]' : 'text-[#66748C] hover:text-[#1B4E80]'}`}>
                {JENIS[k].singkat}
              </button>
            ))}
          </div>
          <select value={cakupan} onChange={(e) => setCakupan(e.target.value)} aria-label="Filter cakupan soal" className="w-full sm:w-auto sm:max-w-xs min-w-0 truncate px-3 py-2.5 rounded-xl border border-[#DCEAF7] bg-white text-xs font-semibold text-[#1B4E80] focus:outline-none focus:border-[#2E7BC4]">
            <option value="semua">Semua soal</option>
            <option value="umum">Hanya soal umum</option>
            {materi.map((m) => <option key={m.id} value={m.id}>Khusus Bab {m.chapter_number}: {m.title}</option>)}
          </select>
        </div>

        {!memuat && materi.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5" aria-label="Total bobot per bab">
            {totalPerBab.map(({ m, total }) => (
              <span key={m.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border ${total === 100 ? 'bg-[#E4F8EE] border-[#BBF7D0] text-[#15885A]' : 'bg-[#FFF1DD] border-[#FBD38D] text-[#B45309]'}`} title="Total bobot = soal umum + soal khusus bab">
                {total === 100 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {JENIS[kategori].singkat} Bab {m.chapter_number}: total bobot {total}
                {total !== 100 && ' (disarankan 100)'}
              </span>
            ))}
          </div>
        )}

        {galat && (
          <div role="alert" className="mb-5 p-4 rounded-xl bg-[#FDEAE7] border border-[#FECACA] text-[#991B1B] text-xs font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {galat}</div>
        )}

        {memuat ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="glass-card p-5 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
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
                            {q.tahap && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FFF1DD] text-[#B45309]"><Layers className="w-3 h-3" /> {namaTahap(q.tahap)}</span>
                            )}
                            {q.tipe !== 'pg' && (
                              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${q.rubrik?.length ? 'bg-[#F3E8FF] text-[#6D28D9]' : q.jawaban_ideal ? 'bg-[#F3E8FF] text-[#7C3AED]' : 'bg-[#F1F5F9] text-[#94A3B8]'}`}>
                                <Sparkles className="w-3 h-3" /> {q.rubrik?.length ? `Rubrik ${q.rubrik.length} kriteria` : q.jawaban_ideal ? 'Ada jawaban ideal' : 'Belum ada bahan koreksi AI'}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button type="button" onClick={() => setAwal({ ...q, category: kategori })} className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#1B4E80] hover:bg-[#EAF6FF]">
                              <PencilLine className="w-3.5 h-3.5" /> Ubah
                            </button>
                            <button type="button" onClick={() => setHapus(q)} aria-label="Hapus soal" className="btn-press inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#C2412E] hover:bg-[#FDEAE7]">
                              <Trash2 className="w-3.5 h-3.5" /> Hapus
                            </button>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-[#1F2A37] mt-3 leading-relaxed whitespace-pre-wrap">{q.pertanyaan}</p>
                        {q.tipe === 'pg' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3">
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
                        {q.tipe !== 'pg' && q.jawaban_ideal && (
                          <p className="mt-3 text-xs text-[#4B5A70] bg-white/70 rounded-lg px-3 py-2"><span className="font-bold text-[#6D28D9]">Jawaban ideal:</span> {q.jawaban_ideal}</p>
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

      <FormSoal
        awal={awal}
        materi={materi}
        onClose={() => setAwal(null)}
        onTersimpan={({ baru, kategori: k }) => {
          setAwal(null);
          setToast({ id: Date.now(), tone: 'success', text: baru ? 'Soal baru tersimpan.' : 'Soal diperbarui.' });
          if (k !== kategori) setKategori(k);
          else muat();
        }}
      />

      <Modal
        open={hapus !== null}
        busy={menghapus}
        onClose={() => setHapus(null)}
        title="Hapus soal ini?"
        icon={<div className="w-12 h-12 rounded-2xl bg-[#FDEAE7] flex items-center justify-center"><Trash2 className="w-6 h-6 text-[#C2412E]" /></div>}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setHapus(null)} disabled={menghapus} className="btn-press px-5 py-2.5 rounded-xl border border-[#DCEAF7] text-[#4B5A70] font-bold text-sm hover:bg-[#F4F9FF] disabled:opacity-50">Batal</button>
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
