# OpenCode Studio - Local Launcher
# Double-click Start-OpenCode-Studio.bat to run this script

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "OpenCode Studio"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   OpenCode Studio - Local Mode" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# --- Check Node.js ---
# PATH in this shell may be stale (inherited from explorer.exe before Node was
# installed), so fall back to probing well-known install locations — including
# the portable dir our own installer uses — and fix up the session PATH.
$nodeVersion = $null
try { $nodeVersion = node -v 2>$null } catch {}
if (-not $nodeVersion) {
    $nodeCandidates = @(
        "$env:LOCALAPPDATA\opencode-studio\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\nvm4w\nodejs\node.exe",
        "$env:APPDATA\nvm\current\node.exe",
        "$env:USERPROFILE\scoop\apps\nodejs\current\node.exe"
    )
    foreach ($candidate in $nodeCandidates) {
        if (Test-Path $candidate) {
            $env:PATH = (Split-Path $candidate) + ";$env:PATH"
            try { $nodeVersion = node -v 2>$null } catch {}
            if ($nodeVersion) { break }
        }
    }
}
if ($nodeVersion) {
    Write-Host "[OK] Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "ERROR: Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/"
    Write-Host "(or run Install-OpenCode-Studio-Windows.vbs to install it automatically)"
    Read-Host "Press Enter to exit"
    exit 1
}

# --- Cleanup stale server lock ---
$lockPath = Join-Path $env:USERPROFILE ".config\opencode-studio\server.lock.json"
if (Test-Path $lockPath) {
    try {
        $lockData = Get-Content $lockPath -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($lockData.pid) {
            try {
                $proc = Get-Process -Id $lockData.pid -ErrorAction Stop
                Write-Host "Stopping stale server (PID $($lockData.pid))..." -ForegroundColor Yellow
                Stop-Process -Id $lockData.pid -Force
                Start-Sleep -Seconds 1
            } catch {
                # Process already gone
            }
        }
        Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
    } catch {
        Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
    }
}

# --- Install dependencies if needed ---
$needsInstall = $false
if (-not (Test-Path "node_modules")) { $needsInstall = $true; Write-Host "[!] Root dependencies missing" -ForegroundColor Yellow }
if (-not (Test-Path "server\node_modules")) { $needsInstall = $true; Write-Host "[!] Server dependencies missing" -ForegroundColor Yellow }
if (-not (Test-Path "client-next\node_modules")) { $needsInstall = $true; Write-Host "[!] Client dependencies missing" -ForegroundColor Yellow }

if ($needsInstall) {
    Write-Host ""
    Write-Host "Installing dependencies... This may take a minute or two." -ForegroundColor Cyan
    Write-Host ""
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Installation failed." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "[OK] Dependencies installed!" -ForegroundColor Green
} else {
    Write-Host "[OK] All dependencies are already installed." -ForegroundColor Green
}

# --- Start servers ---
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Starting OpenCode Studio..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend API : http://localhost:1920"
Write-Host "Frontend UI: http://localhost:1080"
Write-Host ""
Write-Host "The browser will open automatically when ready."
Write-Host "Keep this window open. Press any key to stop."
Write-Host ""

# Start servers in a minimized window so logs are visible but this script can continue
# We use cmd /c so npm (a .cmd) works correctly
$serverProc = Start-Process -FilePath "cmd" -ArgumentList "/c", "npm", "start" -WorkingDirectory (Get-Location) -WindowStyle Minimized -PassThru

# Wait for startup
Start-Sleep -Seconds 8

# --- Poll for frontend readiness ---
Write-Host ""
Write-Host "Waiting for the frontend to be ready..." -ForegroundColor Cyan
$frontendUrl = "http://localhost:1080"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ($ready) {
    Write-Host "[OK] Frontend is ready!" -ForegroundColor Green
    Write-Host "Opening browser..." -ForegroundColor Cyan
    Start-Process $frontendUrl
} else {
    Write-Host "WARNING: Frontend didn't respond in time." -ForegroundColor Yellow
    Write-Host "Please open $frontendUrl manually in your browser."
}

# --- Wait for user to stop ---
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Servers are running." -ForegroundColor Cyan
Write-Host " Press any key to stop everything." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# --- Cleanup ---
Write-Host ""
Write-Host "Stopping servers..." -ForegroundColor Yellow

if ($serverProc -and -not $serverProc.HasExited) {
    # /T kills the entire process tree (concurrently -> node)
    $cmd = "taskkill /F /T /PID $($serverProc.Id)"
    cmd /c $cmd | Out-Null
}

# Also nuke any lingering opencode-studio related node processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdLine = try { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine } catch { "" }
    if ($cmdLine -like "*opencode-studio*" -or $cmdLine -like "*\server\index.js*" -or $cmdLine -like "*dev-with-port.js*") {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

# Clean lock file just in case
if (Test-Path $lockPath) {
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}

Write-Host "OpenCode Studio has stopped." -ForegroundColor Green
Start-Sleep -Seconds 2
