-- elearnMath: amankan kunci jawaban & pengumpulan tugas.
--
-- Apa yang berubah:
--   1. Kolom questions.kunci_jawaban tidak bisa lagi dibaca langsung oleh siswa (anon/authenticated).
--   2. Skor pilihan ganda dihitung di database lewat fungsi kumpulkan_pengerjaan(), bukan di browser,
--      dan siswa tidak bisa lagi menulis langsung ke tabel pengumpulan (skor tidak bisa dipalsukan).
--   3. Sekali kumpul per siswa: LKPD & latihan per materi, evaluasi per siswa (tabel evaluasi tidak
--      punya id_materi). LKPD bisa dikumpulkan ulang hanya jika guru mencentang "Izin Pengerjaan Ulang".
--   4. Guru/admin membaca soal beserta kuncinya lewat fungsi soal_dengan_kunci().
--   5. Guru/admin boleh mengubah skor evaluasi; admin boleh menghapus data pengumpulan.
--
-- Cara pakai: jalankan SEKALI di Supabase > SQL Editor (aman dijalankan ulang).
-- Kode aplikasi versi ini MEMBUTUHKAN migrasi ini; jalankan sebelum deploy.
-- Pembatalan: lihat 20261025_kunci_jawaban_dan_pengumpulan.rollback.sql

begin;

-- Peran pengguna yang sedang login (melewati RLS tabel users agar aman dipakai di policy).
create or replace function public.peran_pengguna()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- Pengumpulan jawaban siswa. Skor pilihan ganda dihitung dari kunci_jawaban di sini.
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

-- Soal lengkap dengan kunci, khusus guru/admin (dipakai halaman koreksi).
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

revoke all on function public.peran_pengguna() from public, anon;
revoke all on function public.kumpulkan_pengerjaan(text, uuid, jsonb) from public, anon;
revoke all on function public.soal_dengan_kunci(text) from public, anon;
grant execute on function public.peran_pengguna() to authenticated;
grant execute on function public.kumpulkan_pengerjaan(text, uuid, jsonb) to authenticated;
grant execute on function public.soal_dengan_kunci(text) to authenticated;

-- Kunci jawaban tidak terbaca klien; kolom lain tetap bisa dibaca siswa yang login.
revoke select on public.questions from anon, authenticated;
grant select (id, category, urutan, tipe, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d, bobot, created_at)
  on public.questions to authenticated;

-- Pengumpulan hanya lewat kumpulkan_pengerjaan(); guru tetap bisa UPDATE untuk menilai.
revoke insert on public.jawaban_lkpd, public.pengerjaan_latihan, public.pengerjaan_evaluasi from anon, authenticated;
grant update on public.pengerjaan_evaluasi to authenticated;
grant delete on public.jawaban_lkpd, public.pengerjaan_latihan, public.pengerjaan_evaluasi, public.tab_switch_logs
  to authenticated;

drop policy if exists "elearnmath guru nilai evaluasi" on public.pengerjaan_evaluasi;
create policy "elearnmath guru nilai evaluasi" on public.pengerjaan_evaluasi
  for update to authenticated
  using (public.peran_pengguna() in ('guru', 'admin'))
  with check (public.peran_pengguna() in ('guru', 'admin'));

do $$
declare
  t text;
begin
  foreach t in array array['jawaban_lkpd', 'pengerjaan_latihan', 'pengerjaan_evaluasi', 'tab_switch_logs'] loop
    execute format('drop policy if exists %I on public.%I', 'elearnmath admin hapus', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.peran_pengguna() = %L)',
      'elearnmath admin hapus', t, 'admin'
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
