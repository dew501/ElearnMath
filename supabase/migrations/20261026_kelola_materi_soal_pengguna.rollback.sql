-- Membatalkan 20261026_kelola_materi_soal_pengguna.sql (kembali ke kondisi migrasi 20261025).
-- Kolom questions.id_materi & pengerjaan_evaluasi.id_materi serta bucket "materi" SENGAJA tidak dihapus
-- agar data tidak hilang. PERHATIAN: halaman kelola materi, bank soal, dan admin pengguna akan gagal
-- menyimpan setelah rollback ini.

begin;

-- Fungsi pengumpulan versi migrasi 20261025 (soal tanpa per bab, evaluasi sekali per siswa)
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

  -- Urutan wajib: LKPD -> latihan -> evaluasi
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

  -- Simpan hanya jawaban untuk soal kategori ini; hitung skor pilihan ganda.
  for q in
    select id, tipe, kunci_jawaban, bobot from public.questions where category = p_jenis
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
    if exists (select 1 from public.pengerjaan_evaluasi where id_siswa = v_uid) then
      raise exception 'SUDAH_DIKUMPULKAN';
    end if;
    insert into public.pengerjaan_evaluasi (id_siswa, answers_json, score)
    values (v_uid, jsonb_build_object('answers', v_jawaban), v_skor)
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id, 'skor_pg', v_skor, 'maks_pg', v_maks);
end;
$$;

drop function if exists public.soal_dengan_kunci(text, uuid);
create or replace function public.soal_dengan_kunci(p_jenis text)
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
  return query select * from public.questions where category = p_jenis order by urutan;
end;
$$;
revoke all on function public.soal_dengan_kunci(text) from public, anon;
grant execute on function public.soal_dengan_kunci(text) to authenticated;

drop function if exists public.simpan_soal(jsonb);
drop function if exists public.hapus_soal(uuid);

drop policy if exists "elearnmath staf tambah materi" on public.materi;
drop policy if exists "elearnmath staf ubah materi" on public.materi;
drop policy if exists "elearnmath staf hapus materi" on public.materi;
drop policy if exists "elearnmath admin kelola pengguna" on public.users;
drop policy if exists "elearnmath staf lihat berkas" on storage.objects;
drop policy if exists "elearnmath staf unggah berkas" on storage.objects;
drop policy if exists "elearnmath staf ubah berkas" on storage.objects;
drop policy if exists "elearnmath staf hapus berkas" on storage.objects;

notify pgrst, 'reload schema';

commit;
