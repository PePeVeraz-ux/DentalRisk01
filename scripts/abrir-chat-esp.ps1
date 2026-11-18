# Conecta la placa identificada por USB al hotspot elegido por su propietario.
# Solo guarda la IP de la placa para abrir Web Chat; no guarda el comando ni la clave.
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'DentalRisk | Conectar el ESP32-S3 y abrir Web Chat'
$root = Split-Path $PSScriptRoot -Parent
$statusFile = Join-Path $root '.local\esp-chat-estado.json'
function Save-State($step, $ip = '') {
    [ordered]@{ estado=$step; ip=$ip; fecha=(Get-Date).ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding utf8
}
function Wifi-Arg([string]$v) {
    if ($v -match '[\x00-\x1f\x7f]') { throw 'Los valores Wi-Fi no admiten caracteres de control.' }
    return '"' + $v.Replace('\','\\').Replace('"','\"') + '"'
}
$port = $null
try {
    $device = Get-PnpDevice -PresentOnly -Class Ports | Where-Object { $_.FriendlyName -match '\(COM3\)' -and $_.InstanceId -like 'USB\VID_303A&PID_1001*' }
    if (-not $device) { throw 'No aparece el ESP32-S3 en COM3.' }
    $parent = (Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName DEVPKEY_Device_Parent).Data
    if ((($parent -split '\\')[-1] -replace '[:-]','') -notmatch 'C8404C$') { throw 'COM3 no corresponde a la placa comprobada.' }
    Write-Host '1. Activa el hotspot de tu telefono en 2.4 GHz, con Internet.'
    Write-Host '2. Conecta esta laptop al mismo hotspot desde el menu Wi-Fi de Windows.'
    Write-Host '3. Escribe los datos del hotspot aqui. Se enviaran solo a tu placa por COM3.'
    Save-State 'esperando_datos'
    $ssid = Read-Host 'Nombre exacto del hotspot (SSID)'
    if (-not $ssid -or [Text.Encoding]::UTF8.GetByteCount($ssid) -gt 32) { throw 'SSID no valido.' }
    $active = ((netsh wlan show interfaces | Out-String) -split '[\r\n]+' | Where-Object {$_ -match '^\s*SSID\s*:'} | Select-Object -First 1) -replace '^\s*SSID\s*:\s*',''
    if ($ssid -cne $active.Trim()) { throw 'La laptop aun no esta en ese hotspot. Conectala y vuelve a abrir este script.' }
    $secret = Read-Host 'Clave del hotspot (oculta)' -AsSecureString
    $port = [IO.Ports.SerialPort]::new('COM3',115200)
    $port.Encoding = [Text.Encoding]::UTF8
    $port.RtsEnable = $false; $port.DtrEnable = $false
    $port.Open()
    $bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        if ([Text.Encoding]::UTF8.GetByteCount($key) -lt 8 -or [Text.Encoding]::UTF8.GetByteCount($key) -gt 63) { throw 'Usa la clave WPA del hotspot (8 a 63 bytes).' }
        $port.Write("wifi --set --ssid $(Wifi-Arg $ssid) --password $(Wifi-Arg $key) --apply`r`n")
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        $key=$null; $secret.Dispose()
    }
    Save-State 'asociando'
    Write-Host 'Esperando la IP por USB...'
    $ip=$null
    for($i=0;$i -lt 24;$i++) {
        Start-Sleep -Seconds 2
        $null=$port.ReadExisting()
        $port.Write("wifi --status`r`n")
        Start-Sleep -Milliseconds 700
        $s=$port.ReadExisting()
        if ($s -match 'sta_connected=1' -and $s -match 'sta_ip=(\d+\.\d+\.\d+\.\d+)') {
            $ip=$Matches[1]; if ($ip -ne '0.0.0.0') { break }; $ip=$null
        }
    }
    if (-not $ip) { throw 'El ESP no obtuvo IP. Revisa la banda 2.4 GHz, el nombre y la clave.' }
    $port.Close()
    Save-State 'placa_en_hotspot' $ip
    $url='http://'+$ip+'/'
    $http=[Net.Http.HttpClientHandler]::new(); $http.UseProxy=$false; $http.AllowAutoRedirect=$false
    $client=[Net.Http.HttpClient]::new($http); $client.Timeout=[TimeSpan]::FromSeconds(6)
    try { $html=$client.GetStringAsync($url).GetAwaiter().GetResult() } finally {$client.Dispose()}
    if($html -notmatch '(?i)esp[- ]?claw|webim|web chat') { throw 'La IP responde, pero no se pudo identificar la consola del ESP.' }
    Save-State 'consola_verificada' $ip
    Write-Host ('Chat: '+$url+'  |  Selecciona Web Chat.')
    Start-Process $url
} catch {
    Write-Host ('No se pudo completar: '+$_.Exception.Message) -ForegroundColor Yellow
    if($ip){Write-Host ('IP informada por la placa: '+$ip)}
} finally {
    if($port){$port.Dispose()}
}
[void](Read-Host 'Pulsa Enter para cerrar esta ventana')
