-- Pembatalan migrasi 20261029_lampiran_essay_dan_deteksi_ai.sql
begin;

drop policy if exists "elearnmath siswa lihat berkas jawaban" on storage.objects;
drop policy if exists "elearnmath siswa unggah berkas jawaban" on storage.objects;
drop policy if exists "elearnmath siswa ubah berkas jawaban" on storage.objects;
drop policy if exists "elearnmath siswa hapus berkas jawaban" on storage.objects;
drop policy if exists "elearnmath staf lihat berkas jawaban" on storage.objects;
drop policy if exists "elearnmath staf hapus berkas jawaban" on storage.objects;

drop function if exists public.berkas_jawaban_terkunci(uuid, text);
drop function if exists public.format_berkas_diizinkan(text, text[]);
drop function if exists public.kumpulkan_pengerjaan(text, uuid, jsonb, jsonb);

-- Kembalikan fungsi kumpulkan_pengerjaan & simpan_soal ke versi migrasi 3 (20261027)
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
  if v_uid is null then raise exception 'BELUM_LOGIN'; end if;
  select role, status_approval into v_role, v_status from public.users where id = v_uid;
  if v_role is distinct from 'siswa' then raise exception 'BUKAN_SISWA'; end if;
  if v_status is distinct from 'APPROVED' then raise exception 'BELUM_DISETUJUI'; end if;
  if p_jenis is null or p_jenis not in ('lkpd', 'latihan', 'evaluasi') then raise exception 'JENIS_TIDAK_VALID'; end if;
  if p_id_materi is null or not exists (select 1 from public.materi where id = p_id_materi) then raise exception 'MATERI_TIDAK_ADA'; end if;
  if not exists (
    select 1 from public.materi
     where id = p_id_materi and terbit
       and (tanggal_buka is null or tanggal_buka <= now())
       and (kelas_ids is null or kelas_ids && array(select public.kelas_saya()))
  ) then raise exception 'MATERI_BELUM_TERSEDIA'; end if;
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then raise exception 'JAWABAN_TIDAK_VALID'; end if;
  if p_jenis = 'latihan' and not exists (select 1 from public.jawaban_lkpd where id_siswa = v_uid and id_materi = p_id_materi) then raise exception 'LKPD_BELUM'; end if;
  if p_jenis = 'evaluasi' and not exists (select 1 from public.pengerjaan_latihan where id_siswa = v_uid and id_materi = p_id_materi) then raise exception 'LATIHAN_BELUM'; end if;

  for q in
    select id, tipe, kunci_jawaban, bobot from public.questions
     where category = p_jenis and (id_materi is null or id_materi = p_id_materi)
  loop
    if p_jawaban ? q.id::text then
      v_jawaban := v_jawaban || jsonb_build_object(q.id::text, left(p_jawaban ->> q.id::text, 20000));
    end if;
    if q.tipe = 'pg' then
      v_maks := v_maks + coalesce(q.bobot, 50);
      if q.kunci_jawaban is not null and upper(trim(coalesce(p_jawaban ->> q.id::text, ''))) = upper(trim(q.kunci_jawaban)) then
        v_skor := v_skor + coalesce(q.bobot, 50);
      end if;
    end if;
  end loop;

  if p_jenis = 'lkpd' then
    select id, coalesce(allow_retake, false) into v_lkpd_id, v_boleh_ulang
      from public.jawaban_lkpd where id_siswa = v_uid and id_materi = p_id_materi limit 1;
    if v_lkpd_id is not null then
      if not v_boleh_ulang then raise exception 'SUDAH_DIKUMPULKAN'; end if;
      delete from public.koreksi_ai where jenis = 'lkpd' and id_pengumpulan = v_lkpd_id;
      update public.jawaban_lkpd
         set file_answers_json = jsonb_build_object('answers', v_jawaban), status = 'submitted', score = nullif(v_skor, 0),
             feedback = null, allow_retake = false, graded_at = null, created_at = now()
       where id = v_lkpd_id returning id into v_id;
    else
      insert into public.jawaban_lkpd (id_siswa, id_materi, file_answers_json, status, score)
      values (v_uid, p_id_materi, jsonb_build_object('answers', v_jawaban), 'submitted', nullif(v_skor, 0))
      returning id into v_id;
    end if;
  elsif p_jenis = 'latihan' then
    if exists (select 1 from public.pengerjaan_latihan where id_siswa = v_uid and id_materi = p_id_materi) then raise exception 'SUDAH_DIKUMPULKAN'; end if;
    insert into public.pengerjaan_latihan (id_siswa, id_materi, answers_json, score)
    values (v_uid, p_id_materi, jsonb_build_object('answers', v_jawaban), v_skor) returning id into v_id;
  else
    if exists (select 1 from public.pengerjaan_evaluasi where id_siswa = v_uid and (id_materi = p_id_materi or id_materi is null)) then raise exception 'SUDAH_DIKUMPULKAN'; end if;
    insert into public.pengerjaan_evaluasi (id_siswa, id_materi, answers_json, score)
    values (v_uid, p_id_materi, jsonb_build_object('answers', v_jawaban), v_skor) returning id into v_id;
  end if;

  update public.users set terakhir_aktif = now() where id = v_uid;
  insert into public.aktivitas (user_id, jenis, id_materi, detail)
  values (v_uid, 'kumpul_tugas', p_id_materi, jsonb_build_object('jenis', p_jenis));

  return jsonb_build_object('id', v_id, 'skor_pg', v_skor, 'maks_pg', v_maks);
end;
$$;

revoke all on function public.kumpulkan_pengerjaan(text, uuid, jsonb) from public, anon;
grant execute on function public.kumpulkan_pengerjaan(text, uuid, jsonb) to authenticated;

alter table public.questions drop column if exists format_file;

notify pgrst, 'reload schema';

commit;

