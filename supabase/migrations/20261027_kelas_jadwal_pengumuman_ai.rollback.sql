-- Pembatalan migrasi 20261027_kelas_jadwal_pengumuman_ai.sql
-- PERHATIAN: tabel kelas, jadwal, agenda, pengumuman, notifikasi, aktivitas, lkpd, dan koreksi_ai beserta isinya DIHAPUS.
-- Kolom tambahan (users.nomor_induk, materi.terbit, questions.rubrik, dst.) dibiarkan agar data lama aman.
-- Fungsi kumpulkan_pengerjaan & simpan_soal dikembalikan ke versi migrasi 20261026.

begin;

drop trigger if exists elearnmath_profil_pengguna_baru on auth.users;
drop trigger if exists elearnmath_notif_akun on public.users;
drop trigger if exists elearnmath_notif_pengumpulan on public.jawaban_lkpd;
drop trigger if exists elearnmath_notif_kumpul_ulang on public.jawaban_lkpd;
drop trigger if exists elearnmath_notif_penilaian on public.jawaban_lkpd;
drop trigger if exists elearnmath_bersihkan_koreksi_ai on public.jawaban_lkpd;
drop trigger if exists elearnmath_notif_pengumpulan on public.pengerjaan_latihan;
drop trigger if exists elearnmath_notif_penilaian on public.pengerjaan_latihan;
drop trigger if exists elearnmath_bersihkan_koreksi_ai on public.pengerjaan_latihan;
drop trigger if exists elearnmath_notif_pengumpulan on public.pengerjaan_evaluasi;
drop trigger if exists elearnmath_notif_penilaian on public.pengerjaan_evaluasi;
drop trigger if exists elearnmath_bersihkan_koreksi_ai on public.pengerjaan_evaluasi;

drop policy if exists "elearnmath materi tersedia" on public.materi;
drop policy if exists "elearnmath lihat staf" on public.users;
do $$
declare
  t text;
begin
  foreach t in array array['jawaban_lkpd', 'pengerjaan_latihan', 'pengerjaan_evaluasi', 'tab_switch_logs'] loop
    execute format('drop policy if exists %I on public.%I', 'elearnmath guru hapus', t);
  end loop;
end;
$$;
-- Kebijakan "elearnmath baca materi" sengaja dibiarkan agar materi tetap terbaca (RLS materi tetap aktif).

drop table if exists public.koreksi_ai;
drop table if exists public.lkpd;
drop table if exists public.aktivitas;
drop table if exists public.notifikasi;
drop table if exists public.pengumuman;
drop table if exists public.agenda;
drop table if exists public.jadwal;
alter table public.users drop constraint if exists users_kelas_diminta_fkey;
update public.users set kelas_diminta = null where kelas_diminta is not null;
drop table if exists public.kelas_anggota;
drop table if exists public.kelas;

drop function if exists public.tinjau_pengerjaan(text, uuid);
drop function if exists public.profil_pengguna_baru();
drop function if exists public.notif_akun();
drop function if exists public.notif_agenda();
drop function if exists public.notif_pengumuman();
drop function if exists public.notif_penilaian();
drop function if exists public.notif_pengumpulan();
drop function if exists public.bersihkan_koreksi_ai();
drop function if exists public.simpan_koreksi_ai(text, uuid, jsonb, text, text);
drop function if exists public.tahapan_lkpd_bawaan() cascade;
drop function if exists public.catat_aktivitas(text, uuid, jsonb);
drop function if exists public.tandai_aktif();
drop function if exists public.baca_semua_notifikasi();
drop function if exists public._guru_untuk_siswa(uuid);
drop function if exists public._notif(uuid, text, text, text, text);
drop function if exists public.isi_pengumuman();
drop function if exists public.isi_pembuat();
drop function if exists public.sinkron_nama_kelas();
drop function if exists public.sinkron_kelas_siswa();
drop function if exists public.setujui_semua_menunggu();
drop function if exists public.setujui_pengguna(uuid, uuid);
drop function if exists public.atur_kelas_siswa(uuid, uuid);
drop function if exists public.ubah_profil(text, text);
drop function if exists public.kelas_saya();

-- Kembalikan fungsi versi migrasi 20261026
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

notify pgrst, 'reload schema';

commit;
