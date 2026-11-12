# Talent Mobility

Portal rekrutmen dengan frontend React/Vite dan backend Rust/Axum, memakai PostgreSQL. Lowongan dapat dilihat tanpa login; pelamar membuat akun atau masuk dengan email saat mengirim lamaran.

## Struktur

- `resources/js/`, `resources/css/`: React SPA dan stylesheet.
- `resources/js/features/`: fitur admin, pelamar, autentikasi, dan pengaturan akun.
- `resources/js/components/`, `resources/js/query/`: komponen bersama dan konfigurasi cache/query.
- `services/app-backend/`: API Axum dan migrasi SQL.
- `services/app-backend/src/`: router API dan modul domain Rust.
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

Dashboard admin tersedia dari tombol **Admin**. Akun awal dibuat dari `ADMIN_NAME`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `.env`; kata sandi harus 8–128 karakter dengan huruf besar, huruf kecil, angka, dan simbol.

Detail API dan database tersedia di [`services/app-backend/README.md`](services/app-backend/README.md).

## Deploy dengan Docker

1. Salin `.env.docker.example` menjadi `.env.docker`, lalu atur `POSTGRES_PASSWORD` dan samakan nilainya pada `DATABASE_URL`. Gunakan kata sandi acak yang URL-safe, atau URL-encode karakter khusus.
2. Atur `APP_PUBLIC_URL` ke alamat publik aplikasi. Isi `ADMIN_NAME`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` di `.env.docker` untuk membuat akun Super Admin awal. Compose menolak start jika salah satu belum diisi.
3. Jalankan `docker compose --env-file .env.docker up --build -d`, lalu buka `http://localhost:8000` (atau port yang ditentukan oleh `APP_PORT`).

Compose membangun frontend dan API dalam satu image, menunggu PostgreSQL siap, lalu menjalankan migrasi saat API mulai. Migrasi mengisi data master Divisi, Departemen, Biro/Bengkel, serta jenis pekerjaan awal; Super Admin dibuat dari variabel lingkungan di atas, tanpa kredensial bawaan di source code. Data PostgreSQL disimpan pada volume `postgres-data`. Untuk melihat log jalankan `docker compose --env-file .env.docker logs -f app`; untuk menghentikan layanan gunakan `docker compose --env-file .env.docker down`. Volume database tetap tersimpan; `down -v` akan menghapusnya.

Pada deployment `4connectivity`, Cloudflare Tunnel dijalankan terpusat oleh server `server-dukprod-4connectivity`, bukan sebagai service terpisah di project ini. Pastikan Docker network eksternal `4connectivity-net` tersedia; service `app` bergabung ke network itu dengan alias `talent-mobility`, yang menjadi origin tunnel `http://talent-mobility:8000`. Atur `APP_PUBLIC_URL` ke hostname HTTPS, lalu jalankan `docker compose --env-file .env.docker up --build -d`. Port aplikasi tetap dibuka hanya pada localhost selain akses internal melalui network bersama.

PWA tersedia melalui manifest dan service worker dengan cache shell dasar untuk akses offline. Web Push memerlukan HTTPS (localhost untuk pengembangan) dan pasangan VAPID. Buat pasangan dengan `npx --yes web-push generate-vapid-keys`, lalu isi `VAPID_PUBLIC_KEY` dan `VAPID_PRIVATE_KEY` di `.env.docker`; `VAPID_SUBJECT` boleh berupa `mailto:...` atau URL HTTPS (nilai contoh pada `.env.docker.example` harus diganti dengan kontak Anda). Kunci privat hanya disimpan di server. Pengguna dapat mengaktifkan atau menonaktifkan push dari panel notifikasi; admin menerima push untuk lamaran baru dan pelamar menerima push saat status lamaran berubah.

## Pemeriksaan sebelum pull request

Jalankan `npm run check` untuk lint, typecheck, dan build frontend. Untuk backend, jalankan `cargo fmt --all -- --check` dan `cargo test --workspace`. Pengujian backend tidak memerlukan database lokal.

Panduan kontribusi, perubahan API, dan migrasi database tersedia di [`CONTRIBUTING.md`](CONTRIBUTING.md).
