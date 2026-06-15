<#
  Windows driver for the project's bash orchestration scripts.

  The .bat wrappers at the repo root (build.bat / start.bat / down.bat /
  cleanup.bat) call this with an action. It runs the matching UNCHANGED .sh
  script inside the "toolbox" helper container (see config/win/Dockerfile.toolbox),
  pointed at Docker Desktop's engine via the host Docker socket.

  The one trick that makes the bash scripts work untouched: Docker Desktop's
  engine sees Windows drives under /run/desktop/mnt/host/<drive>/...  We mount
  the project there AND run from there, so every relative bind mount in
  compose.yml and every absolute path the scripts derive resolves identically
  on the engine side. No script edits, no docker-in-docker.

  NOTE on error handling: we deliberately do NOT set $ErrorActionPreference =
  'Stop' globally. The docker CLI writes to stderr on perfectly normal outcomes
  (e.g. an image not existing yet), and under 'Stop' Windows PowerShell 5.1 turns
  any native stderr into a terminating NativeCommandError. We check $LASTEXITCODE
  explicitly instead, and put -ErrorAction Stop only on the cmdlets that need it.
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

# Repo root = three levels up from this script (config/scripts/win/run.ps1).
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..') -ErrorAction Stop).Path

# --- preflight: Docker Desktop running? ---------------------------------------
# 2>$null + no 'Stop' means a stopped daemon just yields a non-zero exit code
# rather than a thrown error.
& docker version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "Docker Desktop is not running (or not installed). Start Docker Desktop and try again."
}

# --- preflight: .env present (seed from .env.example on first run) ------------
# Seeded for every action (the container names below need APP_ID from it); the
# "review the values, then run again" stop only applies to non-run actions —
# the run (dashboard) action exists precisely to fill the values in.
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
# The creation timestamp of the .env. Stamped here when empty/missing so it is
# known before any container is named (run.sh applies the same logic on
# Linux/macOS and skips when already set).
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
  # WriteAllText writes UTF-8 without a BOM; Set-Content -Encoding UTF8 on
  # Windows PowerShell adds one, which would corrupt the first .env line.
  [System.IO.File]::WriteAllText($envFile, $content)
  Write-Host "Stamped APP_ID=$appId into .env." -ForegroundColor Yellow
}

# --- map the host project dir to the path Docker Desktop's engine sees --------
$drive = $root.Substring(0, 1).ToLower()
$tail = ($root.Substring(2) -replace '\\', '/')
$enginePath = "/run/desktop/mnt/host/$drive$tail"

# --- ensure the toolbox image exists (build it once) --------------------------
# `docker images -q` prints the image id (or nothing) and exits 0 either way, so
# it is a clean presence probe that never writes an error to stderr.
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
# run.sh's own browser-open (xdg-open/open) is a no-op here because it executes
# inside the toolbox container, so the host side must do the opening. A hidden
# watcher waits for the dashboard port to accept TCP connections (a raw socket,
# not Invoke-WebRequest — that one routes through IE/system proxy settings and
# can fail even for localhost) and then opens the URL. A fixed delay would not
# do, since the dashboard image build on a first run can take minutes. The
# watcher also exits as soon as this script's process is gone (Ctrl-C/window
# closed), so it never lingers.
$runnerName = "all-in-wonder-dashboard-runner-$appId"
$dashboardName = "all-in-wonder-dashboard-$appId"
if ($Action -eq 'run') {
  # run.sh scans for a free port (starting at 7777, or --port N) and writes
  # the one it settled on to .dashboard-port — the watcher reads it from
  # there, waits for the port to accept connections, and opens the browser.
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
  # Pass the args as one explicitly double-quoted string, NOT an array:
  # Start-Process -ArgumentList joins array elements with plain spaces and does
  # NOT quote elements that contain spaces, so a username/path with spaces
  # (e.g. "C:\Users\First Last\...", or the spaced %TEMP% under it) would split
  # -File / -PortFile mid-path and the hidden watcher would never start — the
  # browser would then never open. Quoting the two paths keeps them intact.
  $watcherArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$watcherFile`" -PortFile `"$portFile`" -ParentPid $PID"
  Start-Process powershell -WindowStyle Hidden -ArgumentList $watcherArgs

  # A previous Ctrl-C may have left the runner/dashboard containers behind
  # (killing the docker CLI does not stop a container) — clear them first.
  & docker rm -f $runnerName 2>$null | Out-Null
  & docker rm -f $dashboardName 2>$null | Out-Null
}

# Allocate a TTY only when we actually have an interactive console (so piped or
# scheduled runs don't fail with "the input device is not a TTY").
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

# The finally block runs even on Ctrl-C: that keystroke only kills the local
# docker CLI process, while the toolbox container (running run.sh) and the
# dashboard container it started would otherwise keep running server-side.
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
