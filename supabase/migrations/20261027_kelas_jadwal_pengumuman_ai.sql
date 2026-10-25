-- elearnMath migrasi 3: kelas, jadwal, agenda, pengumuman, notifikasi, aktivitas siswa, LKPD bertahap,
-- koreksi AI dengan validasi guru, registrasi akun, dan ketersediaan materi.
--
-- Apa yang berubah:
--   1. Kelas & anggota kelas (guru/siswa). users.class_name tetap ada dan disinkronkan otomatis dari kelas.
--      Data kelas lama (teks class_name) dipindahkan menjadi data kelas.
--   2. Jadwal mengajar (dikelola admin) dan agenda kelas (dibuat guru untuk kelasnya).
--   3. Pengumuman (guru untuk kelasnya, admin untuk kelas tertentu atau seluruh sekolah).
--   4. Notifikasi (lonceng) yang dibuat otomatis: tugas masuk → guru, nilai/izin ulang → siswa,
--      pengumuman & agenda → siswa, akun baru → admin.
--   5. Log aktivitas & status online (users.terakhir_aktif); log keluar tab kini mencatat bab & bagian.
--   6. Materi: status terbit, tanggal buka, kelas tujuan, dan isi per bagian (subbab).
--   7. LKPD bertahap (tujuan, petunjuk, tahapan aktivitas konstruktivis) dan soal per tahap.
--   8. Koreksi AI: jawaban ideal & rubrik soal uraian, saran koreksi yang wajib divalidasi guru.
--   9. Evaluasi punya catatan guru & penanda sudah dinilai; guru boleh menghapus pengumpulan.
--  10. Pendaftaran akun mandiri (siswa/guru) → status Menunggu sampai disetujui admin.
--
-- Prasyarat: migrasi 20261025 dan 20261026 sudah dijalankan.
-- Cara pakai: jalankan SEKALI di Supabase > SQL Editor (aman dijalankan ulang).
-- Pembatalan: 20261027_kelas_jadwal_pengumuman_ai.rollback.sql

begin;

-- 0. Kolom tambahan --------------------------------------------------------------------
alter table public.users add column if not exists nomor_induk text;
alter table public.users add column if not exists terakhir_aktif timestamptz;
alter table public.users add column if not exists kelas_diminta uuid;

alter table public.tab_switch_logs add column if not exists id_materi uuid references public.materi(id) on delete set null;
alter table public.tab_switch_logs add column if not exists bagian text;

alter table public.pengerjaan_evaluasi add column if not exists feedback text;
alter table public.pengerjaan_evaluasi add column if not exists dinilai_at timestamptz;

alter table public.materi add column if not exists terbit boolean not null default true;
alter table public.materi add column if not exists tanggal_buka timestamptz;
alter table public.materi add column if not exists kelas_ids uuid[];
alter table public.materi add column if not exists bagian_json jsonb;

alter table public.questions add column if not exists tahap text;
alter table public.questions add column if not exists jawaban_ideal text;
alter table public.questions add column if not exists rubrik jsonb;
-- Siswa boleh tahu tahap soal; jawaban ideal & rubrik tetap rahasia (hanya lewat soal_dengan_kunci)
grant select (tahap) on public.questions to authenticated;

-- Isi materi lama menjadi bagian pertama; judul subbab lain menjadi bagian kosong
update public.materi m
   set bagian_json = (
     select jsonb_agg(
              jsonb_build_object('judul', s.judul, 'konten', case when s.i = 1 then coalesce(m.content_html, '') else '' end)
              order by s.i)
       from jsonb_array_elements_text(
              case when jsonb_typeof(m.subbab_json) = 'array' and jsonb_array_length(m.subbab_json) > 0
                   then m.subbab_json else jsonb_build_array(coalesce(m.title, 'Materi')) end
            ) with ordinality as s(judul, i)
   )
 where m.bagian_json is null;

-- 1. Kelas -----------------------------------------------------------------------------
create table if not exists public.kelas (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  tingkat text,
  tahun_ajaran text,
  deskripsi text,
  created_at timestamptz not null default now()
);
create unique index if not exists kelas_nama_unik on public.kelas (lower(nama));

create table if not exists public.kelas_anggota (
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  peran text not null check (peran in ('guru', 'siswa')),
  created_at timestamptz not null default now(),
  primary key (kelas_id, user_id)
);
-- Satu siswa hanya di satu kelas; guru boleh mengampu banyak kelas
create unique index if not exists kelas_anggota_satu_kelas_siswa on public.kelas_anggota (user_id) where peran = 'siswa';
create index if not exists kelas_anggota_user_idx on public.kelas_anggota (user_id);

alter table public.users drop constraint if exists users_kelas_diminta_fkey;
update public.users set kelas_diminta = null
 where kelas_diminta is not null and not exists (select 1 from public.kelas k where k.id = kelas_diminta);
alter table public.users add constraint users_kelas_diminta_fkey
  foreign key (kelas_diminta) references public.kelas(id) on delete set null;

-- Kelas milik pengguna yang sedang login
create or replace function public.kelas_saya()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select kelas_id from public.kelas_anggota where user_id = auth.uid();
$$;

-- users.class_name mengikuti kelas siswa
create or replace function public.sinkron_kelas_siswa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and old.peran = 'siswa' then
    update public.users set class_name = null
     where id = old.user_id
       and not exists (select 1 from public.kelas_anggota where user_id = old.user_id and peran = 'siswa');
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.peran = 'siswa' then
    update public.users u set class_name = k.nama
      from public.kelas k
     where u.id = new.user_id and k.id = new.kelas_id;
  end if;
  return null;
end;
$$;
drop trigger if exists elearnmath_sinkron_kelas_siswa on public.kelas_anggota;
create trigger elearnmath_sinkron_kelas_siswa
  after insert or update or delete on public.kelas_anggota
  for each row execute function public.sinkron_kelas_siswa();

create or replace function public.sinkron_nama_kelas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nama is distinct from old.nama then
    update public.users u set class_name = new.nama
      from public.kelas_anggota a
     where a.kelas_id = new.id and a.peran = 'siswa' and u.id = a.user_id;
  end if;
  return null;
end;
$$;
drop trigger if exists elearnmath_sinkron_nama_kelas on public.kelas;
create trigger elearnmath_sinkron_nama_kelas
  after update of nama on public.kelas
  for each row execute function public.sinkron_nama_kelas();

-- Pindahkan teks kelas lama menjadi data kelas
insert into public.kelas (nama)
select distinct on (lower(trim(class_name))) trim(class_name)
  from public.users
 where coalesce(trim(class_name), '') <> ''
on conflict do nothing;

insert into public.kelas_anggota (kelas_id, user_id, peran)
select k.id, u.id, 'siswa'
  from public.users u
  join public.kelas k on lower(k.nama) = lower(trim(u.class_name))
 where u.role = 'siswa'
on conflict do nothing;

alter table public.kelas enable row level security;
alter table public.kelas_anggota enable row level security;
grant select on public.kelas to anon, authenticated;
grant insert, update, delete on public.kelas to authenticated;
grant select, insert, update, delete on public.kelas_anggota to authenticated;

drop policy if exists "elearnmath lihat kelas" on public.kelas;
drop policy if exists "elearnmath admin kelola kelas" on public.kelas;
create policy "elearnmath lihat kelas" on public.kelas
  for select to anon, authenticated using (true);
create policy "elearnmath admin kelola kelas" on public.kelas
  for all to authenticated
  using (public.peran_pengguna() = 'admin')
  with check (public.peran_pengguna() = 'admin');

drop policy if exists "elearnmath lihat anggota kelas" on public.kelas_anggota;
drop policy if exists "elearnmath admin kelola anggota" on public.kelas_anggota;
create policy "elearnmath lihat anggota kelas" on public.kelas_anggota
  for select to authenticated
  using (public.peran_pengguna() in ('guru', 'admin') or user_id = auth.uid() or kelas_id in (select public.kelas_saya()));
create policy "elearnmath admin kelola anggota" on public.kelas_anggota
  for all to authenticated
  using (public.peran_pengguna() = 'admin')
  with check (public.peran_pengguna() = 'admin');

-- Semua pengguna yang login boleh melihat profil guru & admin (nama pengampu, pembuat pengumuman)
drop policy if exists "elearnmath lihat staf" on public.users;
create policy "elearnmath lihat staf" on public.users
  for select to authenticated
  using (role in ('guru', 'admin'));

-- 2. Jadwal mengajar & agenda kelas ----------------------------------------------------
create table if not exists public.jadwal (
  id uuid primary key default gen_random_uuid(),
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  guru_id uuid references public.users(id) on delete set null,
  hari smallint not null check (hari between 1 and 7),
  jam_mulai time not null,
  jam_selesai time not null,
  mapel text not null default 'Matematika',
  ruang text,
  catatan text,
  created_at timestamptz not null default now(),
  check (jam_selesai > jam_mulai)
);
create index if not exists jadwal_kelas_idx on public.jadwal (kelas_id, hari, jam_mulai);
create index if not exists jadwal_guru_idx on public.jadwal (guru_id, hari, jam_mulai);

create table if not exists public.agenda (
  id uuid primary key default gen_random_uuid(),
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  judul text not null,
  deskripsi text,
  tanggal date not null,
  jam_mulai time,
  jam_selesai time,
  jenis text not null default 'kegiatan' check (jenis in ('kegiatan', 'tenggat', 'ujian', 'lainnya')),
  id_materi uuid references public.materi(id) on delete set null,
  dibuat_oleh uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agenda_kelas_idx on public.agenda (kelas_id, tanggal);

-- Pembuat selalu pengguna yang login (tidak bisa dipalsukan)
create or replace function public.isi_pembuat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.dibuat_oleh := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists elearnmath_isi_pembuat_agenda on public.agenda;
create trigger elearnmath_isi_pembuat_agenda
  before insert on public.agenda
  for each row execute function public.isi_pembuat();

alter table public.jadwal enable row level security;
alter table public.agenda enable row level security;
grant select, insert, update, delete on public.jadwal, public.agenda to authenticated;

drop policy if exists "elearnmath lihat jadwal" on public.jadwal;
drop policy if exists "elearnmath admin kelola jadwal" on public.jadwal;
create policy "elearnmath lihat jadwal" on public.jadwal
  for select to authenticated
  using (public.peran_pengguna() in ('guru', 'admin') or kelas_id in (select public.kelas_saya()));
create policy "elearnmath admin kelola jadwal" on public.jadwal
  for all to authenticated
  using (public.peran_pengguna() = 'admin')
  with check (public.peran_pengguna() = 'admin');

drop policy if exists "elearnmath lihat agenda" on public.agenda;
drop policy if exists "elearnmath tambah agenda" on public.agenda;
drop policy if exists "elearnmath ubah agenda" on public.agenda;
drop policy if exists "elearnmath hapus agenda" on public.agenda;
create policy "elearnmath lihat agenda" on public.agenda
  for select to authenticated
  using (public.peran_pengguna() in ('guru', 'admin') or kelas_id in (select public.kelas_saya()));
create policy "elearnmath tambah agenda" on public.agenda
  for insert to authenticated
  with check (public.peran_pengguna() = 'admin'
              or (public.peran_pengguna() = 'guru' and kelas_id in (select public.kelas_saya())));
create policy "elearnmath ubah agenda" on public.agenda
  for update to authenticated
  using (public.peran_pengguna() = 'admin' or dibuat_oleh = auth.uid())
  with check (public.peran_pengguna() = 'admin'
              or (dibuat_oleh = auth.uid() and kelas_id in (select public.kelas_saya())));
create policy "elearnmath hapus agenda" on public.agenda
  for delete to authenticated
  using (public.peran_pengguna() = 'admin' or dibuat_oleh = auth.uid());

-- 3. Pengumuman ------------------------------------------------------------------------
create table if not exists public.pengumuman (
  id uuid primary key default gen_random_uuid(),
  judul text not null,
  isi text not null,
  kelas_ids uuid[],                      -- NULL = seluruh sekolah
  penting boolean not null default false,
  dibuat_oleh uuid references public.users(id) on delete set null,
  peran_pembuat text,
  nama_pembuat text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pengumuman_waktu_idx on public.pengumuman (created_at desc);

create or replace function public.isi_pengumuman()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peran text := public.peran_pengguna();
begin
  if tg_op = 'INSERT' then
    new.dibuat_oleh := coalesce(auth.uid(), new.dibuat_oleh);
    new.peran_pembuat := coalesce(v_peran, new.peran_pembuat);
    new.nama_pembuat := coalesce((select full_name from public.users where id = new.dibuat_oleh), new.nama_pembuat);
    new.created_at := now();
  else
    new.dibuat_oleh := old.dibuat_oleh;
    new.peran_pembuat := old.peran_pembuat;
    new.nama_pembuat := old.nama_pembuat;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.judul := trim(coalesce(new.judul, ''));
  new.isi := trim(coalesce(new.isi, ''));
  if new.judul = '' then
    raise exception 'JUDUL_KOSONG';
  end if;
  if new.isi = '' then
    raise exception 'ISI_KOSONG';
  end if;
  if new.kelas_ids is not null and cardinality(new.kelas_ids) = 0 then
    new.kelas_ids := null;
  end if;
  if v_peran = 'guru' then
    if new.kelas_ids is null then
      raise exception 'KELAS_WAJIB';
    end if;
    if exists (select 1 from unnest(new.kelas_ids) k where k not in (select public.kelas_saya())) then
      raise exception 'KELAS_BUKAN_MILIK';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists elearnmath_isi_pengumuman on public.pengumuman;
create trigger elearnmath_isi_pengumuman
  before insert or update on public.pengumuman
  for each row execute function public.isi_pengumuman();

alter table public.pengumuman enable row level security;
grant select, insert, update, delete on public.pengumuman to authenticated;
drop policy if exists "elearnmath lihat pengumuman" on public.pengumuman;
drop policy if exists "elearnmath tambah pengumuman" on public.pengumuman;
drop policy if exists "elearnmath ubah pengumuman" on public.pengumuman;
drop policy if exists "elearnmath hapus pengumuman" on public.pengumuman;
create policy "elearnmath lihat pengumuman" on public.pengumuman
  for select to authenticated
  using (public.peran_pengguna() in ('guru', 'admin')
         or kelas_ids is null
         or kelas_ids && array(select public.kelas_saya()));
create policy "elearnmath tambah pengumuman" on public.pengumuman
  for insert to authenticated
  with check (public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath ubah pengumuman" on public.pengumuman
  for update to authenticated
  using (public.peran_pengguna() = 'admin' or dibuat_oleh = auth.uid())
  with check (public.peran_pengguna() = 'admin' or dibuat_oleh = auth.uid());
create policy "elearnmath hapus pengumuman" on public.pengumuman
  for delete to authenticated
  using (public.peran_pengguna() = 'admin' or dibuat_oleh = auth.uid());

-- 4. Notifikasi ------------------------------------------------------------------------
create table if not exists public.notifikasi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  jenis text not null,
  judul text not null,
  isi text,
  tautan text,
  dibaca_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifikasi_user_idx on public.notifikasi (user_id, created_at desc);

alter table public.notifikasi enable row level security;
revoke all on public.notifikasi from anon, authenticated;
grant select, delete on public.notifikasi to authenticated;
grant update (dibaca_at) on public.notifikasi to authenticated;
drop policy if exists "elearnmath lihat notifikasi sendiri" on public.notifikasi;
drop policy if exists "elearnmath tandai notifikasi sendiri" on public.notifikasi;
drop policy if exists "elearnmath hapus notifikasi sendiri" on public.notifikasi;
create policy "elearnmath lihat notifikasi sendiri" on public.notifikasi
  for select to authenticated using (user_id = auth.uid());
create policy "elearnmath tandai notifikasi sendiri" on public.notifikasi
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "elearnmath hapus notifikasi sendiri" on public.notifikasi
  for delete to authenticated using (user_id = auth.uid());

-- Dipakai trigger saja (tidak bisa dipanggil langsung oleh pengguna)
create or replace function public._notif(p_user uuid, p_jenis text, p_judul text, p_isi text, p_tautan text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifikasi (user_id, jenis, judul, isi, tautan)
  select p_user, p_jenis, left(p_judul, 200), left(p_isi, 500), p_tautan
   where p_user is not null;
$$;
revoke all on function public._notif(uuid, text, text, text, text) from public, anon, authenticated;

-- Guru yang perlu tahu tentang seorang siswa: guru kelasnya, atau semua guru bila siswa belum punya kelas/guru
create or replace function public._guru_untuk_siswa(p_siswa uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with g as (
    select a2.user_id
      from public.kelas_anggota a1
      join public.kelas_anggota a2 on a2.kelas_id = a1.kelas_id and a2.peran = 'guru'
     where a1.user_id = p_siswa and a1.peran = 'siswa'
  )
  select user_id from g
  union
  select id from public.users
   where role = 'guru' and status_approval = 'APPROVED' and not exists (select 1 from g);
$$;
revoke all on function public._guru_untuk_siswa(uuid) from public, anon, authenticated;

create or replace function public.baca_semua_notifikasi()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.notifikasi set dibaca_at = now() where user_id = auth.uid() and dibaca_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.baca_semua_notifikasi() from public, anon;
grant execute on function public.baca_semua_notifikasi() to authenticated;

-- 5. Aktivitas & status online ---------------------------------------------------------
create table if not exists public.aktivitas (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  jenis text not null,
  id_materi uuid references public.materi(id) on delete set null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists aktivitas_waktu_idx on public.aktivitas (created_at desc);
create index if not exists aktivitas_user_idx on public.aktivitas (user_id, created_at desc);
create index if not exists tab_switch_logs_siswa_idx on public.tab_switch_logs (id_siswa);

alter table public.aktivitas enable row level security;
revoke all on public.aktivitas from anon, authenticated;
grant select, delete on public.aktivitas to authenticated;
drop policy if exists "elearnmath lihat aktivitas" on public.aktivitas;
drop policy if exists "elearnmath admin hapus aktivitas" on public.aktivitas;
create policy "elearnmath lihat aktivitas" on public.aktivitas
  for select to authenticated
  using (user_id = auth.uid() or public.peran_pengguna() in ('guru', 'admin'));
-- Admin boleh merapikan log aktivitas lama
create policy "elearnmath admin hapus aktivitas" on public.aktivitas
  for delete to authenticated
  using (public.peran_pengguna() = 'admin');

create or replace function public.tandai_aktif()
returns void
language sql
security definer
set search_path = public
as $$
  update public.users set terakhir_aktif = now() where id = auth.uid();
$$;

create or replace function public.catat_aktivitas(p_jenis text, p_id_materi uuid default null, p_detail jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_materi uuid := p_id_materi;
  v_detail jsonb := p_detail;
begin
  if v_uid is null then
    return;
  end if;
  if p_jenis is null or p_jenis not in ('masuk', 'buka_materi', 'mulai_tugas', 'buka_halaman') then
    raise exception 'JENIS_TIDAK_VALID';
  end if;
  if v_materi is not null and not exists (select 1 from public.materi where id = v_materi) then
    v_materi := null;
  end if;
  if v_detail is not null and (jsonb_typeof(v_detail) <> 'object' or length(v_detail::text) > 1000) then
    v_detail := null;
  end if;
  update public.users set terakhir_aktif = now() where id = v_uid;
  -- Abaikan kejadian yang sama berulang dalam 30 detik (mis. muat ulang halaman)
  if exists (
    select 1 from public.aktivitas
     where user_id = v_uid and jenis = p_jenis
       and id_materi is not distinct from v_materi and detail is not distinct from v_detail
       and created_at > now() - interval '30 seconds'
  ) then
    return;
  end if;
  insert into public.aktivitas (user_id, jenis, id_materi, detail) values (v_uid, p_jenis, v_materi, v_detail);
end;
$$;
revoke all on function public.tandai_aktif() from public, anon;
revoke all on function public.catat_aktivitas(text, uuid, jsonb) from public, anon;
grant execute on function public.tandai_aktif() to authenticated;
grant execute on function public.catat_aktivitas(text, uuid, jsonb) to authenticated;

-- 6. Ketersediaan materi bagi siswa (kebijakan RESTRICTIVE: berlaku di atas kebijakan baca yang sudah ada)
-- RLS dipastikan aktif; kebijakan baca dasar ditambahkan agar materi tetap terbaca setelah RLS menyala.
alter table public.materi enable row level security;
drop policy if exists "elearnmath baca materi" on public.materi;
create policy "elearnmath baca materi" on public.materi
  for select to authenticated using (true);
drop policy if exists "elearnmath materi tersedia" on public.materi;
create policy "elearnmath materi tersedia" on public.materi
  as restrictive
  for select to authenticated
  using (
    public.peran_pengguna() in ('guru', 'admin')
    or (terbit
        and (tanggal_buka is null or tanggal_buka <= now())
        and (kelas_ids is null or kelas_ids && array(select public.kelas_saya())))
  );

-- 7. LKPD bertahap ---------------------------------------------------------------------
create or replace function public.tahapan_lkpd_bawaan()
returns jsonb
language sql
immutable
as $$
  select '[
    {"kunci": "orientasi", "judul": "Orientasi Masalah", "instruksi": "Baca dan pahami masalah berikut. Tuliskan apa yang diketahui dan apa yang ditanyakan."},
    {"kunci": "eksplorasi", "judul": "Eksplorasi", "instruksi": "Coba selesaikan masalah dengan caramu sendiri. Amati pola atau hubungan yang kamu temukan."},
    {"kunci": "konstruksi", "judul": "Membangun Konsep", "instruksi": "Gunakan hasil eksplorasimu untuk menyusun konsep atau rumus. Jelaskan langkah-langkahnya."},
    {"kunci": "kesimpulan", "judul": "Menyimpulkan", "instruksi": "Tuliskan kesimpulan dari kegiatan ini dengan bahasamu sendiri."},
    {"kunci": "refleksi", "judul": "Refleksi", "instruksi": "Bagian mana yang sudah kamu pahami, dan bagian mana yang masih membingungkan?"}
  ]'::jsonb;
$$;

create table if not exists public.lkpd (
  id_materi uuid primary key references public.materi(id) on delete cascade,
  judul text,
  tujuan text,
  petunjuk text,
  tahapan jsonb not null default public.tahapan_lkpd_bawaan(),
  updated_at timestamptz not null default now()
);
alter table public.lkpd enable row level security;
grant select on public.lkpd to authenticated;
grant insert, update, delete on public.lkpd to authenticated;
drop policy if exists "elearnmath lihat lkpd" on public.lkpd;
drop policy if exists "elearnmath staf kelola lkpd" on public.lkpd;
create policy "elearnmath lihat lkpd" on public.lkpd
  for select to authenticated using (true);
create policy "elearnmath staf kelola lkpd" on public.lkpd
  for all to authenticated
  using (public.peran_pengguna() in ('guru', 'admin'))
  with check (public.peran_pengguna() in ('guru', 'admin'));

-- 8. Koreksi AI ------------------------------------------------------------------------
create table if not exists public.koreksi_ai (
  id uuid primary key default gen_random_uuid(),
  jenis text not null check (jenis in ('lkpd', 'latihan', 'evaluasi')),
  id_pengumpulan uuid not null,
  hasil jsonb not null,
  sumber text not null check (sumber in ('gemini', 'aturan')),
  model text,
  status text not null default 'saran' check (status in ('saran', 'divalidasi')),
  dibuat_oleh uuid references public.users(id) on delete set null,
  divalidasi_oleh uuid references public.users(id) on delete set null,
  divalidasi_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jenis, id_pengumpulan)
);
alter table public.koreksi_ai enable row level security;
revoke all on public.koreksi_ai from anon, authenticated;
grant select, delete on public.koreksi_ai to authenticated;
drop policy if exists "elearnmath staf lihat koreksi ai" on public.koreksi_ai;
drop policy if exists "elearnmath staf hapus koreksi ai" on public.koreksi_ai;
create policy "elearnmath staf lihat koreksi ai" on public.koreksi_ai
  for select to authenticated using (public.peran_pengguna() in ('guru', 'admin'));
create policy "elearnmath staf hapus koreksi ai" on public.koreksi_ai
  for delete to authenticated using (public.peran_pengguna() in ('guru', 'admin'));

-- Simpan saran koreksi (dari AI atau mesin aturan). Status kembali "saran" sampai guru menyimpan nilai.
create or replace function public.simpan_koreksi_ai(p_jenis text, p_id uuid, p_hasil jsonb, p_sumber text, p_model text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(public.peran_pengguna(), '') not in ('guru', 'admin') then
    raise exception 'KHUSUS_GURU';
  end if;
  if p_jenis is null or p_jenis not in ('lkpd', 'latihan', 'evaluasi') then
    raise exception 'JENIS_TIDAK_VALID';
  end if;
  if p_sumber is null or p_sumber not in ('gemini', 'aturan') then
    raise exception 'SUMBER_TIDAK_VALID';
  end if;
  if p_hasil is null or jsonb_typeof(p_hasil) <> 'object' or length(p_hasil::text) > 60000 then
    raise exception 'HASIL_TIDAK_VALID';
  end if;
  if not (
    (p_jenis = 'lkpd' and exists (select 1 from public.jawaban_lkpd where id = p_id))
    or (p_jenis = 'latihan' and exists (select 1 from public.pengerjaan_latihan where id = p_id))
    or (p_jenis = 'evaluasi' and exists (select 1 from public.pengerjaan_evaluasi where id = p_id))
  ) then
    raise exception 'PENGUMPULAN_TIDAK_ADA';
  end if;
  insert into public.koreksi_ai (jenis, id_pengumpulan, hasil, sumber, model, status, dibuat_oleh)
  values (p_jenis, p_id, p_hasil, p_sumber, left(p_model, 80), 'saran', auth.uid())
  on conflict (jenis, id_pengumpulan) do update
    set hasil = excluded.hasil, sumber = excluded.sumber, model = excluded.model, status = 'saran',
        dibuat_oleh = excluded.dibuat_oleh, divalidasi_oleh = null, divalidasi_at = null, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.simpan_koreksi_ai(text, uuid, jsonb, text, text) from public, anon;
grant execute on function public.simpan_koreksi_ai(text, uuid, jsonb, text, text) to authenticated;

-- 9. Notifikasi & validasi otomatis dari pengumpulan / penilaian ------------------------
create or replace function public.notif_pengumpulan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jenis text := case tg_table_name when 'jawaban_lkpd' then 'lkpd' when 'pengerjaan_latihan' then 'latihan' else 'evaluasi' end;
  v_label text := case tg_table_name when 'jawaban_lkpd' then 'LKPD' when 'pengerjaan_latihan' then 'Latihan' else 'Evaluasi' end;
  v_nama text;
  v_bab text;
  g uuid;
begin
  if tg_op = 'UPDATE' then
    -- Hanya LKPD yang dikumpulkan ulang (setelah izin pengerjaan ulang)
    if not (new.status = 'submitted' and (old.status is distinct from 'submitted' or new.created_at is distinct from old.created_at)) then
      return null;
    end if;
  end if;
  select coalesce(full_name, email) into v_nama from public.users where id = new.id_siswa;
  select 'Bab ' || chapter_number || ': ' || title into v_bab from public.materi where id = new.id_materi;
  for g in select public._guru_untuk_siswa(new.id_siswa) loop
    perform public._notif(g, 'tugas_masuk',
      v_label || (case when tg_op = 'UPDATE' then ' dikumpulkan ulang: ' else ' baru: ' end) || coalesce(v_nama, 'Siswa'),
      coalesce(v_bab, 'Materi') || ' — perlu dikoreksi.',
      '/guru/koreksi?jenis=' || v_jenis || '&id=' || new.id);
  end loop;
  return null;
end;
$$;

create or replace function public.notif_penilaian()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jenis text := case tg_table_name when 'jawaban_lkpd' then 'lkpd' when 'pengerjaan_latihan' then 'latihan' else 'evaluasi' end;
  v_label text := case tg_table_name when 'jawaban_lkpd' then 'LKPD' when 'pengerjaan_latihan' then 'Latihan' else 'Evaluasi' end;
  v_bab text;
  v_dinilai boolean := false;
  v_ulang boolean := false;
  v_link text := '/siswa/pengerjaan/' || v_jenis || '/' || new.id_materi;
begin
  if v_jenis = 'lkpd' then
    v_ulang := coalesce(new.allow_retake, false) and not coalesce(old.allow_retake, false);
    v_dinilai := new.status = 'graded'
      and (old.status is distinct from 'graded' or new.score is distinct from old.score or new.feedback is distinct from old.feedback);
  elsif v_jenis = 'latihan' then
    v_dinilai := new.feedback is not null
      and (old.feedback is null or new.score is distinct from old.score or new.feedback is distinct from old.feedback);
  else
    v_dinilai := new.dinilai_at is not null
      and (old.dinilai_at is null or new.score is distinct from old.score or new.feedback is distinct from old.feedback);
  end if;
  if not (v_dinilai or v_ulang) then
    return null;
  end if;

  select 'Bab ' || chapter_number into v_bab from public.materi where id = new.id_materi;
  if v_ulang then
    perform public._notif(new.id_siswa, 'izin_ulang',
      'Kamu boleh mengerjakan ulang ' || v_label || ' ' || coalesce(v_bab, ''),
      nullif(left(coalesce(new.feedback, ''), 300), ''), v_link);
  else
    perform public._notif(new.id_siswa, 'nilai',
      'Nilai ' || v_label || ' ' || coalesce(v_bab, '') || ': ' || coalesce(new.score::text, '-'),
      nullif(left(coalesce(new.feedback, ''), 300), ''), v_link);
  end if;

  -- Nilai yang disimpan guru = hasil koreksi AI sudah divalidasi
  update public.koreksi_ai
     set status = 'divalidasi', divalidasi_oleh = auth.uid(), divalidasi_at = now(), updated_at = now()
   where jenis = v_jenis and id_pengumpulan = new.id;
  return null;
end;
$$;

create or replace function public.bersihkan_koreksi_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.koreksi_ai
   where id_pengumpulan = old.id
     and jenis = case tg_table_name when 'jawaban_lkpd' then 'lkpd' when 'pengerjaan_latihan' then 'latihan' else 'evaluasi' end;
  return null;
end;
$$;

drop trigger if exists elearnmath_notif_pengumpulan on public.jawaban_lkpd;
drop trigger if exists elearnmath_notif_kumpul_ulang on public.jawaban_lkpd;
drop trigger if exists elearnmath_notif_penilaian on public.jawaban_lkpd;
drop trigger if exists elearnmath_bersihkan_koreksi_ai on public.jawaban_lkpd;
create trigger elearnmath_notif_pengumpulan after insert on public.jawaban_lkpd
  for each row execute function public.notif_pengumpulan();
create trigger elearnmath_notif_kumpul_ulang after update on public.jawaban_lkpd
  for each row execute function public.notif_pengumpulan();
create trigger elearnmath_notif_penilaian after update on public.jawaban_lkpd
  for each row execute function public.notif_penilaian();
create trigger elearnmath_bersihkan_koreksi_ai after delete on public.jawaban_lkpd
  for each row execute function public.bersihkan_koreksi_ai();

drop trigger if exists elearnmath_notif_pengumpulan on public.pengerjaan_latihan;
drop trigger if exists elearnmath_notif_penilaian on public.pengerjaan_latihan;
drop trigger if exists elearnmath_bersihkan_koreksi_ai on public.pengerjaan_latihan;
create trigger elearnmath_notif_pengumpulan after insert on public.pengerjaan_latihan
  for each row execute function public.notif_pengumpulan();
create trigger elearnmath_notif_penilaian after update on public.pengerjaan_latihan
  for each row execute function public.notif_penilaian();
create trigger elearnmath_bersihkan_koreksi_ai after delete on public.pengerjaan_latihan
  for each row execute function public.bersihkan_koreksi_ai();

drop trigger if exists elearnmath_notif_pengumpulan on public.pengerjaan_evaluasi;
drop trigger if exists elearnmath_notif_penilaian on public.pengerjaan_evaluasi;
drop trigger if exists elearnmath_bersihkan_koreksi_ai on public.pengerjaan_evaluasi;
create trigger elearnmath_notif_pengumpulan after insert on public.pengerjaan_evaluasi
  for each row execute function public.notif_pengumpulan();
create trigger elearnmath_notif_penilaian after update on public.pengerjaan_evaluasi
  for each row execute function public.notif_penilaian();
create trigger elearnmath_bersihkan_koreksi_ai after delete on public.pengerjaan_evaluasi
  for each row execute function public.bersihkan_koreksi_ai();

-- Pengumuman & agenda → siswa (dan guru untuk pengumuman admin)
create or replace function public.notif_pengumuman()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select u.id, u.role from public.users u
     where u.status_approval = 'APPROVED'
       and u.id is distinct from new.dibuat_oleh
       and (
         (u.role = 'siswa' and (new.kelas_ids is null or exists (
            select 1 from public.kelas_anggota a where a.user_id = u.id and a.kelas_id = any(new.kelas_ids))))
         or (u.role = 'guru' and new.peran_pembuat = 'admin' and (new.kelas_ids is null or exists (
            select 1 from public.kelas_anggota a where a.user_id = u.id and a.kelas_id = any(new.kelas_ids))))
       )
  loop
    perform public._notif(r.id, 'pengumuman',
      (case when new.penting then 'Penting: ' else 'Pengumuman: ' end) || new.judul,
      left(new.isi, 200),
      case when r.role = 'siswa' then '/siswa/pengumuman' else '/guru/pengumuman' end);
  end loop;
  return null;
end;
$$;
drop trigger if exists elearnmath_notif_pengumuman on public.pengumuman;
create trigger elearnmath_notif_pengumuman after insert on public.pengumuman
  for each row execute function public.notif_pengumuman();

create or replace function public.notif_agenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s uuid;
begin
  for s in
    select a.user_id from public.kelas_anggota a
      join public.users u on u.id = a.user_id and u.status_approval = 'APPROVED'
     where a.kelas_id = new.kelas_id and a.peran = 'siswa'
  loop
    perform public._notif(s, 'agenda',
      (case new.jenis when 'tenggat' then 'Tenggat: ' when 'ujian' then 'Ujian: ' else 'Agenda: ' end) || new.judul,
      to_char(new.tanggal, 'DD-MM-YYYY') || coalesce(' ' || to_char(new.jam_mulai, 'HH24:MI'), '')
        || coalesce(' — ' || left(new.deskripsi, 150), ''),
      '/siswa/jadwal');
  end loop;
  return null;
end;
$$;
drop trigger if exists elearnmath_notif_agenda on public.agenda;
create trigger elearnmath_notif_agenda after insert on public.agenda
  for each row execute function public.notif_agenda();

-- Akun baru → admin ; akun disetujui → pemilik akun
create or replace function public.notif_akun()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
begin
  if tg_op = 'INSERT' and new.status_approval = 'PENDING' then
    for a in select id from public.users where role = 'admin' and status_approval = 'APPROVED' loop
      perform public._notif(a, 'akun_baru',
        'Akun baru menunggu persetujuan: ' || coalesce(new.full_name, new.email),
        'Mendaftar sebagai ' || coalesce(new.role, 'siswa') || '.',
        '/admin/pengguna?status=PENDING');
    end loop;
  elsif tg_op = 'UPDATE' and new.status_approval = 'APPROVED' and old.status_approval is distinct from 'APPROVED' then
    perform public._notif(new.id, 'akun', 'Akun kamu sudah disetujui. Selamat belajar!', null,
      case new.role when 'admin' then '/admin' when 'guru' then '/guru/koreksi' else '/siswa' end);
  end if;
  return null;
end;
$$;
drop trigger if exists elearnmath_notif_akun on public.users;
create trigger elearnmath_notif_akun after insert or update of status_approval on public.users
  for each row execute function public.notif_akun();

-- 10. Pengumpulan v3: cek ketersediaan materi, catat aktivitas, reset saran AI saat kumpul ulang
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
      delete from public.koreksi_ai where jenis = 'lkpd' and id_pengumpulan = v_lkpd_id;
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

  update public.users set terakhir_aktif = now() where id = v_uid;
  insert into public.aktivitas (user_id, jenis, id_materi, detail)
  values (v_uid, 'kumpul_tugas', p_id_materi, jsonb_build_object('jenis', p_jenis));

  return jsonb_build_object('id', v_id, 'skor_pg', v_skor, 'maks_pg', v_maks);
end;
$$;

-- 11. Bank soal v3: tahap LKPD, jawaban ideal & rubrik untuk koreksi AI ----------------
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
  else
    v_kunci := null;
    v_a := null; v_b := null; v_c := null; v_d := null;
  end if;
  -- Tahap hanya untuk LKPD
  if v_kategori <> 'lkpd' then
    v_tahap := null;
  end if;

  if v_id is null then
    insert into public.questions (category, id_materi, urutan, tipe, pertanyaan, opsi_a, opsi_b, opsi_c, opsi_d,
                                  kunci_jawaban, bobot, tahap, jawaban_ideal, rubrik)
    values (v_kategori, v_materi, v_urutan, v_tipe, v_pertanyaan, v_a, v_b, v_c, v_d,
            v_kunci, v_bobot, left(v_tahap, 40), left(v_ideal, 5000), v_rubrik)
    returning id into v_id;
  else
    update public.questions
       set category = v_kategori, id_materi = v_materi, urutan = v_urutan, tipe = v_tipe,
           pertanyaan = v_pertanyaan, opsi_a = v_a, opsi_b = v_b, opsi_c = v_c, opsi_d = v_d,
           kunci_jawaban = v_kunci, bobot = v_bobot, tahap = left(v_tahap, 40),
           jawaban_ideal = left(v_ideal, 5000), rubrik = v_rubrik
     where id = v_id;
    if not found then
      raise exception 'SOAL_TIDAK_ADA';
    end if;
  end if;
  return v_id;
end;
$$;

-- 12. Guru boleh menghapus pengumpulan (agar siswa bisa mengerjakan ulang) --------------
do $$
declare
  t text;
begin
  foreach t in array array['jawaban_lkpd', 'pengerjaan_latihan', 'pengerjaan_evaluasi', 'tab_switch_logs'] loop
    execute format('drop policy if exists %I on public.%I', 'elearnmath guru hapus', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.peran_pengguna() = %L)',
      'elearnmath guru hapus', t, 'guru'
    );
  end loop;
end;
$$;

-- 13. Pendaftaran akun mandiri ---------------------------------------------------------
create or replace function public.profil_pengguna_baru()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_peran text := case when v_meta ->> 'peran' = 'guru' then 'guru' else 'siswa' end;
  v_kelas uuid;
begin
  begin
    v_kelas := nullif(v_meta ->> 'kelas_id', '')::uuid;
  exception when others then
    v_kelas := null;
  end;
  if v_kelas is not null and not exists (select 1 from public.kelas where id = v_kelas) then
    v_kelas := null;
  end if;
  insert into public.users (id, email, full_name, role, status_approval, nomor_induk, kelas_diminta)
  values (
    new.id,
    new.email,
    coalesce(nullif(left(trim(v_meta ->> 'full_name'), 100), ''), split_part(new.email, '@', 1)),
    v_peran,
    'PENDING',
    nullif(left(trim(coalesce(v_meta ->> 'nomor_induk', '')), 30), ''),
    v_kelas
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists elearnmath_profil_pengguna_baru on auth.users;
create trigger elearnmath_profil_pengguna_baru
  after insert on auth.users
  for each row execute function public.profil_pengguna_baru();

-- 14. RPC profil & pengelolaan akun ----------------------------------------------------
create or replace function public.ubah_profil(p_nama text, p_nomor_induk text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'BELUM_LOGIN';
  end if;
  if nullif(trim(coalesce(p_nama, '')), '') is null then
    raise exception 'NAMA_KOSONG';
  end if;
  update public.users
     set full_name = left(trim(p_nama), 100),
         nomor_induk = nullif(left(trim(coalesce(p_nomor_induk, '')), 30), '')
   where id = auth.uid();
end;
$$;

create or replace function public.atur_kelas_siswa(p_siswa uuid, p_kelas uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.peran_pengguna(), '') <> 'admin' then
    raise exception 'KHUSUS_ADMIN';
  end if;
  if not exists (select 1 from public.users where id = p_siswa and role = 'siswa') then
    raise exception 'BUKAN_AKUN_SISWA';
  end if;
  if p_kelas is not null and not exists (select 1 from public.kelas where id = p_kelas) then
    raise exception 'KELAS_TIDAK_ADA';
  end if;
  delete from public.kelas_anggota where user_id = p_siswa and peran = 'siswa' and kelas_id is distinct from p_kelas;
  if p_kelas is not null then
    insert into public.kelas_anggota (kelas_id, user_id, peran) values (p_kelas, p_siswa, 'siswa')
    on conflict (kelas_id, user_id) do nothing;
  end if;
end;
$$;

create or replace function public.setujui_pengguna(p_user uuid, p_kelas uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_minta uuid;
  v_kelas uuid;
begin
  if coalesce(public.peran_pengguna(), '') <> 'admin' then
    raise exception 'KHUSUS_ADMIN';
  end if;
  update public.users set status_approval = 'APPROVED' where id = p_user
  returning role, kelas_diminta into v_role, v_minta;
  if not found then
    raise exception 'PENGGUNA_TIDAK_ADA';
  end if;
  v_kelas := coalesce(p_kelas, v_minta);
  if v_kelas is not null and exists (select 1 from public.kelas where id = v_kelas) then
    if v_role = 'siswa' then
      perform public.atur_kelas_siswa(p_user, v_kelas);
    elsif v_role = 'guru' then
      insert into public.kelas_anggota (kelas_id, user_id, peran) values (v_kelas, p_user, 'guru')
      on conflict (kelas_id, user_id) do nothing;
    end if;
  end if;
end;
$$;

create or replace function public.setujui_semua_menunggu()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  if coalesce(public.peran_pengguna(), '') <> 'admin' then
    raise exception 'KHUSUS_ADMIN';
  end if;
  for v_id in select id from public.users where status_approval = 'PENDING' loop
    perform public.setujui_pengguna(v_id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.ubah_profil(text, text) from public, anon;
revoke all on function public.atur_kelas_siswa(uuid, uuid) from public, anon;
revoke all on function public.setujui_pengguna(uuid, uuid) from public, anon;
revoke all on function public.setujui_semua_menunggu() from public, anon;
revoke all on function public.kelas_saya() from public, anon;
grant execute on function public.ubah_profil(text, text) to authenticated;
grant execute on function public.atur_kelas_siswa(uuid, uuid) to authenticated;
grant execute on function public.setujui_pengguna(uuid, uuid) to authenticated;
grant execute on function public.setujui_semua_menunggu() to authenticated;
grant execute on function public.kelas_saya() to authenticated;

-- 15. Tinjau hasil per soal untuk siswa -------------------------------------------------
-- Benar/salah tiap soal pilihan ganda terlihat segera setelah siswa mengumpulkan.
-- Kunci jawaban & contoh jawaban uraian baru dibuka setelah guru menilai pengumpulan itu
-- (dan tidak sedang diizinkan mengulang), hanya untuk soal khusus bab tersebut yang dijawab
-- siswa. Soal umum (id_materi NULL) juga muncul di bab lain, jadi kuncinya tidak dibuka.
create or replace function public.tinjau_pengerjaan(p_jenis text, p_id_materi uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jawaban jsonb;
  v_materi uuid;
  v_dinilai boolean := false;
  v_ulang boolean := false;
  v_hasil jsonb := '[]'::jsonb;
  v_jwb text;
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
    select file_answers_json -> 'answers', id_materi, status = 'graded', coalesce(allow_retake, false)
      into v_jawaban, v_materi, v_dinilai, v_ulang
      from public.jawaban_lkpd
     where id_siswa = v_uid and id_materi = p_id_materi
     limit 1;
  elsif p_jenis = 'latihan' then
    select answers_json -> 'answers', id_materi, feedback is not null
      into v_jawaban, v_materi, v_dinilai
      from public.pengerjaan_latihan
     where id_siswa = v_uid and id_materi = p_id_materi
     limit 1;
  else
    select answers_json -> 'answers', id_materi, dinilai_at is not null
      into v_jawaban, v_materi, v_dinilai
      from public.pengerjaan_evaluasi
     where id_siswa = v_uid and (id_materi = p_id_materi or id_materi is null)
     order by id_materi nulls last
     limit 1;
  end if;
  if not found then
    return null;
  end if;
  -- Sedang diizinkan mengulang: jangan bocorkan benar/salah sebelum dikumpulkan lagi
  if v_ulang then
    return jsonb_build_object('dinilai', false, 'soal', '[]'::jsonb);
  end if;
  if jsonb_typeof(v_jawaban) is distinct from 'object' then
    v_jawaban := '{}'::jsonb;
  end if;

  for q in
    select id, tipe, kunci_jawaban, jawaban_ideal, id_materi
      from public.questions
     where category = p_jenis and (id_materi is null or id_materi = p_id_materi)
  loop
    v_jwb := upper(trim(coalesce(v_jawaban ->> q.id::text, '')));
    v_buka := coalesce(v_dinilai, false) and q.id_materi is not null and q.id_materi = v_materi and v_jawaban ? q.id::text;
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
