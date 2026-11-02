-- Pembatalan migrasi 20261103_ringkasan_penyimpanan.sql (hanya menghapus fungsi baca; tidak ada data yang hilang).
begin;

drop function if exists public.ringkasan_penyimpanan();

notify pgrst, 'reload schema';

commit;
