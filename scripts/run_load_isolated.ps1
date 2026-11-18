$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$config = Get-Content -LiteralPath (Join-Path $workspace '.local/postgres-local.json') | ConvertFrom-Json
$psql = Join-Path $workspace '.local/pg-client/psql.exe'
$name = 'qa_load_' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$previousPassword = $env:PGPASSWORD
$previousTestDatabase = $env:TEST_DATABASE_URL
$created = $false
$result = 1
try {
  $env:PGPASSWORD = $config.password
  & $psql -h 127.0.0.1 -p $config.port -U dentalrisk_local_admin -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $name"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la base aislada' }
  $created = $true
  $env:TEST_DATABASE_URL = "postgresql://dentalrisk_local_admin:$($config.password)@127.0.0.1:$($config.port)/$name"
  Push-Location $workspace
  try {
    & node --env-file=.env --import tsx scripts/load.ts
    $result = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  $env:TEST_DATABASE_URL = $previousTestDatabase
  if ($created) {
    & $psql -h 127.0.0.1 -p $config.port -U dentalrisk_local_admin -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $name WITH (FORCE)"
    if ($LASTEXITCODE -ne 0) { Write-Error "No se pudo retirar la base aislada $name" }
  }
  $env:PGPASSWORD = $previousPassword
}
exit $result
