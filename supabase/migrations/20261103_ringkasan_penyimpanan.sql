-- elearnMath migrasi 6: ringkasan pemakaian penyimpanan untuk panel admin.
--
-- Apa yang berubah:
--   1. Fungsi ringkasan_penyimpanan() (khusus admin): jumlah & total ukuran berkas per bucket Storage
--      (dibaca langsung dari storage.objects) serta ukuran database, untuk kartu "Penyimpanan" di Ringkasan admin.
--      Fungsi hanya MEMBACA; tidak ada data yang diubah.
--
-- Prasyarat: migrasi 20261025 (fungsi peran_pengguna) sudah dijalankan.
-- Cara pakai: jalankan SEKALI di Supabase > SQL Editor (aman dijalankan ulang).
-- Pembatalan: 20261103_ringkasan_penyimpanan.rollback.sql

begin;

create or replace function public.ringkasan_penyimpanan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hasil jsonb;
begin
  if coalesce(public.peran_pengguna(), '') <> 'admin' then
    raise exception 'KHUSUS_ADMIN';
  end if;

  select jsonb_build_object(
    'bucket', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', b.id, 'publik', b.public, 'jumlah', coalesce(o.jumlah, 0), 'byte', coalesce(o.byte, 0))
               order by b.id)
        from storage.buckets b
        left join (
          select bucket_id,
                 count(*) as jumlah,
                 sum(case when (metadata ->> 'size') ~ '^[0-9]+$' then (metadata ->> 'size')::bigint else 0 end) as byte
            from storage.objects
           group by bucket_id
        ) o on o.bucket_id = b.id
    ), '[]'::jsonb),
    'database_byte', pg_database_size(current_database()),
    'diukur_pada', now()
  ) into v_hasil;

  return v_hasil;
end;
$$;

revoke all on function public.ringkasan_penyimpanan() from public, anon;
grant execute on function public.ringkasan_penyimpanan() to authenticated;

notify pgrst, 'reload schema';

commit;
