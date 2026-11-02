-- Pembatalan migrasi 20261102_gambar_soal.sql
-- PERHATIAN: kolom questions.gambar ikut dihapus (data lampiran gambar soal hilang dari database).
-- Objek di bucket "gambar-soal" TIDAK dihapus otomatis; kosongkan lewat Supabase > Storage bila perlu,
-- lalu hapus bucket-nya secara manual.
begin;

drop policy if exists "elearnmath staf lihat gambar soal" on storage.objects;
drop policy if exists "elearnmath staf unggah gambar soal" on storage.objects;
drop policy if exists "elearnmath staf ubah gambar soal" on storage.objects;
drop policy if exists "elearnmath staf hapus gambar soal" on storage.objects;

-- Kembalikan simpan_soal ke versi migrasi 4 (20261029)
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

  if v_tipe = 'pg' then
    if v_a is null or v_b is null then
      raise exception 'OPSI_KURANG';
    end if;
    if v_kunci is null or v_kunci not in ('A', 'B', 'C', 'D')
       or (v_kunci = 'C' and v_c is null) or (v_kunci = 'D' and v_d is null) then
      raise exception 'KUNCI_TIDAK_VALID';
    end if;
    v_ideal := null;
    v_rubrik := null;
    v_format := null;
  else
    v_kunci := null;
    v_a := null; v_b := null; v_c := null; v_d := null;
  end if;

  if v_kategori <> 'lkpd' then
    v_tahap := null;
  end if;

  if v_id is null then
    insert into public.questions (category, id_materi, urutan, tipe, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d,
                                  kunci_jawaban, bobot, tahap, jawaban_ideal, rubrik, format_file)
    values (v_kategori, v_materi, v_urutan, v_tipe, v_pertanyaan, v_a, v_b, v_c, v_d,
            v_kunci, v_bobot, left(v_tahap, 40), left(v_ideal, 5000), v_rubrik, v_format)
    returning id into v_id;
  else
    update public.questions
       set category = v_kategori, id_materi = v_materi, urutan = v_urutan, tipe = v_tipe,
           pertanyaan = v_pertanyaan, opsi_a = v_a, opsi_b = v_b, opsi_c = v_c, opsi_d = v_d,
           kunci_jawaban = v_kunci, bobot = v_bobot, tahap = left(v_tahap, 40),
           jawaban_ideal = left(v_ideal, 5000), rubrik = v_rubrik, format_file = v_format
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

drop function if exists public.gambar_soal_valid(jsonb);
alter table public.questions drop column if exists gambar;

notify pgrst, 'reload schema';

commit;
