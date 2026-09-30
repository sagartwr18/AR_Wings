Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Starting Secure Public QR Tunnel...    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Connecting port 8000 to localtunnel..." -ForegroundColor Yellow

$tunnelFile = "$PSScriptRoot\backend\tunnel.txt"
if (Test-Path $tunnelFile) { Remove-Item $tunnelFile -Force }

# Start localtunnel process
$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx localtunnel --port 8000" -PassThru -NoNewWindow -RedirectStandardOutput "$PSScriptRoot\backend\tunnel_output.log"

$timeout = 20
$foundUrl = $null

for ($i = 0; $i -lt $timeout; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path "$PSScriptRoot\backend\tunnel_output.log") {
        $log = Get-Content "$PSScriptRoot\backend\tunnel_output.log" -Raw
        if ($log -match "(https://[a-zA-Z0-9\.\-]+\.loca\.lt)") {
            $foundUrl = $matches[1]
            Set-Content -Path $tunnelFile -Value $foundUrl
            Write-Host "`n[SUCCESS] Public Mobile Claim URL Active:" -ForegroundColor Green
            Write-Host ">> $foundUrl <<" -ForegroundColor Magenta
            Write-Host "`nAny phone on 4G/5G or Wi-Fi can now scan the QR code and open the claim page instantly!" -ForegroundColor Green
            break
        }
    }
}

if (-not $foundUrl) {
    Write-Host "[WARN] Tunnel starting in background. Check backend/tunnel_output.log" -ForegroundColor Yellow
}

# Keep process alive
Wait-Process -Id $process.Id
