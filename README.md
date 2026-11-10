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

## Menjalankan lokal tanpa `.env`

Persiapkan Docker Desktop, Node.js 22+, dan Rust stable. Setelah clone atau pull:

```powershell
npm ci
npm run dev
```

`npm run dev` menyalakan PostgreSQL lokal melalui Docker Compose pada `127.0.0.1:54329`, menjalankan migrasi, lalu mengimpor snapshot master data versi project pada database development yang masih kosong. Snapshot hanya berisi divisi, departemen, biro/bengkel, dan jenis pekerjaan—tidak berisi akun pengguna, data karyawan, pelamar, atau lamaran. Database lokal menggunakan kredensial development khusus dan tidak dapat diakses dari jaringan luar.


Jika `DATABASE_URL` sudah diberikan sebagai environment variable, `npm run dev` memakai database development tersebut dan tidak menjalankan snapshot seeder. Jangan arahkan development ke production.

Untuk memperbarui snapshot dari database development yang berisi master data yang sudah disepakati, jalankan `cargo run -p app-backend --bin export_dev_master -- --write`, tinjau perubahan `services/app-backend/dev-seed/master-data.json`, lalu commit bersama kode. Exporter hanya membaca tabel organisasi dan jenis pekerjaan.

Untuk build production-style, siapkan konfigurasi server secara terpisah melalui environment atau `.env` lokal yang tidak di-commit, jalankan `npm run build`, lalu `cargo run -p app-backend`. Jangan memakai kredensial development lokal di server.

Detail API dan database tersedia di [`services/app-backend/README.md`](services/app-backend/README.md).

## Pemeriksaan sebelum pull request

Jalankan `npm run check` untuk lint, typecheck, dan build frontend. Untuk backend, jalankan `cargo fmt --all -- --check` dan `cargo test --workspace`. Pengujian backend tidak memerlukan database lokal.

Panduan kontribusi, perubahan API, dan migrasi database tersedia di [`CONTRIBUTING.md`](CONTRIBUTING.md).
