# Panduan Kontribusi

## Menyiapkan lingkungan

Gunakan Node.js 22+, npm, Rust stable, dan PostgreSQL. Ikuti langkah penyiapan pada [README](README.md), lalu jalankan `npm run dev` dari root project. Frontend tersedia di `http://127.0.0.1:8000`; Vite meneruskan `/api` ke backend pada port 8001.

Simpan konfigurasi lokal di `.env`. Jangan menambahkan kredensial, token, data pelamar, atau berkas pribadi ke commit.

## Struktur kode

- `resources/js/features/`: layar dan alur autentikasi, pelamar, admin, dan pengaturan akun.
- `resources/js/components/`: komponen lintas fitur.
- `resources/js/api.js`: helper permintaan API.
- `resources/js/query/`: kunci dan konfigurasi query React Query.
- `services/app-backend/src/main.rs`: routing Axum dan tipe bersama.
- `services/app-backend/src/`: handler domain admin, akun, lamaran, autentikasi, dan lowongan.
- `services/app-backend/migrations/`: perubahan skema PostgreSQL.

Saat mengubah kontrak API, sinkronkan handler backend, pemanggil frontend, dan dokumentasi endpoint.

## Validasi perubahan

Sebelum membuka pull request, jalankan:

```powershell
npm run check
cargo fmt --all -- --check
cargo test --workspace
```

Tes backend saat ini tidak memerlukan PostgreSQL. Untuk perubahan yang memengaruhi kueri atau migrasi, uji juga dengan database lokal.

## API dan database

- Tambahkan migrasi SQL baru dengan nomor berikutnya; jangan mengubah migrasi yang sudah diterapkan.
- Validasi izin dan lingkup organisasi di backend. Menyembunyikan navigasi atau tombol di frontend bukan pengganti otorisasi server.
- Respons API memakai `Cache-Control: no-store`. Jika Cloudflare digunakan, buat aturan bypass cache untuk `/api/*`.
- Pertahankan pesan antarmuka berbahasa Indonesia dan tandai kolom formulir wajib/opsional dengan jelas.

## Pull request

Jaga perubahan tetap fokus. Sertakan ringkasan perilaku yang berubah, hasil pemeriksaan, dan tangkapan layar untuk perubahan antarmuka jika relevan. Jangan commit keluaran build atau file `.env`.
