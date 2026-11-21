# Segarkan data STAGING dengan salinan produksi. Jalankan dari mana saja:
#   .\scripts\staging-refresh.ps1          # dengan pertanyaan konfirmasi
#   .\scripts\staging-refresh.ps1 -Yes     # tanpa pertanyaan
#
# Produksi hanya DIBACA (pg_dump); tidak ada yang ditulis ke DB produksi. Staging yang ditimpa: database
# dibuat ulang dari dump, lalu scripts/staging/sanitize.sql memasang kata sandi uji (ADMIN_PASSWORD di
# .env.staging) ke SEMUA akun dan mengosongkan sesi, kunci idempotensi, dan langganan push.
# Dengan begitu kata sandi asli pelamar/admin tidak pernah ada di staging.
# Dump sementara (berisi data pribadi) dihapus dari host dan container setelah selesai.
# Catatan: PowerShell 5.1 membuang tanda kutip ganda di dalam argumen perintah native, jadi perintah
# `sh -c` di bawah sengaja tanpa kutip ganda dan SQL yang butuh kutip ada di scripts/staging/*.sql.
param([switch]$Yes)
. "$PSScriptRoot\staging\common.ps1"

if (-not (Test-Path $envFile)) { throw '.env.staging belum ada. Jalankan .\scripts\deploy-staging.ps1 dulu.' }
foreach ($name in @($prodDb, $stagingDb)) {
  $state = & docker inspect -f '{{.State.Running}}' $name 2>$null
  if ($state -ne 'true') { throw "Container $name tidak berjalan." }
}
if ($prodDb -eq $stagingDb) { throw 'Sumber dan tujuan tidak boleh sama.' }

$adminEmail = Get-EnvValue $envFile 'ADMIN_EMAIL'
# Hash kata sandi uji diambil dari akun admin staging (dibuat aplikasi saat start), supaya tidak perlu
# menghitung argon2 di luar aplikasi dan aplikasi tidak perlu hidup selama data asli ada di DB.
$hash = (& docker @compose exec -T db psql -U staging -d staging -t -A -c "SELECT password_hash FROM admins WHERE email = '$adminEmail'").Trim()
if (-not $hash) { throw 'Akun admin staging belum ada. Jalankan .\scripts\deploy-staging.ps1 dulu.' }

if (-not $Yes) {
  $answer = Read-Host 'Database staging akan DITIMPA dengan salinan produksi. Ketik "ya" untuk lanjut'
  if ($answer -ne 'ya') { Write-Host 'Dibatalkan.'; exit 1 }
}

$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$remote = "/tmp/staging-refresh-$stamp.dump"
$local = Join-Path ([System.IO.Path]::GetTempPath()) "staging-refresh-$stamp.dump"
try {
  Write-Host '==> Dump database produksi (baca-saja)' -ForegroundColor Cyan
  Invoke-Docker exec $prodDb sh -c ('pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc --no-owner --no-privileges -f ' + $remote)
  Invoke-Docker cp "${prodDb}:$remote" $local
  & docker exec $prodDb rm -f $remote

  Write-Host '==> Timpa database staging (aplikasi staging dihentikan sementara)' -ForegroundColor Cyan
  Invoke-Docker @compose stop app
  Invoke-Docker @compose exec -T db psql -U staging -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS staging WITH (FORCE)'
  Invoke-Docker @compose exec -T db psql -U staging -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE staging'
  Invoke-Docker @compose cp $local db:/tmp/staging-refresh.dump
  Invoke-Docker @compose exec -T db pg_restore -U staging -d staging --no-owner --no-privileges --exit-on-error /tmp/staging-refresh.dump

  Write-Host '==> Ganti kata sandi semua akun dengan kata sandi uji, bersihkan sesi dan langganan push' -ForegroundColor Cyan
  Invoke-Docker @compose cp scripts/staging/sanitize.sql db:/tmp/staging-sanitize.sql
  Invoke-Docker @compose exec -T -e "STAGING_HASH=$hash" -e "STAGING_ADMIN=$adminEmail" db sh -c 'psql -U staging -d staging -v ON_ERROR_STOP=1 -v hash=$STAGING_HASH -v admin_email=$STAGING_ADMIN -f /tmp/staging-sanitize.sql'

  # `start` (bukan `up`): tidak membangun ulang atau mengganti image yang sedang dipakai staging.
  # Aplikasi menjalankan migrasi saat naik, jadi migrasi yang belum ada di produksi ikut teruji di sini.
  Write-Host '==> Jalankan kembali aplikasi staging' -ForegroundColor Cyan
  Invoke-Docker @compose start app
  Wait-App (Get-EnvValue $envFile 'STAGING_PORT' '8010')
  Write-Host "Selesai. Staging berisi salinan produksi; masuk dengan akun yang sama dan kata sandi ADMIN_PASSWORD dari .env.staging." -ForegroundColor Green
}
finally {
  if (Test-Path $local) { Remove-Item $local -Force }
  & docker @compose exec -T db rm -f /tmp/staging-refresh.dump /tmp/staging-sanitize.sql 2>$null
}
