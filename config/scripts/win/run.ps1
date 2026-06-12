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
# The run (setup UI) action handles seeding itself (run.sh) and must keep
# going, so the "review the values, then run again" stop applies to other
# actions.
$envFile = Join-Path $root '.env'
if (($Action -ne 'run') -and (-not (Test-Path $envFile))) {
  $envExample = Join-Path $root '.env.example'
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile -ErrorAction Stop
    Write-Host "No .env found - created one from .env.example." -ForegroundColor Yellow
    Write-Host "Run run.bat (project root) to fill in the values via the dashboard," -ForegroundColor Yellow
    Write-Host "or review .env by hand, then run this again." -ForegroundColor Yellow
    exit 0
  }
  Fail ".env not found and no .env.example to seed it from."
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
# watcher polls the URL and opens it on the first response — a fixed delay
# would not do, since the dashboard image build on a first run can take minutes.
if ($Action -eq 'run') {
  $port = 8808
  if ($Rest) {
    for ($i = 0; $i -lt $Rest.Count - 1; $i++) {
      if ($Rest[$i] -eq '--port') { $port = $Rest[$i + 1] }
    }
  }
  $watch = "`$d = (Get-Date).AddMinutes(15); while ((Get-Date) -lt `$d) { " +
    "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:$port/' -TimeoutSec 2 | Out-Null; " +
    "Start-Process 'http://localhost:$port/'; break } catch { Start-Sleep -Seconds 2 } }"
  Start-Process powershell -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $watch
  )
}

# Allocate a TTY only when we actually have an interactive console (so piped or
# scheduled runs don't fail with "the input device is not a TTY").
$tty = @()
if (-not [Console]::IsInputRedirected) { $tty = @('-i', '-t') }

# --- run the unchanged .sh inside the toolbox against the host engine ---------
$dockerArgs = @('run', '--rm') + $tty + @(
  '-v', '/var/run/docker.sock:/var/run/docker.sock',
  '-v', "${root}:${enginePath}",
  '-w', $enginePath,
  $toolbox,
  'bash', $script
) + $Rest

& docker @dockerArgs
exit $LASTEXITCODE
