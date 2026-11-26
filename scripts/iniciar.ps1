$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Instala Docker Desktop para iniciar DentalRisk.'
}
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Abre Docker Desktop y vuelve a ejecutar iniciar.cmd.' }

function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

function Get-FreePort([int]$first) {
    for ($port = $first; $port -lt $first + 100; $port++) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
        try { $listener.Start(); return $port }
        catch [Net.Sockets.SocketException] {}
        finally { $listener.Stop() }
    }
    throw "No hay puertos libres cerca de $first."
}

if (-not (Test-Path -LiteralPath '.env')) {
    $webPort = Get-FreePort 3000
    $agentPort = Get-FreePort 8000
    $template = Get-Content -LiteralPath '.env.example' -Raw
    $template = $template.Replace('http://localhost:3000', "http://localhost:$webPort")
    $template = $template.Replace('DENTALRISK_PORT=3000', "DENTALRISK_PORT=$webPort")
    $template = $template.Replace('AGENT_API_PORT=8000', "AGENT_API_PORT=$agentPort")
    $projectSuffix = (New-Secret).Substring(0, 12)
    $template += "`r`nCOMPOSE_PROJECT_NAME=dentalrisk-$projectSuffix`r`n"
    foreach ($placeholder in [regex]::Matches($template, 'CHANGE_ME_[A-Z0-9_]+').Value | Select-Object -Unique | Sort-Object Length -Descending) {
        $template = $template.Replace($placeholder, (New-Secret))
    }
    $stream = [IO.File]::Open((Join-Path (Get-Location).Path '.env'), [IO.FileMode]::CreateNew)
    $writer = [IO.StreamWriter]::new($stream)
    try { $writer.Write($template) } finally { $writer.Dispose() }
    Write-Host 'Configuracion y cuenta inicial guardadas en .env.'
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath '.env') {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}
$composeFiles = @('-f', 'compose.yaml')
if ($settings.Keys -match '^CLOUD_.*DATABASE_URL$') {
    $composeFiles += @('-f', 'compose.cloud.yaml')
}
docker compose @composeFiles up -d --build --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose no pudo iniciar DentalRisk.' }

function Wait-Endpoint([string]$url) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return }
        } catch {}
        Start-Sleep -Seconds 1
    }
    throw "El servicio no responde en $url."
}

$webPort = if ($env:DENTALRISK_PORT) { $env:DENTALRISK_PORT } elseif ($settings.DENTALRISK_PORT) { $settings.DENTALRISK_PORT } else { 3000 }
$agentPort = if ($env:AGENT_API_PORT) { $env:AGENT_API_PORT } elseif ($settings.AGENT_API_PORT) { $settings.AGENT_API_PORT } else { 8000 }
$web = "http://localhost:$webPort"
Wait-Endpoint "$web/api/v1/health"
Wait-Endpoint "http://localhost:$agentPort/health/ready"
Write-Host "DentalRisk listo en $web"
Write-Host 'Consulta ADMIN_EMAIL y ADMIN_PASSWORD en .env para iniciar sesion por primera vez.'
