-- Membatalkan 20261025_kunci_jawaban_dan_pengumpulan.sql.
-- PERHATIAN: kode aplikasi versi baru memanggil kumpulkan_pengerjaan() dan soal_dengan_kunci();
-- setelah rollback, pengumpulan tugas & panel koreksi akan gagal sampai kode dikembalikan juga.

begin;

grant select on public.questions to anon, authenticated;
grant insert on public.jawaban_lkpd, public.pengerjaan_latihan, public.pengerjaan_evaluasi to anon, authenticated;

drop policy if exists "elearnmath guru nilai evaluasi" on public.pengerjaan_evaluasi;
drop policy if exists "elearnmath admin hapus" on public.jawaban_lkpd;
drop policy if exists "elearnmath admin hapus" on public.pengerjaan_latihan;
drop policy if exists "elearnmath admin hapus" on public.pengerjaan_evaluasi;
drop policy if exists "elearnmath admin hapus" on public.tab_switch_logs;

drop function if exists public.kumpulkan_pengerjaan(text, uuid, jsonb);
drop function if exists public.soal_dengan_kunci(text);
drop function if exists public.peran_pengguna();

notify pgrst, 'reload schema';

commit;
