# Fungsi bersama untuk skrip staging (di-dot-source oleh deploy-staging.ps1, staging-refresh.ps1, staging-test.ps1).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$envFile = Join-Path $root '.env.staging'
$prodDb = 'talent-mobility-db-1'
$stagingDb = 'talent-mobility-staging-db-1'
$publicUrl = 'https://emtopro-staging.4connectivity.my.id'

# Staging permanen: ikut jaringan tunnel agar bisa dijangkau lewat hostname publik.
$compose = @('compose', '-f', 'compose.staging.yaml', '-f', 'compose.staging.tunnel.yaml', '--env-file', '.env.staging')
# Tumpukan tes: proyek terpisah, tanpa jaringan tunnel, port 8011, DB sendiri (tidak menyentuh salinan produksi).
$testProject = 'talent-mobility-staging-test'
$composeTest = @('compose', '-p', $testProject, '-f', 'compose.staging.yaml', '--env-file', '.env.staging')

function New-Secret([int]$Length) {
  $bytes = New-Object byte[] ($Length * 3)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $text = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''
  return $text.Substring(0, $Length)
}

function Initialize-StagingEnv {
  if (Test-Path $envFile) { return }
  # Kredensial acak khusus staging (huruf besar/kecil, angka, simbol agar memenuhi aturan kata sandi).
  $content = @"
# Dibuat otomatis oleh scripts/deploy-staging.ps1. Tidak di-commit. Hanya untuk staging.
STAGING_PORT=8010
STAGING_PUBLIC_URL=$publicUrl
POSTGRES_PASSWORD=$(New-Secret 24)
ADMIN_EMAIL=admin-staging@example.test
# Kata sandi uji: setelah staging-refresh.ps1, SEMUA akun (pelamar dan admin) memakai kata sandi ini.
ADMIN_PASSWORD=$(New-Secret 16)aA1!
DEFAULT_APPLICANT_PASSWORD=$(New-Secret 16)aA1!
# Cloudflare Turnstile dimatikan di staging (kosong = tidak ada widget dan tidak ada verifikasi).
VITE_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
"@
  # UTF-8 tanpa BOM: BOM merusak nama variabel pertama di env-file Docker.
  [System.IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ".env.staging dibuat dengan rahasia acak baru (gitignored)." -ForegroundColor Cyan
}

function Get-EnvValue([string]$Path, [string]$Name, [string]$Default = '') {
  if (-not (Test-Path $Path)) { return $Default }
  $line = Select-String -Path $Path -Pattern "^$Name=(.*)$" | Select-Object -First 1
  if ($line -and $line.Matches[0].Groups[1].Value.Trim()) { return $line.Matches[0].Groups[1].Value.Trim() }
  return $Default
}

function Wait-App([string]$Port) {
  $url = "http://127.0.0.1:$Port/"
  for ($i = 0; $i -lt 90; $i++) {
    try {
      $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      Write-Host "Siap di $url" -ForegroundColor Green
      return
    } catch { Start-Sleep -Seconds 1 }
  }
  throw "Belum merespons di $url. Lihat log: docker compose -f compose.staging.yaml --env-file .env.staging logs app"
}

function Invoke-Docker {
  & docker @args
  if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') gagal (kode $LASTEXITCODE)." }
}
