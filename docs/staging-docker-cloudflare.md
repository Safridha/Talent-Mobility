# Staging (Docker + Cloudflare Tunnel)

Staging adalah stack Docker terpisah untuk menguji perubahan **sebelum** deploy ke produksi, memakai salinan data
produksi. Polanya sama dengan staging SuperApp dan ProAct di server ini.

```
Internet -> Cloudflare (Access) -> core-cloudflared (jaringan 4connectivity-net)
         -> http://talent-mobility-staging:8000   (service `app`)
```

Alamat publik: **https://emtopro-staging.4connectivity.my.id** (lokal: `http://127.0.0.1:8010`).

File: [`compose.staging.yaml`](../compose.staging.yaml), [`compose.staging.tunnel.yaml`](../compose.staging.tunnel.yaml),
[`scripts/deploy-staging.ps1`](../scripts/deploy-staging.ps1), [`scripts/staging-refresh.ps1`](../scripts/staging-refresh.ps1),
[`scripts/staging-test.ps1`](../scripts/staging-test.ps1).

## Pemisahan dari produksi

| | Produksi (`compose.yaml`) | Staging (`compose.staging.yaml`) |
|---|---|---|
| Project / volume | `talent-mobility` / `postgres-data` | `talent-mobility-staging` / `staging-data` |
| Image | `talent-mobility-app` | `talent-mobility-staging-app` |
| Rahasia | `.env.docker` | `.env.staging` (acak otomatis, gitignored) |
| Alamat | `emtopro.4connectivity.my.id` | `emtopro-staging.4connectivity.my.id` |
| Cloudflare Turnstile | aktif | **dimatikan** (tanpa widget, tanpa verifikasi) |
| Push notification | VAPID aktif | **tanpa VAPID**: tidak pernah mengirim push ke perangkat sungguhan |
| Batas memori | - | db 768 MB, app 512 MB |

`deploy-staging.ps1` menolak berjalan bila alamat atau rahasia staging sama dengan produksi.
**Jangan pernah `docker compose down -v` pada staging** (menghapus salinan data).

## Perintah

```powershell
.\scripts\deploy-staging.ps1          # bangun dari working tree + jalankan (membuat .env.staging bila belum ada)
.\scripts\staging-refresh.ps1         # salin data produksi ke staging (minta konfirmasi; -Yes untuk melewati)
.\scripts\staging-test.ps1            # tes Rust + tes alur batch pada tumpukan tes terisolasi
```

## Menyalin data produksi (`staging-refresh.ps1`)

1. `pg_dump` pada DB produksi (**hanya membaca**), database staging dibuat ulang dari dump itu.
2. [`scripts/staging/sanitize.sql`](../scripts/staging/sanitize.sql) dijalankan **sebelum aplikasi staging dinyalakan**:
   - **Semua akun (pelamar dan admin) memakai kata sandi uji**, yaitu `ADMIN_PASSWORD` di `.env.staging`.
     Kata sandi asli pelamar dan admin tidak pernah ada di staging, dan hash aslinya tidak ikut tersalin.
   - Sesi login, kunci idempotensi, dan langganan push dikosongkan; penghitung gagal login direset.
3. Aplikasi staging dinyalakan kembali. Migrasi yang belum ada di produksi ikut dijalankan pada salinan itu,
   jadi refresh sekaligus menjadi uji coba migrasi pada data nyata.
4. File dump sementara dihapus dari host dan container.

Masuk ke staging dengan NIP/email akun yang sama seperti di produksi dan kata sandi `ADMIN_PASSWORD`.
Akun `ADMIN_EMAIL` di `.env.staging` adalah super admin khusus staging.

Data lain (nama, NIP, email, dokumen lamaran) disalin apa adanya. Jalankan refresh seperlunya, dan lindungi
hostname dengan Cloudflare Access (di bawah).

## Menghubungkan hostname ke tunnel (sekali saja)

Tunnel `core-cloudflared` dikelola dari dashboard (memakai token), jadi route ditambahkan di sana:

1. Zero Trust > Networks > Tunnels > tunnel yang dipakai produksi > **Public Hostname** > Add.
2. Hostname `emtopro-staging.4connectivity.my.id`, Service **HTTP**, URL `talent-mobility-staging:8000`.
   DNS dibuat Cloudflare otomatis. Container staging sudah ada di `4connectivity-net` dengan alias itu.
3. **Pasang Cloudflare Access** pada hostname itu (Zero Trust > Access > Applications > Self-hosted), mis. hanya
   email tim. Staging berisi data pribadi pelamar; tanpa Access, siapa pun yang tahu alamatnya bisa membukanya.

## Tes (`staging-test.ps1`)

Berjalan pada **tumpukan tes terisolasi** (proyek `talent-mobility-staging-test`, DB kosong, port 8011, tanpa
tunnel), sehingga salinan data produksi tidak pernah ditimpa.

- `rust`: `cargo test` penuh (unit + integrasi + database sqlx) di dalam container; tidak perlu Visual Studio
  Build Tools. Kompilasi pertama sekitar 5-6 menit, berikutnya cepat berkat cache di volume.
- `flow` ([`scripts/staging/flow_test.py`](../scripts/staging/flow_test.py), butuh Python 3): validasi dan CRUD
  batch, bentrok jadwal, kunci edit batch selesai, aturan pendaftaran per unit (departemen utuh vs satu
  biro/bengkel), batas lamaran, fase publik, dan penolakan otomatis setelah periode wawancara.

## Alur sebelum deploy

1. `.\scripts\staging-test.ps1` harus hijau.
2. `.\scripts\deploy-staging.ps1`, lalu `.\scripts\staging-refresh.ps1` bila perubahan menyentuh migrasi atau data.
   Periksa tampilan di staging.
3. Backup DB produksi bila ada migrasi, lalu deploy seperti biasa
   (`docker compose --env-file .env.docker up -d --build app`).
