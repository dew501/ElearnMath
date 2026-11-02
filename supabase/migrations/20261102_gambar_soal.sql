-- elearnMath migrasi 5: lampiran gambar pada soal (dibuat guru) untuk soal pilihan ganda & essay.
--
-- Apa yang berubah:
--   1. questions.gambar (jsonb, NULL = tanpa gambar). Struktur:
--        { "pertanyaan": [ {path, name, ...}, ... maks 5 ],
--          "opsi": { "A": {path, ...} | null, "B": ..., "C": ..., "D": ... } }
--      Siswa boleh membaca kolom ini (sama seperti format_file).
--   2. Bucket Storage "gambar-soal" (publik-baca, maks 5 MB per objek, khusus gambar).
--      Hanya guru/admin yang boleh mengunggah, mengganti, dan menghapus objek.
--   3. simpan_soal() v5: memvalidasi & menyimpan kolom gambar. Opsi pilihan ganda dianggap terisi
--      bila berisi TEKS ATAU GAMBAR (opsi boleh berupa gambar saja).
--
-- Prasyarat: migrasi 20261025, 20261026, 20261027, dan 20261029 sudah dijalankan.
-- Cara pakai: jalankan SEKALI di Supabase > SQL Editor (aman dijalankan ulang).
-- Semua perubahan bersifat menambah; data soal & jawaban yang sudah ada tidak diubah.
-- Pembatalan: 20261102_gambar_soal.rollback.sql

begin;

-- 1. Kolom gambar pada bank soal ---------------------------------------------------------
alter table public.questions
  add column if not exists gambar jsonb;

grant select (gambar) on public.questions to authenticated;

-- Helper: validasi satu item gambar soal (objek dengan path di folder soal/ bucket gambar-soal)
create or replace function public.gambar_soal_valid(p_item jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_path text;
begin
  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    return false;
  end if;
  v_path := coalesce(p_item ->> 'path', '');
  if v_path !~ '^soal/[A-Za-z0-9_./-]+$' or position('..' in v_path) > 0 or length(v_path) > 300 then
    return false;
  end if;
  if length(p_item::text) > 4000 then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.gambar_soal_valid(jsonb) from public, anon;
grant execute on function public.gambar_soal_valid(jsonb) to authenticated;

-- 2. Bucket Storage publik-baca untuk gambar soal ----------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gambar-soal', 'gambar-soal', true, 5242880,
        array['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/bmp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "elearnmath staf lihat gambar soal" on storage.objects;
drop policy if exists "elearnmath staf unggah gambar soal" on storage.objects;
drop policy if exists "elearnmath staf ubah gambar soal" on storage.objects;
drop policy if exists "elearnmath staf hapus gambar soal" on storage.objects;

-- Storage butuh izin SELECT agar objek bisa dihapus lewat API (bucket tetap publik untuk dibaca siswa)
create policy "elearnmath staf lihat gambar soal" on storage.objects
  for select to authenticated
  using (bucket_id = 'gambar-soal' and public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf unggah gambar soal" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gambar-soal' and public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf ubah gambar soal" on storage.objects
  for update to authenticated
  using (bucket_id = 'gambar-soal' and public.peran_pengguna() in ('guru', 'admin'))
  with check (bucket_id = 'gambar-soal' and public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf hapus gambar soal" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gambar-soal' and public.peran_pengguna() in ('guru', 'admin'));

-- 3. Bank soal v5: format_file (migrasi 4) + gambar soal & gambar opsi -------------------
create or replace function public.simpan_soal(p_soal jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_soal ->> 'id', '')::uuid;
  v_kategori text := p_soal ->> 'category';
  v_tipe text := coalesce(nullif(p_soal ->> 'tipe', ''), 'pg');
  v_materi uuid := nullif(p_soal ->> 'id_materi', '')::uuid;
  v_kunci text := upper(nullif(trim(coalesce(p_soal ->> 'kunci_jawaban', '')), ''));
  v_bobot numeric := coalesce(nullif(p_soal ->> 'bobot', '')::numeric, 50);
  v_urutan integer := coalesce(nullif(p_soal ->> 'urutan', '')::integer, 1);
  v_pertanyaan text := trim(coalesce(p_soal ->> 'pertanyaan', ''));
  v_a text := nullif(trim(coalesce(p_soal ->> 'opsi_a', '')), '');
  v_b text := nullif(trim(coalesce(p_soal ->> 'opsi_b', '')), '');
  v_c text := nullif(trim(coalesce(p_soal ->> 'opsi_c', '')), '');
  v_d text := nullif(trim(coalesce(p_soal ->> 'opsi_d', '')), '');
  v_tahap text := nullif(trim(coalesce(p_soal ->> 'tahap', '')), '');
  v_ideal text := nullif(trim(coalesce(p_soal ->> 'jawaban_ideal', '')), '');
  v_rubrik jsonb := case when jsonb_typeof(p_soal -> 'rubrik') = 'array' then p_soal -> 'rubrik' else null end;
  v_format text[] := null;
  v_gbr_in jsonb := case when jsonb_typeof(p_soal -> 'gambar') = 'object' then p_soal -> 'gambar' else null end;
  v_gbr_tanya jsonb := '[]'::jsonb;
  v_gbr_opsi jsonb := '{}'::jsonb;
  v_gambar jsonb := null;
  v_item jsonb;
  v_huruf text;
begin
  if coalesce(public.peran_pengguna(), '') not in ('guru', 'admin') then
    raise exception 'KHUSUS_GURU';
  end if;
  if v_kategori is null or v_kategori not in ('lkpd', 'latihan', 'evaluasi') then
    raise exception 'JENIS_TIDAK_VALID';
  end if;
  if v_tipe not in ('pg', 'essay') then
    raise exception 'TIPE_TIDAK_VALID';
  end if;
  if v_pertanyaan = '' then
    raise exception 'PERTANYAAN_KOSONG';
  end if;
  if v_bobot < 0 or v_bobot > 100 then
    raise exception 'BOBOT_TIDAK_VALID';
  end if;
  if v_materi is not null and not exists (select 1 from public.materi where id = v_materi) then
    raise exception 'MATERI_TIDAK_ADA';
  end if;
  if p_soal ? 'rubrik' and jsonb_typeof(p_soal -> 'rubrik') not in ('array', 'null') then
    raise exception 'RUBRIK_TIDAK_VALID';
  end if;
  if v_rubrik is not null and (jsonb_array_length(v_rubrik) > 20 or length(v_rubrik::text) > 20000
     or exists (select 1 from jsonb_array_elements(v_rubrik) e where jsonb_typeof(e) <> 'object')) then
    raise exception 'RUBRIK_TIDAK_VALID';
  end if;
  if v_rubrik is not null and jsonb_array_length(v_rubrik) = 0 then
    v_rubrik := null;
  end if;

  if p_soal ? 'format_file' and jsonb_typeof(p_soal -> 'format_file') not in ('array', 'null') then
    raise exception 'FORMAT_FILE_TIDAK_VALID';
  end if;
  if jsonb_typeof(p_soal -> 'format_file') = 'array' then
    if jsonb_array_length(p_soal -> 'format_file') > 30 then
      raise exception 'FORMAT_FILE_TIDAK_VALID';
    end if;
    select array_agg(distinct lower(left(trim(x), 30)))
      into v_format
      from jsonb_array_elements_text(p_soal -> 'format_file') as t(x)
     where trim(x) <> '';
  end if;

  -- Gambar soal: validasi struktur, jumlah, dan path
  if p_soal ? 'gambar' and jsonb_typeof(p_soal -> 'gambar') not in ('object', 'null') then
    raise exception 'GAMBAR_TIDAK_VALID';
  end if;
  if v_gbr_in is not null then
    if v_gbr_in ? 'pertanyaan' and jsonb_typeof(v_gbr_in -> 'pertanyaan') not in ('array', 'null') then
      raise exception 'GAMBAR_TIDAK_VALID';
    end if;
    if jsonb_typeof(v_gbr_in -> 'pertanyaan') = 'array' then
      if jsonb_array_length(v_gbr_in -> 'pertanyaan') > 5 then
        raise exception 'GAMBAR_TERLALU_BANYAK';
      end if;
      for v_item in select * from jsonb_array_elements(v_gbr_in -> 'pertanyaan') loop
        if not public.gambar_soal_valid(v_item) then
          raise exception 'GAMBAR_TIDAK_VALID';
        end if;
        v_gbr_tanya := v_gbr_tanya || jsonb_build_array(v_item);
      end loop;
    end if;

    if v_gbr_in ? 'opsi' and jsonb_typeof(v_gbr_in -> 'opsi') not in ('object', 'null') then
      raise exception 'GAMBAR_TIDAK_VALID';
    end if;
    if jsonb_typeof(v_gbr_in -> 'opsi') = 'object' then
      if exists (select 1 from jsonb_object_keys(v_gbr_in -> 'opsi') k where k not in ('A', 'B', 'C', 'D')) then
        raise exception 'GAMBAR_TIDAK_VALID';
      end if;
      foreach v_huruf in array array['A', 'B', 'C', 'D'] loop
        v_item := v_gbr_in -> 'opsi' -> v_huruf;
        if v_item is null or jsonb_typeof(v_item) = 'null' then
          continue;
        end if;
        if not public.gambar_soal_valid(v_item) then
          raise exception 'GAMBAR_TIDAK_VALID';
        end if;
        v_gbr_opsi := v_gbr_opsi || jsonb_build_object(v_huruf, v_item);
      end loop;
    end if;
  end if;

  if v_tipe = 'pg' then
    -- Opsi dianggap terisi bila berisi teks ATAU gambar
    if (v_a is null and not v_gbr_opsi ? 'A') or (v_b is null and not v_gbr_opsi ? 'B') then
      raise exception 'OPSI_KURANG';
    end if;
    if v_kunci is null or v_kunci not in ('A', 'B', 'C', 'D')
       or (v_kunci = 'C' and v_c is null and not v_gbr_opsi ? 'C')
       or (v_kunci = 'D' and v_d is null and not v_gbr_opsi ? 'D') then
      raise exception 'KUNCI_TIDAK_VALID';
    end if;
    v_ideal := null;
    v_rubrik := null;
    v_format := null;
  else
    v_kunci := null;
    v_a := null; v_b := null; v_c := null; v_d := null;
    v_gbr_opsi := '{}'::jsonb;
  end if;

  if jsonb_array_length(v_gbr_tanya) > 0 or v_gbr_opsi <> '{}'::jsonb then
    v_gambar := jsonb_build_object('pertanyaan', v_gbr_tanya, 'opsi', v_gbr_opsi);
  end if;

  if v_kategori <> 'lkpd' then
    v_tahap := null;
  end if;

  if v_id is null then
    insert into public.questions (category, id_materi, urutan, tipe, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d,
                                  kunci_jawaban, bobot, tahap, jawaban_ideal, rubrik, format_file, gambar)
    values (v_kategori, v_materi, v_urutan, v_tipe, v_pertanyaan, v_a, v_b, v_c, v_d,
            v_kunci, v_bobot, left(v_tahap, 40), left(v_ideal, 5000), v_rubrik, v_format, v_gambar)
    returning id into v_id;
  else
    update public.questions
       set category = v_kategori, id_materi = v_materi, urutan = v_urutan, tipe = v_tipe,
           pertanyaan = v_pertanyaan, opsi_a = v_a, opsi_b = v_b, opsi_c = v_c, opsi_d = v_d,
           kunci_jawaban = v_kunci, bobot = v_bobot, tahap = left(v_tahap, 40),
           jawaban_ideal = left(v_ideal, 5000), rubrik = v_rubrik, format_file = v_format,
           gambar = v_gambar
     where id = v_id;
    if not found then
      raise exception 'SOAL_TIDAK_ADA';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.simpan_soal(jsonb) from public, anon;
grant execute on function public.simpan_soal(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
