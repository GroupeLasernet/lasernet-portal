# bootstrap-station.ps1
# One-shot setup for an Atelier DSM station PC (robot + laser).
# Safe to rerun — idempotent.
#
# Usage (on a fresh PC, as Administrator):
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   iwr https://raw.githubusercontent.com/GroupeLasernet/lasernet-portal/main/scripts/bootstrap-station.ps1 -OutFile bootstrap.ps1
#   .\bootstrap.ps1
#
# Prerequisites (must already be installed):
#   - Python 3.11+  (from python.org, "Add to PATH" checked)
#   - Git for Windows
#   - An SSH deploy key already added to the robot PC (C:\Users\<user>\.ssh\github_deploy)
#     and ~/.ssh/config set up with Host github.com entry.
#
# What this script does:
#   1. Clones (or pulls) Prisma with sparse-checkout for services/robot + services/relfar only
#   2. Installs Python dependencies for both services
#   3. Downloads and installs NSSM (service wrapper)
#   4. Prompts for Robot Serial + Portal URL, writes .env files
#   5. Registers ElfinRobot and RelfarBridge as auto-start Windows services
#   6. Starts both services
#   7. Prints the station's IP so the user can browse to the UI

param(
    [string]$PrismaPath = "C:\Prisma",
    [string]$GitHubRepo = "git@github.com:GroupeLasernet/lasernet-portal.git",
    [string]$PortalUrl = "",
    [string]$RobotSerial = "",
    [switch]$SkipConfig = $false
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# 0. Admin check
# ---------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Right-click PowerShell and 'Run as administrator'."
    exit 1
}

Write-Host "=== Atelier DSM Station Bootstrap ===" -ForegroundColor Magenta

# ---------------------------------------------------------------------------
# 1. Prereq checks
# ---------------------------------------------------------------------------
Write-Step "Checking prerequisites"
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python not found on PATH. Install Python 3.11+ from python.org first."
    exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git not found on PATH. Install Git for Windows first."
    exit 1
}
python --version
git --version

# ---------------------------------------------------------------------------
# 2. Clone or pull the repo with sparse-checkout
# ---------------------------------------------------------------------------
Write-Step "Cloning / updating Prisma repo"
if (Test-Path "$PrismaPath\.git") {
    Set-Location $PrismaPath
    git pull --ff-only
} else {
    if (Test-Path $PrismaPath) {
        Write-Error "$PrismaPath exists but is not a git repo. Move or delete it, then rerun."
        exit 1
    }
    git clone --filter=blob:none --no-checkout $GitHubRepo $PrismaPath
    Set-Location $PrismaPath
    git sparse-checkout init --cone
    git sparse-checkout set services/robot services/relfar scripts
    git checkout main
}

# ---------------------------------------------------------------------------
# 3. Install Python dependencies
# ---------------------------------------------------------------------------
Write-Step "Installing Python dependencies"
pip install --upgrade pip | Out-Null
pip install -q -r "$PrismaPath\services\robot\requirements.txt"
pip install -q -r "$PrismaPath\services\relfar\requirements.txt"
pip install -q httpx  # belt-and-braces: sync worker needs it

# ---------------------------------------------------------------------------
# 4. Install NSSM (service wrapper)
# ---------------------------------------------------------------------------
Write-Step "Installing NSSM service wrapper"
$nssmPath = "C:\Windows\System32\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    # Primary source (official, often flaky)
    $primary = "https://nssm.cc/release/nssm-2.24.zip"
    # Fallback mirror on GitHub
    $fallback = "https://github.com/kirillmurashov/win-nssm/raw/master/nssm-2.24/win64/nssm.exe"
    try {
        Invoke-WebRequest -Uri $primary -OutFile "$env:TEMP\nssm.zip" -TimeoutSec 15
        Expand-Archive -Path "$env:TEMP\nssm.zip" -DestinationPath "$env:TEMP\nssm" -Force
        Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $nssmPath
    } catch {
        Write-Host "nssm.cc unreachable, falling back to GitHub mirror..."
        Invoke-WebRequest -Uri $fallback -OutFile $nssmPath
    }
}
& $nssmPath version

# ---------------------------------------------------------------------------
# 5. Gather config (serial + portal URL)
# ---------------------------------------------------------------------------
if (-not $SkipConfig) {
    Write-Step "Station configuration"
    if (-not $RobotSerial) {
        $RobotSerial = Read-Host "Robot serial number (leave blank to skip)"
    }
    if (-not $PortalUrl) {
        $PortalUrl = Read-Host "Portal URL (e.g. https://portal.atelierdsm.com) [blank = offline-only]"
    }
    $licSecret = Read-Host "ROBOT_LICENSE_SECRET (blank = leave unset for now)"

    $envLines = @(
        "ROBOT_SERIAL=$RobotSerial",
        "PORTAL_URL=$PortalUrl",
        "ROBOT_LICENSE_SECRET=$licSecret",
        "DEV_SKIP_LICENSE=true",       # turn off once portal licensing is fully online
        "SYNC_ENABLED=true",
        "LICENSE_STRICT=false"
    )
    $envBody = $envLines -join "`r`n"

    Set-Content -Path "$PrismaPath\services\robot\.env" -Value $envBody -Encoding UTF8
    Set-Content -Path "$PrismaPath\services\relfar\.env" -Value $envBody -Encoding UTF8
    Write-Host ".env files written."
}

# ---------------------------------------------------------------------------
# 6. Register Windows services
# ---------------------------------------------------------------------------
Write-Step "Registering Windows services"
$pythonExe = (Get-Command python).Source

function Install-NssmService {
    param($Name, $Dir, $Script, $Display, $Desc)

    # Remove existing if present so we can reconfigure cleanly
    if (Get-Service $Name -ErrorAction SilentlyContinue) {
        Write-Host "Removing existing service $Name..."
        & $nssmPath stop $Name 2>$null | Out-Null
        & $nssmPath remove $Name confirm | Out-Null
    }

    New-Item -ItemType Directory -Force -Path "$Dir\logs" | Out-Null

    & $nssmPath install $Name $pythonExe $Script | Out-Null
    & $nssmPath set $Name AppDirectory $Dir | Out-Null
    & $nssmPath set $Name DisplayName $Display | Out-Null
    & $nssmPath set $Name Description $Desc | Out-Null
    & $nssmPath set $Name Start SERVICE_AUTO_START | Out-Null
    & $nssmPath set $Name AppStdout "$Dir\logs\stdout.log" | Out-Null
    & $nssmPath set $Name AppStderr "$Dir\logs\stderr.log" | Out-Null
    & $nssmPath set $Name AppRotateFiles 1 | Out-Null
    & $nssmPath set $Name AppRotateBytes 10485760 | Out-Null  # 10 MB
    Write-Host "  -> $Name registered"
}

Install-NssmService `
    -Name "ElfinRobot" `
    -Dir "$PrismaPath\services\robot" `
    -Script "run.py" `
    -Display "Atelier DSM - Elfin Robot" `
    -Desc "Cobot controller + Portal sync"

Install-NssmService `
    -Name "RelfarBridge" `
    -Dir "$PrismaPath\services\relfar" `
    -Script "relfar_server.py" `
    -Display "Atelier DSM - Relfar Bridge" `
    -Desc "Laser bridge + Portal sync"

# ---------------------------------------------------------------------------
# 7. Start services
# ---------------------------------------------------------------------------
Write-Step "Starting services"
& $nssmPath start ElfinRobot
Start-Sleep -Seconds 2
& $nssmPath start RelfarBridge

Get-Service ElfinRobot, RelfarBridge | Select-Object Name, Status, StartType | Format-Table

# ---------------------------------------------------------------------------
# 8. Final report
# ---------------------------------------------------------------------------
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch "^127\." -and $_.IPAddress -notmatch "^169\." } |
    Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "=== Setup complete ===" -ForegroundColor Green
Write-Host ("Station IP : {0}" -f $ip)
Write-Host ("Robot UI   : http://{0}:8080" -f $ip)
Write-Host ("Relfar     : http://{0}:5000" -f $ip)
Write-Host "Services   : ElfinRobot, RelfarBridge (auto-start on boot)"
Write-Host "Logs       : $PrismaPath\services\{robot,relfar}\logs\"
Write-Host ""
Write-Host "To redeploy after a code change, run on dev PC:"
Write-Host "  scripts\deploy-robot.bat"
