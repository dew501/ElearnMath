-- elearnMath migrasi 4: lampiran jawaban essay (foto kamera & multi-format), bucket privat
-- jawaban-essay, konfigurasi format file per soal oleh guru, serta penyimpanan hasil forensik AI.
--
-- Apa yang berubah:
--   1. questions.format_file (text[]): daftar grup/ekstensi file yang diterima pada soal essay.
--      NULL berarti memakai format bawaan: PDF, Word (.doc/.docx), dan Gambar.
--   2. Bucket Storage PRIVAT "jawaban-essay" (maks 25 MB per objek) dengan kebijakan RLS:
--      - Siswa hanya bisa mengunggah, melihat, dan menghapus berkas di dalam folder miliknya sendiri
--        (auth.uid()/...), dan berkas yang sudah dikunci pada pengumpulan final tidak bisa dihapus siswa.
--      - Guru dan admin bisa membaca seluruh berkas jawaban siswa serta menghapusnya saat reset pengumpulan.
--   3. simpan_soal() mendukung kolom format_file untuk soal uraian/essay.
--   4. kumpulkan_pengerjaan() mendukung parameter p_lampiran (maks 5 berkas per soal essay,
--      validasi kepemilikan path Storage & kecocokan format file) dan menyimpannya di kunci "attachments".
--   5. tinjau_pengerjaan() membuka pembahasan soal essay yang dijawab dengan teks maupun lampiran berkas.
--
-- Prasyarat: migrasi 20261025, 20261026, dan 20261027 sudah dijalankan.
-- Cara pakai: jalankan SEKALI di Supabase > SQL Editor (aman dijalankan ulang).
-- Pembatalan: 20261029_lampiran_essay_dan_deteksi_ai.rollback.sql

begin;

-- 1. Kolom konfigurasi format berkas pada bank soal ------------------------------------
alter table public.questions
  add column if not exists format_file text[];

grant select (format_file) on public.questions to authenticated;

-- Helper pencocokan ekstensi berkas terhadap aturan format_file soal essay
create or replace function public.format_berkas_diizinkan(p_nama text, p_format text[])
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ext text := lower(substring(coalesce(p_nama, '') from '\.([a-zA-Z0-9]+)$'));
  v_daftar text[] := case
    when p_format is null or cardinality(p_format) = 0 then array['pdf', 'word', 'image']
    else p_format
  end;
  f text;
begin
  if v_ext is null or v_ext = '' then
    return false;
  end if;
  foreach f in array v_daftar loop
    f := lower(trim(coalesce(f, '')));
    if f in ('*', 'all', 'semua', 'bebas') then
      return true;
    elsif f = 'pdf' and v_ext = 'pdf' then
      return true;
    elsif f = 'word' and v_ext in ('doc', 'docx', 'odt', 'rtf') then
      return true;
    elsif f = 'ppt' and v_ext in ('ppt', 'pptx', 'odp') then
      return true;
    elsif f = 'excel' and v_ext in ('xls', 'xlsx', 'ods', 'csv') then
      return true;
    elsif f = 'image' and v_ext in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif') then
      return true;
    elsif f = 'zip' and v_ext in ('zip', 'rar', '7z') then
      return true;
    elsif f = 'text' and v_ext in ('txt', 'md', 'csv') then
      return true;
    elsif ltrim(f, '.') = v_ext then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Cek apakah sebuah path berkas di Storage sudah terkunci pada pengumpulan final siswa
create or replace function public.berkas_jawaban_terkunci(p_uid uuid, p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_uid is null or p_path is null then
    return true;
  end if;
  if exists (
    select 1 from public.jawaban_lkpd j
     where j.id_siswa = p_uid
       and not coalesce(j.allow_retake, false)
       and jsonb_path_exists(coalesce(j.file_answers_json -> 'attachments', '{}'::jsonb), '$.*[*].path ? (@ == $p)', jsonb_build_object('p', p_path))
  ) then
    return true;
  end if;
  if exists (
    select 1 from public.pengerjaan_latihan t
     where t.id_siswa = p_uid
       and jsonb_path_exists(coalesce(t.answers_json -> 'attachments', '{}'::jsonb), '$.*[*].path ? (@ == $p)', jsonb_build_object('p', p_path))
  ) then
    return true;
  end if;
  if exists (
    select 1 from public.pengerjaan_evaluasi e
     where e.id_siswa = p_uid
       and jsonb_path_exists(coalesce(e.answers_json -> 'attachments', '{}'::jsonb), '$.*[*].path ? (@ == $p)', jsonb_build_object('p', p_path))
  ) then
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.format_berkas_diizinkan(text, text[]) from public, anon;
revoke all on function public.berkas_jawaban_terkunci(uuid, text) from public, anon;
grant execute on function public.format_berkas_diizinkan(text, text[]) to authenticated;
grant execute on function public.berkas_jawaban_terkunci(uuid, text) to authenticated;

-- 2. Bucket Storage privat untuk lampiran jawaban essay siswa ---------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jawaban-essay', 'jawaban-essay', false, 26214400, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "elearnmath siswa lihat berkas jawaban" on storage.objects;
drop policy if exists "elearnmath siswa unggah berkas jawaban" on storage.objects;
drop policy if exists "elearnmath siswa ubah berkas jawaban" on storage.objects;
drop policy if exists "elearnmath siswa hapus berkas jawaban" on storage.objects;
drop policy if exists "elearnmath staf lihat berkas jawaban" on storage.objects;
drop policy if exists "elearnmath staf hapus berkas jawaban" on storage.objects;

create policy "elearnmath siswa lihat berkas jawaban" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'jawaban-essay'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "elearnmath siswa unggah berkas jawaban" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'jawaban-essay'
    and public.peran_pengguna() = 'siswa'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "elearnmath siswa ubah berkas jawaban" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'jawaban-essay'
    and public.peran_pengguna() = 'siswa'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.berkas_jawaban_terkunci(auth.uid(), name)
  )
  with check (
    bucket_id = 'jawaban-essay'
    and public.peran_pengguna() = 'siswa'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "elearnmath siswa hapus berkas jawaban" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'jawaban-essay'
    and public.peran_pengguna() = 'siswa'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.berkas_jawaban_terkunci(auth.uid(), name)
  );

create policy "elearnmath staf lihat berkas jawaban" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'jawaban-essay'
    and public.peran_pengguna() in ('guru', 'admin')
  );

create policy "elearnmath staf hapus berkas jawaban" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'jawaban-essay'
    and public.peran_pengguna() in ('guru', 'admin')
  );

-- 3. Bank soal v4: mendukung konfigurasi format_file soal essay ------------------------
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

-- 4. Pengumpulan v4: menyimpan teks jawaban dan/atau lampiran berkas soal essay ---------
drop function if exists public.kumpulkan_pengerjaan(text, uuid, jsonb);

create or replace function public.kumpulkan_pengerjaan(
  p_jenis text,
  p_id_materi uuid,
  p_jawaban jsonb,
  p_lampiran jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_status text;
  v_jawaban jsonb := '{}'::jsonb;
  v_lampiran jsonb := '{}'::jsonb;
  v_muatan jsonb;
  v_skor numeric := 0;
  v_maks numeric := 0;
  v_lkpd_id uuid;
  v_boleh_ulang boolean;
  v_id uuid;
  v_daftar jsonb;
  v_bersih jsonb;
  v_item jsonb;
  v_path text;
  v_nama_asli text;
  q record;
begin
  if v_uid is null then
    raise exception 'BELUM_LOGIN';
  end if;

  select role, status_approval into v_role, v_status from public.users where id = v_uid;
  if v_role is distinct from 'siswa' then
    raise exception 'BUKAN_SISWA';
  end if;
  if v_status is distinct from 'APPROVED' then
    raise exception 'BELUM_DISETUJUI';
  end if;
  if p_jenis is null or p_jenis not in ('lkpd', 'latihan', 'evaluasi') then
    raise exception 'JENIS_TIDAK_VALID';
  end if;
  if p_id_materi is null or not exists (select 1 from public.materi where id = p_id_materi) then
    raise exception 'MATERI_TIDAK_ADA';
  end if;
  if not exists (
    select 1 from public.materi
     where id = p_id_materi and terbit
       and (tanggal_buka is null or tanggal_buka <= now())
       and (kelas_ids is null or kelas_ids && array(select public.kelas_saya()))
  ) then
    raise exception 'MATERI_BELUM_TERSEDIA';
  end if;
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then
    raise exception 'JAWABAN_TIDAK_VALID';
  end if;
  if p_lampiran is not null and jsonb_typeof(p_lampiran) <> 'object' then
    raise exception 'LAMPIRAN_TIDAK_VALID';
  end if;

  if p_jenis = 'latihan' and not exists (
    select 1 from public.jawaban_lkpd where id_siswa = v_uid and id_materi = p_id_materi
  ) then
    raise exception 'LKPD_BELUM';
  end if;
  if p_jenis = 'evaluasi' and not exists (
    select 1 from public.pengerjaan_latihan where id_siswa = v_uid and id_materi = p_id_materi
  ) then
    raise exception 'LATIHAN_BELUM';
  end if;

  for q in
    select id, tipe, kunci_jawaban, bobot, format_file
      from public.questions
     where category = p_jenis and (id_materi is null or id_materi = p_id_materi)
  loop
    if p_jawaban ? q.id::text then
      v_jawaban := v_jawaban || jsonb_build_object(q.id::text, left(coalesce(p_jawaban ->> q.id::text, ''), 20000));
    end if;

    if q.tipe = 'pg' then
      v_maks := v_maks + coalesce(q.bobot, 50);
      if q.kunci_jawaban is not null
         and upper(trim(coalesce(p_jawaban ->> q.id::text, ''))) = upper(trim(q.kunci_jawaban)) then
        v_skor := v_skor + coalesce(q.bobot, 50);
      end if;
    elsif p_lampiran is not null and p_lampiran ? q.id::text then
      v_daftar := p_lampiran -> q.id::text;
      if jsonb_typeof(v_daftar) <> 'array' then
        raise exception 'LAMPIRAN_TIDAK_VALID';
      end if;
      if jsonb_array_length(v_daftar) > 5 then
        raise exception 'LAMPIRAN_TERLALU_BANYAK';
      end if;
      v_bersih := '[]'::jsonb;
      for v_item in select * from jsonb_array_elements(v_daftar) loop
        if jsonb_typeof(v_item) <> 'object' then
          raise exception 'LAMPIRAN_TIDAK_VALID';
        end if;
        v_path := trim(coalesce(v_item ->> 'path', ''));
        v_nama_asli := trim(coalesce(nullif(v_item ->> 'original_name', ''), v_item ->> 'name', ''));
        -- Pastikan path berada di dalam folder milik siswa ini sendiri
        if v_path = '' or position('..' in v_path) > 0 or left(v_path, 37) <> (v_uid::text || '/') then
          raise exception 'LAMPIRAN_BUKAN_MILIK';
        end if;
        if not public.format_berkas_diizinkan(v_nama_asli, q.format_file)
           and not public.format_berkas_diizinkan(v_path, q.format_file) then
          raise exception 'FORMAT_BERKAS_DITOLAK';
        end if;
        if length(v_item::text) > 16000 then
          raise exception 'LAMPIRAN_TIDAK_VALID';
        end if;
        v_bersih := v_bersih || jsonb_build_array(v_item);
      end loop;
      if jsonb_array_length(v_bersih) > 0 then
        v_lampiran := v_lampiran || jsonb_build_object(q.id::text, v_bersih);
      end if;
    end if;
  end loop;

  v_muatan := case
    when v_lampiran = '{}'::jsonb then jsonb_build_object('answers', v_jawaban)
    else jsonb_build_object('answers', v_jawaban, 'attachments', v_lampiran)
  end;

  if p_jenis = 'lkpd' then
    select id, coalesce(allow_retake, false) into v_lkpd_id, v_boleh_ulang
      from public.jawaban_lkpd
     where id_siswa = v_uid and id_materi = p_id_materi
     limit 1;
    if v_lkpd_id is not null then
      if not v_boleh_ulang then
        raise exception 'SUDAH_DIKUMPULKAN';
      end if;
      delete from public.koreksi_ai where jenis = 'lkpd' and id_pengumpulan = v_lkpd_id;
      update public.jawaban_lkpd
         set file_answers_json = v_muatan,
             status = 'submitted',
             score = nullif(v_skor, 0),
             feedback = null,
             allow_retake = false,
             graded_at = null,
             created_at = now()
       where id = v_lkpd_id
      returning id into v_id;
    else
      insert into public.jawaban_lkpd (id_siswa, id_materi, file_answers_json, status, score)
      values (v_uid, p_id_materi, v_muatan, 'submitted', nullif(v_skor, 0))
      returning id into v_id;
    end if;
  elsif p_jenis = 'latihan' then
    if exists (select 1 from public.pengerjaan_latihan where id_siswa = v_uid and id_materi = p_id_materi) then
      raise exception 'SUDAH_DIKUMPULKAN';
    end if;
    insert into public.pengerjaan_latihan (id_siswa, id_materi, answers_json, score)
    values (v_uid, p_id_materi, v_muatan, v_skor)
    returning id into v_id;
  else
    if exists (
      select 1 from public.pengerjaan_evaluasi
       where id_siswa = v_uid and (id_materi = p_id_materi or id_materi is null)
    ) then
      raise exception 'SUDAH_DIKUMPULKAN';
    end if;
    insert into public.pengerjaan_evaluasi (id_siswa, id_materi, answers_json, score)
    values (v_uid, p_id_materi, v_muatan, v_skor)
    returning id into v_id;
  end if;

  update public.users set terakhir_aktif = now() where id = v_uid;
  insert into public.aktivitas (user_id, jenis, id_materi, detail)
  values (v_uid, 'kumpul_tugas', p_id_materi, jsonb_build_object('jenis', p_jenis));

  return jsonb_build_object('id', v_id, 'skor_pg', v_skor, 'maks_pg', v_maks);
end;
$$;

revoke all on function public.kumpulkan_pengerjaan(text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.kumpulkan_pengerjaan(text, uuid, jsonb, jsonb) to authenticated;

-- 5. Tinjau pengerjaan v4: buka pembahasan soal essay yang dijawab via teks maupun file
create or replace function public.tinjau_pengerjaan(p_jenis text, p_id_materi uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_raw jsonb;
  v_jawaban jsonb;
  v_lampiran jsonb;
  v_materi uuid;
  v_dinilai boolean := false;
  v_ulang boolean := false;
  v_hasil jsonb := '[]'::jsonb;
  v_jwb text;
  v_ada_isi boolean;
  v_buka boolean;
  q record;
begin
  if v_uid is null then
    raise exception 'BELUM_LOGIN';
  end if;
  if p_jenis is null or p_jenis not in ('lkpd', 'latihan', 'evaluasi') then
    raise exception 'JENIS_TIDAK_VALID';
  end if;

  if p_jenis = 'lkpd' then
    select file_answers_json, id_materi, status = 'graded', coalesce(allow_retake, false)
      into v_raw, v_materi, v_dinilai, v_ulang
      from public.jawaban_lkpd
     where id_siswa = v_uid and id_materi = p_id_materi
     limit 1;
  elsif p_jenis = 'latihan' then
    select answers_json, id_materi, feedback is not null
      into v_raw, v_materi, v_dinilai
      from public.pengerjaan_latihan
     where id_siswa = v_uid and id_materi = p_id_materi
     limit 1;
  else
    select answers_json, id_materi, dinilai_at is not null
      into v_raw, v_materi, v_dinilai
      from public.pengerjaan_evaluasi
     where id_siswa = v_uid and (id_materi = p_id_materi or id_materi is null)
     order by id_materi nulls last
     limit 1;
  end if;
  if not found then
    return null;
  end if;
  if v_ulang then
    return jsonb_build_object('dinilai', false, 'soal', '[]'::jsonb);
  end if;

  v_jawaban := case when jsonb_typeof(v_raw -> 'answers') = 'object' then v_raw -> 'answers' else '{}'::jsonb end;
  v_lampiran := case when jsonb_typeof(v_raw -> 'attachments') = 'object' then v_raw -> 'attachments' else '{}'::jsonb end;

  for q in
    select id, tipe, kunci_jawaban, jawaban_ideal, id_materi
      from public.questions
     where category = p_jenis and (id_materi is null or id_materi = p_id_materi)
  loop
    v_jwb := upper(trim(coalesce(v_jawaban ->> q.id::text, '')));
    v_ada_isi := (v_jawaban ? q.id::text and trim(coalesce(v_jawaban ->> q.id::text, '')) <> '')
                 or (v_lampiran ? q.id::text and jsonb_typeof(v_lampiran -> q.id::text) = 'array' and jsonb_array_length(v_lampiran -> q.id::text) > 0);
    v_buka := coalesce(v_dinilai, false) and q.id_materi is not null and q.id_materi = v_materi and (v_ada_isi or v_jawaban ? q.id::text);
    v_hasil := v_hasil || jsonb_build_array(jsonb_build_object(
      'id', q.id,
      'benar', case when q.tipe = 'pg' and nullif(trim(coalesce(q.kunci_jawaban, '')), '') is not null and v_jwb <> ''
                    then v_jwb = upper(trim(q.kunci_jawaban)) end,
      'kunci', case when v_buka and q.tipe = 'pg' then nullif(upper(trim(coalesce(q.kunci_jawaban, ''))), '') end,
      'pembahasan', case when v_buka and q.tipe <> 'pg' then nullif(trim(coalesce(q.jawaban_ideal, '')), '') end
    ));
  end loop;

  return jsonb_build_object('dinilai', coalesce(v_dinilai, false), 'soal', v_hasil);
end;
$$;

revoke all on function public.tinjau_pengerjaan(text, uuid) from public, anon;
grant execute on function public.tinjau_pengerjaan(text, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

