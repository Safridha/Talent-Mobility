# Talent Mobility

Portal rekrutmen dengan frontend React/Vite dan backend Rust/Axum, memakai PostgreSQL. Lowongan dapat dilihat tanpa login; pelamar membuat akun atau masuk dengan email saat mengirim lamaran.

## Struktur

- `resources/js/`, `resources/css/`: React SPA dan stylesheet.
- `services/app-backend/`: API Axum dan migrasi SQL.
- `public/spa/`: hasil build frontend yang dilayani backend.
- `Cargo.toml`: Cargo workspace.
- `.env.example`: contoh konfigurasi lokal; salin menjadi `.env` dan isi kredensial database. Jangan commit `.env`.

## Menjalankan lokal

1. Pastikan database PostgreSQL `talent_mobility` tersedia.
2. Dari root project: `Copy-Item .env.example .env`, lalu isi `DATABASE_URL` dan tiga variabel `ADMIN_*` untuk membuat akun admin awal.
3. Pasang dependensi frontend dengan `npm install`.
4. Jalankan frontend dan backend bersama-sama dari root: `npm run dev`.
5. Buka `http://127.0.0.1:8000`.

Dalam mode pengembangan, Vite menerima halaman dan API pada port 8000, lalu meneruskan permintaan `/api` ke backend Rust pada port internal 8001. Jadi cukup jalankan satu perintah dan buka `http://127.0.0.1:8000`. Tekan `Ctrl+C` untuk menghentikan keduanya.

Untuk menjalankan versi build, jalankan `npm run build`, lalu `cargo run -p app-backend`; backend menyajikan frontend dan API pada port 8000.

Dashboard admin tersedia dari tombol **Admin**. Akun awal dibuat dari `ADMIN_NAME`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `.env`; kata sandi minimal 12 karakter.

Detail API dan database tersedia di [`services/app-backend/README.md`](services/app-backend/README.md).
