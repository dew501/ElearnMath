
# ElearnMath

Platform e-learning matematika (Next.js 14 + Supabase) untuk siswa, guru, dan admin: materi per subbab, LKPD
konstruktivis bertahap, latihan & evaluasi per bab, koreksi berbantuan AI yang divalidasi guru, kelas & jadwal,
pengumuman, notifikasi, pemantauan aktivitas siswa, dan rekap nilai.

## Menjalankan secara lokal

1. `npm install`
2. Salin `.env.example` menjadi `.env`, lalu isi:
   - `NEXT_PUBLIC_SUPABASE_URL` = URL proyek **tanpa** `/rest/v1` (contoh `https://xxxx.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable key (`sb_publishable_...`). Jangan pakai secret key di variabel `NEXT_PUBLIC_*`.
   - `GEMINI_API_KEY` = API key Google AI Studio (gratis) untuk koreksi AI. **Tanpa** awalan `NEXT_PUBLIC_`.
   - `SUPABASE_SECRET_KEY` (opsional, disarankan) = secret key Supabase, hanya dibaca server. Dibutuhkan untuk
     membuat akun langsung aktif, menghapus akun, dan mengatur ulang kata sandi dari menu admin.
   - Opsional: `NEXT_PUBLIC_ADMIN_CONTACT` (kontak admin di halaman masuk), `GEMINI_MODELS` (urutan model,
     dipisah koma), `KOREKSI_AI_MODE=aturan` (paksa memakai mesin koreksi berbasis rubrik tanpa AI).
3. Jalankan migrasi database (lihat di bawah).
4. `npm run dev`, buka http://localhost:3000. Setelah mengubah file `.env*`, restart `npm run dev`.

## Migrasi database (wajib sebelum deploy, jalankan berurutan)

Jalankan di Supabase > SQL Editor, masing-masing sekali (aman dijalankan ulang; pembatalan ada di file `.rollback.sql`):

1. `supabase/migrations/20261025_kunci_jawaban_dan_pengumpulan.sql`: kunci jawaban tidak terbaca siswa, skor pilihan
   ganda dihitung di database (`kumpulkan_pengerjaan()`), izin pengerjaan ulang LKPD.
2. `supabase/migrations/20261026_kelola_materi_soal_pengguna.sql`: soal & evaluasi per bab, bank soal, guru mengelola
   materi, admin mengelola pengguna, bucket Storage `materi` (PDF/gambar, maks 10 MB).
3. `supabase/migrations/20261027_kelas_jadwal_pengumuman_ai.sql`: kelas & anggota, jadwal mengajar, agenda kelas,
   pengumuman, notifikasi, log aktivitas & status online, materi per subbab + terbit/tanggal buka/kelas tujuan,
   LKPD bertahap, rubrik & saran koreksi AI, catatan guru di evaluasi, hasil per soal untuk siswa, dan pendaftaran
   akun mandiri.
4. `supabase/migrations/20261029_lampiran_essay_dan_deteksi_ai.sql`: konfigurasi format berkas soal uraian oleh guru
   (`questions.format_file`, bawaan PDF/Word/Gambar), bucket privat `jawaban-essay` untuk foto kamera & berkas jawaban
   terkompresi siswa (terkunci setelah kumpul final kecuali izin pengerjaan ulang), serta validasi lampiran & penyimpanan
   hasil deteksi watermark/metadata AI pada `kumpulkan_pengerjaan()`.

## Pengaturan Supabase Auth

- **Pendaftaran mandiri**: Authentication > Sign In / Providers > Email > *Enable sign ups* = aktif. Akun baru
  berstatus *Menunggu* sampai disetujui admin (trigger migrasi 3).
- **Konfirmasi email**: disarankan *Confirm email* dimatikan bila belum memasang SMTP sendiri (SMTP bawaan Supabase
  hanya beberapa email per jam). Penyaring utamanya adalah persetujuan admin.
- **Lupa kata sandi**: URL Configuration > Site URL = domain aplikasi, dan tambahkan
  `https://<domain>/atur-ulang-password` (serta `http://localhost:3000/atur-ulang-password`) ke Redirect URLs.
  Pasang SMTP sendiri agar email reset sampai ke pengguna.

## Peran & halaman

- **Siswa**: Beranda (`/siswa`), Materi (per subbab dengan Sebelumnya/Berikutnya), LKPD, Latihan, Evaluasi, Daftar Nilai,
  Pengumuman, Jadwal, Profil. Urutan per bab: LKPD → Latihan → Evaluasi; tiap tugas sekali kumpul (LKPD bisa diulang
  bila guru mengizinkan). Nilai akhir muncul setelah divalidasi guru. Setelah mengumpulkan, **Hasil per Soal**
  menandai jawaban pilihan ganda benar/salah; kunci jawaban & contoh jawaban uraian dibuka setelah guru menilai
  (`tinjau_pengerjaan()`; kunci soal umum yang juga dipakai di bab lain tetap tertutup).
- **Guru**: Koreksi (Koreksi AI, validasi nilai, izin ulang, hapus pengumpulan), Materi (subbab, terbit, kelas tujuan,
  tanggal buka, unggah PDF/gambar), LKPD (tujuan, petunjuk, tahapan konstruktivis, soal per tahap), Bank Soal (rubrik &
  jawaban ideal untuk koreksi AI), Pengumuman, Jadwal & Agenda, Aktivitas Siswa (online, progres, keluar tab),
  Rekap Nilai (+ ekspor Excel).
- **Admin**: Ringkasan, Pengguna (tambah/impor CSV/setujui/nonaktifkan/hapus, peran, kelas, atur ulang sandi),
  Kelas (anggota guru & siswa), Jadwal mengajar, Pengumuman sekolah (+ agenda dari guru), Monitor Keluar Tab, Hak Akses.
  Admin tidak membuka menu guru (koreksi, materi, bank soal).
- Akun yang belum disetujui, ditolak/nonaktif, atau tidak punya baris di `public.users` tidak bisa masuk.

## Koreksi AI

Tombol **Koreksi dengan AI** di panel koreksi memanggil `/api/koreksi-ai` (server). Jawaban uraian dinilai Google
Gemini (free tier; urutan model `gemini-3.5-flash` → `gemini-3.5-flash-lite` → `gemini-flash-lite-latest`) memakai
rubrik & jawaban ideal dari bank soal; pilihan ganda dinilai dari kunci. Bila kuota/AI tidak tersedia, saran dibuat
mesin cadangan berbasis rubrik (`lib/koreksi/aturan.ts`). Saran **tidak** terlihat siswa sampai guru menyimpan nilai
(validasi). Yang dikirim ke AI hanya soal, rubrik, dan jawaban (tanpa nama/email siswa).

## Deploy (mis. Vercel)

Set environment variable yang sama dengan `.env` di dashboard hosting (`GEMINI_API_KEY` & `SUPABASE_SECRET_KEY`
sebagai variabel server biasa, bukan `NEXT_PUBLIC_*`), jalankan ketiga migrasi, lalu deploy ulang
(variabel `NEXT_PUBLIC_*` ditanam saat build).
