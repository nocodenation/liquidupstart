@echo off
rem Windows equivalent of ./cleanup.sh - full teardown: stops containers, removes
rem rendered config, volumes/, .env, all project/base images and build cache.
rem Pass --keep-images to keep images and build cache.
set "KEEP_IMAGES="
for %%A in (%*) do (
  if /I "%%~A"=="--keep-images" set "KEEP_IMAGES=1"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0config\scripts\win\run.ps1" wipe %*

if defined KEEP_IMAGES (
  echo Keeping toolbox image and build cache (--keep-images).
) else (
  rem The wipe runs inside the toolbox container, so it can't remove its own image.
  rem Now that the toolbox container has exited (--rm), remove it from the host and
  rem clear any leftover build cache.
  echo Removing toolbox image and build cache...
  docker rmi --force all-in-wonder/toolbox:latest 2>nul
  docker builder prune --force 2>nul
)

echo.
pause
