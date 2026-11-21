-- Dijalankan oleh scripts/staging-refresh.ps1 HANYA pada database STAGING, sesudah salinan produksi
-- dipulihkan dan sebelum aplikasi staging dinyalakan. Tujuannya: data asli tetap ada untuk pengujian,
-- tetapi kredensial dan jejak sesi produksi tidak ikut terbawa.
-- Variabel psql: :hash = hash argon2 kata sandi uji staging, :admin_email = akun admin staging.

-- Semua akun memakai kata sandi uji staging (kata sandi asli pelamar/admin tidak boleh bisa dipakai di staging).
-- Penghitung gagal login dan kunci sementara ikut dibersihkan agar semua akun bisa langsung masuk.
UPDATE applicants SET password_hash = :'hash', failed_login_attempts = 0, locked_until = NULL;
UPDATE admins SET password_hash = :'hash', failed_login_attempts = 0, locked_until = NULL;

-- Sesi, kunci idempotensi, dan langganan push produksi tidak boleh berjalan di staging.
TRUNCATE TABLE applicant_tokens, admin_tokens, idempotency_keys, web_push_subscriptions;

SELECT (SELECT count(*) FROM applicants) AS pelamar_diperbarui,
       (SELECT count(*) FROM admins) AS admin_diperbarui,
       (SELECT count(*) FROM admins WHERE email = :'admin_email') AS akun_admin_staging;
