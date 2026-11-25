param(
    [string]$EspUrl = 'http://192.168.1.76',
    [string]$ApiHost,
    [ValidateRange(1, 65535)]
    [int]$ApiPort = 8100
)

$ErrorActionPreference = 'Stop'
$agentRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectRoot = (Resolve-Path (Join-Path $agentRoot '..')).Path
$python = Join-Path $agentRoot '.venv\Scripts\python.exe'
$privateRoot = Join-Path $agentRoot '.local\esp'
$logRoot = Join-Path $privateRoot 'provision-logs'
$managedPidFile = Join-Path $privateRoot 'dentalrisk-api.pid'

if (-not (Test-Path $python)) {
    throw "No encuentro el entorno de Python del agente: $python"
}
if (-not $ApiHost) {
    $wifi = Get-NetIPConfiguration |
        Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway } |
        Select-Object -First 1
    if (-not $wifi -or -not $wifi.IPv4Address) {
        throw 'No detecté una IPv4 de Wi-Fi/LAN. Pasa -ApiHost con la IP de esta computadora.'
    }
    $ApiHost = $wifi.IPv4Address.IPAddress
}

New-Item -ItemType Directory -Path $privateRoot, $logRoot -Force | Out-Null

# Confirm the intended ESP-CLAW before changing any files on it.
$device = Invoke-RestMethod -Uri "$($EspUrl.TrimEnd('/'))/api/status" -TimeoutSec 5
if (-not $device.wifi_connected) {
    throw 'El dispositivo respondió, pero no está conectado a Wi-Fi.'
}
Write-Host "ESP-CLAW detectado en $($device.ip)."
Write-Host "La API de DentalRisk se publicará en http://${ApiHost}:$ApiPort."

# Start the project's private MinIO and require the shared clinic DB to be online.
if (-not (Test-NetConnection 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue -InformationLevel Quiet)) {
    throw 'PostgreSQL no responde en 127.0.0.1:5432. Inicia primero la base DentalRisk con npm run db:start.'
}
Push-Location $agentRoot
try {
    & docker compose up -d --wait minio
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar MinIO del agente.' }
} finally {
    Pop-Location
}

Push-Location $agentRoot
try {
    & $python scripts/update_esp_target.py --esp-url $EspUrl --api-host $ApiHost --api-port $ApiPort
    if ($LASTEXITCODE -ne 0) { throw 'No se actualizó la conexión local del ESP.' }
} finally {
    Pop-Location
}

function Stop-ManagedApi {
    if (-not (Test-Path $managedPidFile)) { return }
    $rawPid = (Get-Content $managedPidFile -Raw).Trim()
    $prior = Get-CimInstance Win32_Process -Filter "ProcessId=$rawPid" -ErrorAction SilentlyContinue
    if ($prior -and $prior.ExecutablePath -eq $python -and $prior.CommandLine -like '*uvicorn*main:create_app*') {
        Stop-Process -Id ([int]$rawPid) -Force
        Start-Sleep -Milliseconds 800
    }
    Remove-Item -LiteralPath $managedPidFile -Force
}

function Start-ManagedApi([string]$BindHost) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($listener) {
        throw "El puerto $ApiPort ya está ocupado por otro proceso. No lo detuve; elige -ApiPort distinto."
    }
    $stdout = Join-Path $logRoot 'api.stdout.log'
    $stderr = Join-Path $logRoot 'api.stderr.log'
    $process = Start-Process -FilePath $python `
        -ArgumentList @('-m', 'uvicorn', 'main:create_app', '--factory', '--host', $BindHost,
            '--port', "$ApiPort", '--no-access-log') `
        -WorkingDirectory $agentRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -LiteralPath $managedPidFile -Value $process.Id -NoNewline

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($process.HasExited) {
            $details = if (Test-Path $stderr) { Get-Content $stderr -Tail 12 | Out-String } else { '' }
            throw "La API se cerró al iniciar. Revisa $stderr`n$details"
        }
        try {
            $ready = Invoke-RestMethod -Uri "http://${BindHost}:$ApiPort/health/ready" -TimeoutSec 2
            if ($ready.status -eq 'ready') { return $process }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    throw "La API no quedó lista. Revisa $stderr"
}

Stop-ManagedApi
$apiProcess = Start-ManagedApi $ApiHost
$connectionPath = Join-Path $privateRoot 'connection.json'
$connection = Get-Content -LiteralPath $connectionPath -Raw | ConvertFrom-Json
$headers = @{ 'X-Agent-Key' = $connection.headers.'X-Agent-Key' }
$connected = Invoke-RestMethod -Uri "$($connection.api_base_url)/api/v1/agent/connection" `
    -Headers $headers -TimeoutSec 8
if (-not $connected.connected) { throw 'La API no confirmó la delegación DentalRisk.' }

Push-Location $agentRoot
try {
    & $python scripts/install_esp.py --include-identity
    if ($LASTEXITCODE -ne 0) { throw 'La carga al ESP falló; revisa los respaldos y logs privados.' }
} finally {
    Pop-Location
}

Write-Host "DentalRisk quedó cargado en ESP-CLAW ($($device.ip))."
Write-Host "API activa: $($connection.api_base_url) (PID $($apiProcess.Id))."
Write-Host "Habilidad e identidad instaladas; los archivos reemplazados tienen copia en .local/esp/backup."
Write-Host "Si el ESP no alcanza la API, permite el puerto $ApiPort en Firewall de Windows para la red privada."
