-- elearnMath migrasi 2: kelola materi & bank soal oleh guru, soal/evaluasi per bab,
-- kelola pengguna oleh admin, dan penyimpanan berkas materi (PDF/gambar).
--
-- Apa yang berubah:
--   1. questions.id_materi (NULL = soal berlaku untuk semua bab) dan pengerjaan_evaluasi.id_materi
--      (evaluasi kini tercatat per bab).
--   2. kumpulkan_pengerjaan() memakai soal umum + soal bab tersebut, evaluasi sekali per bab.
--   3. soal_dengan_kunci(p_jenis, p_id_materi) untuk guru/admin; simpan_soal() & hapus_soal() untuk
--      mengelola bank soal (kunci jawaban tetap tidak terbaca siswa).
--   4. Guru/admin boleh menambah, mengubah, menghapus materi.
--   5. Admin boleh mengubah data pengguna (persetujuan, peran, nama, kelas).
--   6. Bucket Storage "materi" (publik baca, maks 10 MB, PDF/gambar); hanya guru/admin yang bisa unggah/hapus.
--
-- Prasyarat: 20261025_kunci_jawaban_dan_pengumpulan.sql sudah dijalankan.
-- Cara pakai: jalankan SEKALI di Supabase > SQL Editor (aman dijalankan ulang).
-- Pembatalan: 20261026_kelola_materi_soal_pengguna.rollback.sql

begin;

-- 1. Soal & evaluasi per bab ------------------------------------------------------------
alter table public.questions
  add column if not exists id_materi uuid references public.materi(id) on delete cascade;
alter table public.pengerjaan_evaluasi
  add column if not exists id_materi uuid references public.materi(id) on delete cascade;
create index if not exists questions_category_materi_idx on public.questions (category, id_materi);
grant select (id_materi) on public.questions to authenticated;

-- 2. Pengumpulan memakai soal per bab ---------------------------------------------------
create or replace function public.kumpulkan_pengerjaan(p_jenis text, p_id_materi uuid, p_jawaban jsonb)
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
  v_skor numeric := 0;
  v_maks numeric := 0;
  v_lkpd_id uuid;
  v_boleh_ulang boolean;
  v_id uuid;
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
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then
    raise exception 'JAWABAN_TIDAK_VALID';
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

  -- Soal umum (id_materi NULL) + soal khusus bab ini
  for q in
    select id, tipe, kunci_jawaban, bobot
      from public.questions
     where category = p_jenis and (id_materi is null or id_materi = p_id_materi)
  loop
    if p_jawaban ? q.id::text then
      v_jawaban := v_jawaban || jsonb_build_object(q.id::text, left(p_jawaban ->> q.id::text, 20000));
    end if;
    if q.tipe = 'pg' then
      v_maks := v_maks + coalesce(q.bobot, 50);
      if q.kunci_jawaban is not null
         and upper(trim(coalesce(p_jawaban ->> q.id::text, ''))) = upper(trim(q.kunci_jawaban)) then
        v_skor := v_skor + coalesce(q.bobot, 50);
      end if;
    end if;
  end loop;

  if p_jenis = 'lkpd' then
    select id, coalesce(allow_retake, false) into v_lkpd_id, v_boleh_ulang
      from public.jawaban_lkpd
     where id_siswa = v_uid and id_materi = p_id_materi
     limit 1;
    if v_lkpd_id is not null then
      if not v_boleh_ulang then
        raise exception 'SUDAH_DIKUMPULKAN';
      end if;
      update public.jawaban_lkpd
         set file_answers_json = jsonb_build_object('answers', v_jawaban),
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
      values (v_uid, p_id_materi, jsonb_build_object('answers', v_jawaban), 'submitted', nullif(v_skor, 0))
      returning id into v_id;
    end if;
  elsif p_jenis = 'latihan' then
    if exists (select 1 from public.pengerjaan_latihan where id_siswa = v_uid and id_materi = p_id_materi) then
      raise exception 'SUDAH_DIKUMPULKAN';
    end if;
    insert into public.pengerjaan_latihan (id_siswa, id_materi, answers_json, score)
    values (v_uid, p_id_materi, jsonb_build_object('answers', v_jawaban), v_skor)
    returning id into v_id;
  else
    -- Evaluasi sekali per bab (baris lama tanpa id_materi dianggap berlaku untuk semua bab)
    if exists (
      select 1 from public.pengerjaan_evaluasi
       where id_siswa = v_uid and (id_materi = p_id_materi or id_materi is null)
    ) then
      raise exception 'SUDAH_DIKUMPULKAN';
    end if;
    insert into public.pengerjaan_evaluasi (id_siswa, id_materi, answers_json, score)
    values (v_uid, p_id_materi, jsonb_build_object('answers', v_jawaban), v_skor)
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'skor_pg', v_skor, 'maks_pg', v_maks);
end;
$$;

-- 3. Bank soal untuk guru/admin ---------------------------------------------------------
drop function if exists public.soal_dengan_kunci(text);
create or replace function public.soal_dengan_kunci(p_jenis text, p_id_materi uuid default null)
returns setof public.questions
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.peran_pengguna(), '') not in ('guru', 'admin') then
    raise exception 'KHUSUS_GURU';
  end if;
  return query
    select * from public.questions
     where category = p_jenis
       and (p_id_materi is null or id_materi is null or id_materi = p_id_materi)
     order by id_materi nulls first, urutan;
end;
$$;

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

  if v_tipe = 'pg' then
    if v_a is null or v_b is null then
      raise exception 'OPSI_KURANG';
    end if;
    if v_kunci is null or v_kunci not in ('A', 'B', 'C', 'D')
       or (v_kunci = 'C' and v_c is null) or (v_kunci = 'D' and v_d is null) then
      raise exception 'KUNCI_TIDAK_VALID';
    end if;
  else
    v_kunci := null;
    v_a := null; v_b := null; v_c := null; v_d := null;
  end if;

  if v_id is null then
    insert into public.questions (category, id_materi, urutan, tipe, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, kunci_jawaban, bobot)
    values (v_kategori, v_materi, v_urutan, v_tipe, v_pertanyaan, v_a, v_b, v_c, v_d, v_kunci, v_bobot)
    returning id into v_id;
  else
    update public.questions
       set category = v_kategori, id_materi = v_materi, urutan = v_urutan, tipe = v_tipe,
           pertanyaan = v_pertanyaan, opsi_a = v_a, opsi_b = v_b, opsi_c = v_c, opsi_d = v_d,
           kunci_jawaban = v_kunci, bobot = v_bobot
     where id = v_id;
    if not found then
      raise exception 'SOAL_TIDAK_ADA';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.hapus_soal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.peran_pengguna(), '') not in ('guru', 'admin') then
    raise exception 'KHUSUS_GURU';
  end if;
  delete from public.questions where id = p_id;
  if not found then
    raise exception 'SOAL_TIDAK_ADA';
  end if;
end;
$$;

revoke all on function public.soal_dengan_kunci(text, uuid) from public, anon;
revoke all on function public.simpan_soal(jsonb) from public, anon;
revoke all on function public.hapus_soal(uuid) from public, anon;
grant execute on function public.soal_dengan_kunci(text, uuid) to authenticated;
grant execute on function public.simpan_soal(jsonb) to authenticated;
grant execute on function public.hapus_soal(uuid) to authenticated;

-- 4. Guru/admin mengelola materi --------------------------------------------------------
grant insert, update, delete on public.materi to authenticated;
drop policy if exists "elearnmath staf tambah materi" on public.materi;
drop policy if exists "elearnmath staf ubah materi" on public.materi;
drop policy if exists "elearnmath staf hapus materi" on public.materi;
create policy "elearnmath staf tambah materi" on public.materi
  for insert to authenticated
  with check (public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf ubah materi" on public.materi
  for update to authenticated
  using (public.peran_pengguna() in ('guru', 'admin'))
  with check (public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf hapus materi" on public.materi
  for delete to authenticated
  using (public.peran_pengguna() in ('guru', 'admin'));

-- 5. Admin mengelola pengguna ------------------------------------------------------------
grant update on public.users to authenticated;
drop policy if exists "elearnmath admin kelola pengguna" on public.users;
create policy "elearnmath admin kelola pengguna" on public.users
  for update to authenticated
  using (public.peran_pengguna() = 'admin')
  with check (public.peran_pengguna() = 'admin');

-- 6. Penyimpanan berkas materi ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materi', 'materi', true, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "elearnmath staf lihat berkas" on storage.objects;
drop policy if exists "elearnmath staf unggah berkas" on storage.objects;
drop policy if exists "elearnmath staf ubah berkas" on storage.objects;
drop policy if exists "elearnmath staf hapus berkas" on storage.objects;
-- Storage butuh izin SELECT agar berkas bisa dihapus/ditimpa lewat API (bucket tetap publik untuk dibaca siswa)
create policy "elearnmath staf lihat berkas" on storage.objects
  for select to authenticated
  using (bucket_id = 'materi' and public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf unggah berkas" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materi' and public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf ubah berkas" on storage.objects
  for update to authenticated
  using (bucket_id = 'materi' and public.peran_pengguna() in ('guru', 'admin'))
  with check (bucket_id = 'materi' and public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf hapus berkas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materi' and public.peran_pengguna() in ('guru', 'admin'));

notify pgrst, 'reload schema';

commit;
