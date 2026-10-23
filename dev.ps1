# dev.ps1: jalankan seluruh stack Raqio dari satu terminal.
#   .\dev.ps1            semua: Postgres+Redis (docker), Go API (docker), worker Python, Next.js
#   .\dev.ps1 -NoWeb     tanpa frontend
#   .\dev.ps1 -NoWorker  tanpa worker
# Worker membaca OPENROUTER_API_KEY dari services\scraper\.env (asisten chat).
# Ctrl+C mematikan worker dan frontend. Container docker dibiarkan hidup (murah, cepat untuk start berikutnya);
# matikan dengan: docker stop raqio-api-dev deploy-postgres-1 deploy-redis-1
param([switch]$NoWeb, [switch]$NoWorker, [switch]$StopDocker)

# PowerShell 5.1: stderr perintah native jangan dianggap error fatal; cek $LASTEXITCODE manual
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force "$root\.dev-logs" | Out-Null

function Say($tag, $msg, $color = "Cyan") { Write-Host ("[{0}] {1}" -f $tag, $msg) -ForegroundColor $color }

# --- 1. Postgres + Redis ---
Say infra "docker compose up (Postgres :5433, Redis :6379)"
cmd /c "docker compose -f deploy/compose.dev.yml up -d >nul 2>&1"
if ($LASTEXITCODE -ne 0) { throw "docker compose gagal (Docker Desktop jalan?)" }
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    cmd /c "docker exec deploy-postgres-1 pg_isready -U raqio -d raqio >nul 2>&1"
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    Start-Sleep 1
}
if (-not $ok) { throw "Postgres tidak siap" }

# --- 2. Go API (container, karena Go tidak terpasang lokal) ---
$apiEnv = "$root\apps\api\.env"
if (-not (Test-Path $apiEnv)) { throw "apps\api\.env belum ada. copy .env.example lalu isi AUTH_SECRET" }
$secret = (Get-Content $apiEnv | Where-Object { $_ -match '^AUTH_SECRET=' }) -replace '^AUTH_SECRET=', '' -replace '"', ''
if ($secret.Length -lt 16) { throw "AUTH_SECRET di apps\api\.env minimal 16 karakter" }

$exists = docker ps -a --format '{{.Names}}' | Select-String -Quiet '^raqio-api-dev$'
if ($exists) {
    Say api "docker restart raqio-api-dev (ambil kode terbaru)"
    cmd /c "docker restart raqio-api-dev >nul 2>&1"
} else {
    Say api "membuat container raqio-api-dev (go run, pertama kali agak lama)"
    $src = (Resolve-Path "$root\apps\api").Path
    docker run -d --name raqio-api-dev --add-host=host.docker.internal:host-gateway -p 8080:8080 `
        -v "${src}:/src" -v raqio-gocache:/go -w /src `
        -e PORT=8080 -e "DATABASE_URL=postgres://raqio:raqio@host.docker.internal:5433/raqio?sslmode=disable" `
        -e "AUTH_SECRET=$secret" -e ALLOW_INSECURE_WEBHOOK=1 -e DOCS=1 `
        golang:1.25-alpine go run . 2>$null | Out-Null
}
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    try { $r = Invoke-RestMethod -Uri http://localhost:8080/readyz -TimeoutSec 2; if ($r.status -eq "ready") { $ok = $true; break } } catch {}
    Start-Sleep 2
}
if (-not $ok) { docker logs --tail 20 raqio-api-dev; throw "API tidak siap, lihat log di atas" }
Say api "siap di http://localhost:8080 (readyz ok)" Green

# --- 3. worker + 4. web sebagai proses latar, log ke file lalu di-tail di sini ---
$procs = @()
$logs = @{}
$py = if (Test-Path "$root\.venv\Scripts\python.exe") { "$root\.venv\Scripts\python.exe" } else { "python" }

if (-not $NoWorker) {
    $env:DATABASE_URL = "postgres://raqio:raqio@127.0.0.1:5433/raqio"
    $env:PYTHONUNBUFFERED = "1"
    $env:APP_URL = "http://localhost:3000"
    $env:MARKET_CACHE_DAYS = "7"
    $env:AUTH_SECRET = $secret   # token berhenti berlangganan kampanye harus sama dengan API
    $p = Start-Process -FilePath $py -ArgumentList "worker.py" -WorkingDirectory "$root\services\scraper" -NoNewWindow -PassThru `
        -RedirectStandardOutput "$root\.dev-logs\worker.out" -RedirectStandardError "$root\.dev-logs\worker.err"
    $procs += $p; $logs["worker"] = "$root\.dev-logs\worker.out"; $logs["worker!"] = "$root\.dev-logs\worker.err"
    Say worker "pid $($p.Id)"
}
if (-not $NoWeb) {
    $busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($busy) { throw "port 3000 sudah dipakai (pid $($busy.OwningProcess)). Matikan dulu: taskkill /PID $($busy.OwningProcess) /T /F" }
    $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "$root\apps\web" -NoNewWindow -PassThru `
        -RedirectStandardOutput "$root\.dev-logs\web.out" -RedirectStandardError "$root\.dev-logs\web.err"
    $procs += $p; $logs["web"] = "$root\.dev-logs\web.out"; $logs["web!"] = "$root\.dev-logs\web.err"
    Say web "pid $($p.Id), http://localhost:3000"
}

Say dev "semua jalan. Buka http://localhost:3000 (klik 'Coba tanpa daftar'). Ctrl+C untuk berhenti." Green

# tail gabungan: baca bagian baru tiap file, cetak dengan prefix
$pos = @{}
foreach ($k in $logs.Keys) { $pos[$k] = 0 }
try {
    while ($true) {
        foreach ($k in $logs.Keys) {
            $f = $logs[$k]
            if (-not (Test-Path $f)) { continue }
            $len = (Get-Item $f).Length
            if ($len -gt $pos[$k]) {
                $fs = [IO.File]::Open($f, 'Open', 'Read', 'ReadWrite')
                $fs.Seek($pos[$k], 'Begin') | Out-Null
                $sr = New-Object IO.StreamReader($fs)
                $chunk = $sr.ReadToEnd(); $sr.Close(); $fs.Close()
                $pos[$k] = $len
                $color = if ($k.EndsWith("!")) { "Yellow" } elseif ($k -eq "web") { "Magenta" } else { "Gray" }
                foreach ($line in ($chunk -split "`r?`n")) { if ($line.Trim()) { Write-Host ("[{0}] {1}" -f $k.TrimEnd("!"), $line) -ForegroundColor $color } }
            }
        }
        foreach ($p in $procs) { if ($p.HasExited) { Say dev "proses $($p.Id) berhenti (exit $($p.ExitCode))" Red } }
        Start-Sleep -Milliseconds 400
    }
}
finally {
    Say dev "menghentikan worker dan frontend"
    foreach ($p in $procs) { if (-not $p.HasExited) { taskkill /PID $p.Id /T /F 2>&1 | Out-Null } }
    if ($StopDocker) { docker stop raqio-api-dev deploy-postgres-1 deploy-redis-1 | Out-Null; Say dev "docker dimatikan" }
    else { Say dev "container docker dibiarkan hidup (API, Postgres, Redis). -StopDocker untuk ikut mematikan." }
}
