# Deploy STAGING Talent Mobility (Docker + Cloudflare Tunnel) di server ini. Jalankan dari mana saja:
#   .\scripts\deploy-staging.ps1
# Membangun image dari WORKING TREE saat ini (termasuk perubahan yang belum di-commit, supaya bisa diuji
# sebelum masuk ke produksi), lalu menaikkan stack staging dan memverifikasi aplikasinya menjawab.
# Stack staging terpisah penuh dari produksi (project, volume, rahasia, dan image sendiri).
# Aturan: jangan pernah `docker compose down -v` pada staging (menghapus salinan data staging).
# Panduan lengkap: docs/staging-docker-cloudflare.md
. "$PSScriptRoot\staging\common.ps1"

Initialize-StagingEnv

# Pagar: staging menolak berjalan bila memakai alamat, rahasia, atau nama image yang sama dengan produksi.
$prodEnv = Join-Path $root '.env.docker'
$stagingUrl = Get-EnvValue $envFile 'STAGING_PUBLIC_URL'
if (-not $stagingUrl) { throw 'STAGING_PUBLIC_URL kosong di .env.staging.' }
if ($stagingUrl.TrimEnd('/') -eq (Get-EnvValue $prodEnv 'APP_PUBLIC_URL').TrimEnd('/')) {
  throw "STAGING_PUBLIC_URL ($stagingUrl) sama dengan produksi; staging harus punya hostname sendiri."
}
foreach ($key in 'POSTGRES_PASSWORD', 'ADMIN_PASSWORD') {
  $value = Get-EnvValue $envFile $key
  if ($value -and $value -eq (Get-EnvValue $prodEnv $key)) { throw "$key di .env.staging sama dengan produksi; staging harus memakai rahasia sendiri." }
}

Write-Host '==> Bangun dan jalankan staging' -ForegroundColor Cyan
Invoke-Docker @compose up -d --build db app
Wait-App (Get-EnvValue $envFile 'STAGING_PORT' '8010')
Write-Host "Staging berjalan. Lokal: http://127.0.0.1:$(Get-EnvValue $envFile 'STAGING_PORT' '8010')/  |  Publik: $stagingUrl"
Write-Host 'Salin data produksi dengan: .\scripts\staging-refresh.ps1'
