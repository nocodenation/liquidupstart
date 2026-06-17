<#
  Windows driver for the project's bash orchestration scripts. The repo-root
  .bat wrappers call this with an action; it runs the matching UNCHANGED .sh
  inside the "toolbox" helper container against Docker Desktop's engine.

  Trick that keeps the bash scripts untouched: Docker Desktop's engine sees
  Windows drives under /run/desktop/mnt/host/<drive>/... We mount the project
  there AND run from there, so every path resolves identically engine-side.

  Error handling: we deliberately do NOT set $ErrorActionPreference = 'Stop'
  globally — the docker CLI writes to stderr on normal outcomes, which 'Stop'
  turns into a terminating error on PS 5.1. We check $LASTEXITCODE instead.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('run', 'build', 'start', 'down', 'cleanup')]
  [string]$Action,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest
)

function Fail($msg) {
  Write-Host ""
  Write-Host "ERROR: $msg" -ForegroundColor Red
  exit 1
}

# Repo root = three levels up from this script.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..') -ErrorAction Stop).Path

# --- preflight: Docker Desktop running? ---------------------------------------
# 2>$null + no 'Stop': a stopped daemon yields a non-zero exit code, not a throw.
& docker version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "Docker Desktop is not running (or not installed). Start Docker Desktop and try again."
}

# --- preflight: .env present (seed from .env.example on first run) ------------
# Seeded for every action (container names need APP_ID from it); the "review,
# then run again" stop only applies to non-run actions — the run action exists
# precisely to fill the values in.
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) {
  $envExample = Join-Path $root '.env.example'
  if (-not (Test-Path $envExample)) {
    Fail ".env not found and no .env.example to seed it from."
  }
  Copy-Item $envExample $envFile -ErrorAction Stop
  Write-Host "No .env found - created one from .env.example." -ForegroundColor Yellow
  if ($Action -ne 'run') {
    Write-Host "Run run.bat (project root) to fill in the values via the dashboard," -ForegroundColor Yellow
    Write-Host "or review .env by hand, then run this again." -ForegroundColor Yellow
    exit 0
  }
}

# --- APP_ID: installation id appended to every container name -----------------
# Stamped here (when empty/missing) before any container is named; run.sh applies
# the same logic on Linux/macOS and skips when already set.
$appId = ''
$idLine = Select-String -Path $envFile -Pattern '^APP_ID=(.*)$' | Select-Object -First 1
if ($idLine) { $appId = $idLine.Matches[0].Groups[1].Value.Trim().Trim('"') }
if (-not $appId) {
  $appId = Get-Date -Format 'yyyyMMddHHmmss'
  $content = Get-Content -Raw $envFile
  if ($content -match '(?m)^APP_ID=') {
    $content = $content -replace '(?m)^APP_ID=.*$', "APP_ID=$appId"
  } else {
    $content += "`nAPP_ID=$appId`n"
  }
  # WriteAllText avoids the BOM that Set-Content -Encoding UTF8 adds on Windows
  # PowerShell, which would corrupt the first .env line.
  [System.IO.File]::WriteAllText($envFile, $content)
  Write-Host "Stamped APP_ID=$appId into .env." -ForegroundColor Yellow
}

# --- map the host project dir to the path Docker Desktop's engine sees --------
$drive = $root.Substring(0, 1).ToLower()
$tail = ($root.Substring(2) -replace '\\', '/')
$enginePath = "/run/desktop/mnt/host/$drive$tail"

# --- ensure the toolbox image exists (build it once) --------------------------
# `docker images -q` exits 0 either way — a clean presence probe with no stderr.
$toolbox = 'all-in-wonder/toolbox:latest'
$imageId = (& docker images -q $toolbox 2>$null)
if ([string]::IsNullOrWhiteSpace($imageId)) {
  Write-Host "Building helper toolbox image ($toolbox) - one time only..." -ForegroundColor Cyan
  & docker build -t $toolbox -f (Join-Path $root 'config\win\Dockerfile.toolbox') (Join-Path $root 'config\win')
  if ($LASTEXITCODE -ne 0) { Fail "Failed to build the toolbox image." }
}

# --- action -> script ---------------------------------------------------------
$script = switch ($Action) {
  'run'     { './run.sh' }
  'build'   { './scripts/linux/build.sh' }
  'start'   { './scripts/linux/start.sh' }
  'down'    { './scripts/linux/down.sh' }
  'cleanup' { './scripts/linux/cleanup.sh' }
}

# --- 'run' action: open the dashboard in the default browser once it is up ---
# run.sh's own browser-open is a no-op (it runs inside the container), so the
# host opens it. A hidden watcher waits on a raw TCP socket (not
# Invoke-WebRequest, which routes through IE/system proxy and can fail for
# localhost) — a fixed delay won't do since a first build can take minutes — and
# exits once this script's process is gone so it never lingers.
$runnerName = "all-in-wonder-dashboard-runner-$appId"
$dashboardName = "all-in-wonder-dashboard-$appId"
if ($Action -eq 'run') {
  # run.sh writes the free port it settled on to .dashboard-port; the watcher
  # reads it, waits for the port, and opens the browser.
  $portFile = Join-Path $root '.dashboard-port'
  Remove-Item $portFile -ErrorAction SilentlyContinue
  $watcherFile = Join-Path $env:TEMP 'aiw-open-dashboard.ps1'
  @'
param([string]$PortFile, [int]$ParentPid)
$deadline = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $deadline) {
  if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }
  if (Test-Path $PortFile) {
    $port = (Get-Content $PortFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($port -match '^\d+$') {
      $client = New-Object System.Net.Sockets.TcpClient
      try {
        $client.Connect('127.0.0.1', [int]$port)
        if ($client.Connected) {
          Start-Sleep -Seconds 1
          Start-Process "http://localhost:$port/"
          exit
        }
      } catch { } finally { $client.Dispose() }
    }
  }
  Start-Sleep -Seconds 2
}
'@ | Set-Content -Path $watcherFile -Encoding ASCII
  # One explicitly double-quoted string, NOT an array: Start-Process -ArgumentList
  # joins array elements with plain spaces without quoting, so a path with spaces
  # would split mid-path and the watcher would never start. Quoting keeps paths
  # intact.
  $watcherArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$watcherFile`" -PortFile `"$portFile`" -ParentPid $PID"
  Start-Process powershell -WindowStyle Hidden -ArgumentList $watcherArgs

  # A previous Ctrl-C may have left the containers behind (killing the docker CLI
  # does not stop a container) — clear them first.
  & docker rm -f $runnerName 2>$null | Out-Null
  & docker rm -f $dashboardName 2>$null | Out-Null
}

# Allocate a TTY only with an interactive console, else piped/scheduled runs
# fail with "the input device is not a TTY".
$tty = @()
if (-not [Console]::IsInputRedirected) { $tty = @('-i', '-t') }

# --- run the unchanged .sh inside the toolbox against the host engine ---------
$named = @()
if ($Action -eq 'run') { $named = @('--name', $runnerName) }
$dockerArgs = @('run', '--rm') + $named + $tty + @(
  '-v', '/var/run/docker.sock:/var/run/docker.sock',
  '-v', "${root}:${enginePath}",
  '-w', $enginePath,
  $toolbox,
  'bash', $script
) + $Rest

# finally runs even on Ctrl-C, which only kills the local docker CLI — the
# toolbox and dashboard containers would otherwise keep running server-side.
try {
  & docker @dockerArgs
  $code = $LASTEXITCODE
} finally {
  if ($Action -eq 'run') {
    & docker rm -f $runnerName 2>$null | Out-Null
    & docker rm -f $dashboardName 2>$null | Out-Null
  }
}
exit $code
