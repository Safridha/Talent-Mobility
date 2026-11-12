# Idempotensi dan race condition

Satu strategi tidak cocok untuk semua alur, jadi dipilih per fitur menurut risikonya. Prinsipnya: **keputusan terakhir selalu diambil database** (constraint unik, kunci baris, transaksi), bukan pengecekan "ada atau tidak" di aplikasi, karena pengecekan seperti itu bisa dilewati dua request yang jalan bersamaan.

| Alur | Risiko | Strategi |
|---|---|---|
| **Kirim lamaran** (`POST /api/applications`) | klik ganda, jaringan putus lalu coba lagi, dua tab | `Idempotency-Key` (satu kunci per form) + indeks unik parsial (satu lamaran aktif per pelamar dan tujuan) + advisory lock per pelamar untuk batas jumlah lamaran |
| **Buat akun pelamar** (`POST /api/admin/accounts`) | klik ganda admin | `Idempotency-Key` + constraint unik NIP/email |
| **Ubah status lamaran** (`PATCH .../status`) | dua admin memutuskan bersamaan, status berubah saat layar terbuka, klik ganda | kunci baris `SELECT ... FOR UPDATE` + validasi tahapan (mesin status) + pengubahan ke status yang sama diperlakukan sukses tanpa efek (tidak ada notifikasi ganda) + **optimistic check** `expected_status` (409 bila sudah diubah admin lain) |
| **Import Excel** | dua import bersamaan menabrak NIP dan master data yang sama | `pg_advisory_xact_lock` (import berjalan satu per satu) + cache master dibaca **setelah** kunci + `ON CONFLICT DO NOTHING`; pratinjau (`dry_run`) dijalankan lalu di-rollback |
| **CRUD master data** (divisi, departemen, biro) | nama ganda, hapus saat masih dipakai | indeks unik per induk (tanpa beda huruf besar/kecil) + FK `ON DELETE RESTRICT`; pelanggaran dipetakan ke 409 dengan pesan yang jelas |
| **Profil pelamar** (divisi, departemen, biro) | master berubah saat profil disimpan | FK komposit (departemen harus milik divisi, biro milik departemen); pelanggaran FK dipetakan ke 409 "Data master berubah, muat ulang" |
| **Gagal login berulang** | percobaan paralel melewati batas | satu `UPDATE ... SET failed_login_attempts = failed_login_attempts + 1 ... RETURNING` atomik |
| **Tandai notifikasi dibaca** | klik ganda | `UPDATE ... SET read_at = COALESCE(read_at, NOW())` (aman diulang) |

## Idempotency-Key

- Klien membuat satu kunci per **niat pengguna** (UUID saat form dibuka) dan mengirimnya lagi pada setiap percobaan ulang dari form yang sama. Header: `Idempotency-Key: <8-128 karakter: huruf, angka, - _ . :>`.
- Server menyimpan `(scope, key, fingerprint, response)` di tabel `idempotency_keys` **dalam transaksi yang sama** dengan pekerjaannya. Jadi hasilnya tersimpan atomik: tidak ada keadaan "sudah dikerjakan tapi kuncinya belum tercatat".
- `INSERT ... ON CONFLICT DO NOTHING` pada kunci adalah titik sinkronisasi: request kedua dengan kunci yang sama **menunggu** transaksi pertama selesai. Jika pertama commit, request kedua mengulang respons tersimpan (header `Idempotent-Replayed: true`); jika pertama gagal dan rollback, request kedua mengerjakannya sendiri.
- `fingerprint` (SHA-256 dari isi permintaan, termasuk hash berkas) mencegah kunci yang sama dipakai untuk permintaan berbeda (422).
- `scope` memisahkan pemilik dan jenis operasi (`application:<id pelamar>`, `applicant-account:<id admin>`), sehingga kunci milik satu pengguna tidak bisa dipakai pengguna lain.
- Kunci dihapus otomatis setelah 48 jam.
- Header bersifat opsional di server: tanpa kunci, perlindungan tetap datang dari constraint unik (hasil uji: 8 request paralel tanpa kunci menghasilkan 1 lamaran dan 7 respons 409).

## Mengapa strategi ini

- **Kunci idempotensi** untuk operasi yang *membuat* sesuatu dan yang hasilnya mahal atau tak bisa diulang (unggah berkas besar): klien mendapat jawaban yang sama pada percobaan ulang, bukan galat "sudah ada".
- **Kunci baris + mesin status** untuk alur yang punya urutan (seleksi lamaran): urutan perubahan dijaga serial per lamaran tanpa mengunci tabel.
- **Optimistic check (`expected_status`)** untuk keputusan manusia: dua admin melihat layar yang sama; yang kedua harus tahu bahwa keadaan sudah berubah, bukan menimpanya diam-diam.
- **Advisory lock** untuk pekerjaan massal yang harus berjalan sendirian (import) dan untuk batas jumlah (hitung lalu sisipkan).
- **Constraint database** sebagai jaring pengaman terakhir untuk semua alur lain, karena paling andal terhadap request paralel.

## Pengujian

Uji paralel terhadap backend sungguhan (PostgreSQL), semuanya lolos:

- 8 pengiriman lamaran paralel dengan kunci sama menghasilkan 8 respons 200, 1 lamaran, dan 7 respons ulang.
- Kunci sama dengan isi berbeda menghasilkan 422.
- 8 pengiriman dengan kunci berbeda menghasilkan 1 lamaran dan 7 respons 409.
- 8 perubahan status yang sama menghasilkan 8 respons 200 dan 1 notifikasi.
- Dua admin memutuskan bersamaan dari layar yang sama: satu berhasil, satu mendapat 409.
- Akun pelamar dibuat 6 kali paralel dengan kunci sama menghasilkan 1 akun; tanpa kunci menghasilkan 1 akun dan 5 respons 409.
- Dua import Excel bersamaan, keduanya 200, tanpa duplikat akun maupun master (satu membuat 60 akun, satunya tidak mengubah apa pun).
