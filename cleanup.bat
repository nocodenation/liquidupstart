@echo off
rem Windows equivalent of ./cleanup.sh - full teardown: stops containers, removes
rem rendered config, volumes/, .env, all project/base images and build cache.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0config\scripts\win\run.ps1" wipe %*

rem The wipe runs inside the toolbox container, so it can't remove its own image.
rem Now that the toolbox container has exited (--rm), remove it from the host and
rem clear any leftover build cache.
echo Removing toolbox image and build cache...
docker rmi --force all-in-wonder/toolbox:latest 2>nul
docker builder prune --force 2>nul

echo.
pause
