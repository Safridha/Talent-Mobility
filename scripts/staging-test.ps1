# Tes sebelum deploy, pada tumpukan tes TERISOLASI (proyek talent-mobility-staging-test, DB kosong, port 8011,
# tanpa tunnel). Salinan data produksi di staging tidak pernah ditimpa atau dikotori oleh tes ini.
#   .\scripts\staging-test.ps1 rust    # tes Rust penuh (unit + integrasi + database sqlx)
#   .\scripts\staging-test.ps1 flow    # tes alur batch periode dari ujung ke ujung (butuh Python 3)
#   .\scripts\staging-test.ps1         # keduanya
param(
  [Parameter(Position = 0)]
  [ValidateSet('all', 'rust', 'flow')]
  [string]$Suite = 'all'
)
. "$PSScriptRoot\staging\common.ps1"
Initialize-StagingEnv

# Menjalankan blok pada tumpukan tes (port 8011), lalu mengembalikan variabel lingkungan.
function Use-TestStack([scriptblock]$Block) {
  $previousPort = $env:STAGING_PORT
  $previousUrl = $env:STAGING_PUBLIC_URL
  $env:STAGING_PORT = '8011'
  $env:STAGING_PUBLIC_URL = 'http://127.0.0.1:8011'
  $env:STAGING_PROJECT = $testProject
  try { & $Block } finally {
    $env:STAGING_PORT = $previousPort
    $env:STAGING_PUBLIC_URL = $previousUrl
    $env:STAGING_PROJECT = $null
  }
}

function Remove-TestData {
  # Hanya volume data; cache kompilasi Rust (staging-cargo-target) dibiarkan agar tes berikutnya cepat.
  & docker @composeTest down
  & docker volume rm -f "${testProject}_staging-data" | Out-Null
}

function Invoke-RustTests {
  Use-TestStack {
    Invoke-Docker @composeTest up -d db
    Invoke-Docker @composeTest --profile test run --rm tests
  }
}

function Invoke-FlowTests {
  $script:flowCode = 1
  Use-TestStack {
    Remove-TestData
    Invoke-Docker @composeTest up -d --build db app
    Wait-App '8011'
    & python scripts/staging/flow_test.py
    $script:flowCode = $LASTEXITCODE
    Remove-TestData
  }
}

if ($Suite -in 'all', 'rust') { Invoke-RustTests }
if ($Suite -in 'all', 'flow') {
  Invoke-FlowTests
  exit $script:flowCode
}
