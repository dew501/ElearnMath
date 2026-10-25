
# ElearnMath

Platform e-learning matematika (Next.js 14 + Supabase) untuk siswa, guru, dan admin.

## Menjalankan secara lokal

1. `npm install`
2. Salin `.env.example` menjadi `.env`, lalu isi dari Supabase > Project Settings > API Keys:
   - `NEXT_PUBLIC_SUPABASE_URL` = URL proyek **tanpa** `/rest/v1` (contoh `https://xxxx.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable key (`sb_publishable_...`). Jangan pakai secret key.
3. Jalankan migrasi database sekali (lihat di bawah).
4. `npm run dev`, buka http://localhost:3000. Setelah mengubah file `.env*`, restart `npm run dev`.

## Migrasi database (wajib sebelum deploy, jalankan berurutan)

Jalankan di Supabase > SQL Editor, masing-masing sekali (aman dijalankan ulang; pembatalan ada di file `.rollback.sql`):

1. `supabase/migrations/20261025_kunci_jawaban_dan_pengumpulan.sql`: kunci jawaban tidak terbaca siswa, skor pilihan
   ganda dihitung di database (`kumpulkan_pengerjaan()`), izin pengerjaan ulang LKPD, admin boleh menghapus pengumpulan.
2. `supabase/migrations/20261026_kelola_materi_soal_pengguna.sql`: soal & evaluasi per bab, bank soal (`simpan_soal()`,
   `hapus_soal()`), guru/admin mengelola materi, admin mengelola pengguna, dan bucket Storage `materi`
   (PDF/gambar, maks 10 MB).

## Peran & halaman

- **Siswa** (`users.role = 'siswa'`, `status_approval = 'APPROVED'`): Daftar Modul → Materi → LKPD → Latihan → Evaluasi.
  Tiap tugas dikumpulkan satu kali per bab; LKPD bisa diulang jika guru mencentang "Izin Pengerjaan Ulang".
- **Guru**: `/guru/koreksi` (menilai LKPD, latihan, evaluasi), `/guru/materi` (tambah/ubah/hapus bab dengan editor teks,
  video YouTube, unggah PDF & gambar), `/guru/soal` (bank soal per kategori; soal umum untuk semua bab atau khusus satu bab).
- **Admin**: semua halaman guru, ditambah `/admin` (ringkasan) dan `/admin/pengguna` (setujui/tolak akun, atur peran & kelas,
  hapus pengumpulan dari panel koreksi agar siswa bisa mengerjakan ulang).
- Akun yang belum disetujui (`PENDING`), ditolak (`REJECTED`), atau tidak punya baris di `public.users` tidak bisa masuk.
  Aplikasi tidak menyediakan halaman pendaftaran; akun dibuat lewat Supabase Auth lalu disetujui admin.

## Lupa kata sandi

Halaman `/lupa-password` mengirim tautan reset lewat Supabase Auth; tautan membuka `/atur-ulang-password`.
Agar berfungsi di produksi, atur di Supabase > Authentication:

- **URL Configuration**: Site URL = domain aplikasi, dan tambahkan `https://<domain>/atur-ulang-password`
  (serta `http://localhost:3000/atur-ulang-password` untuk lokal) ke Redirect URLs.
- **SMTP**: SMTP bawaan Supabase hanya mengirim ke anggota tim proyek & dibatasi jumlahnya; pasang SMTP sendiri
  agar email reset sampai ke siswa/guru.

Opsional: isi `NEXT_PUBLIC_ADMIN_CONTACT` agar kontak admin tampil di halaman login.

## Deploy (mis. Vercel)

Set environment variable yang sama dengan `.env` di dashboard hosting, jalankan migrasi di atas, lalu deploy ulang
(variabel `NEXT_PUBLIC_*` ditanam saat build).
