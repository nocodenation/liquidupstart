@echo off
rem Windows equivalent of ./down.sh - stops the running containers.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\config\scripts\win\run.ps1" down %*
echo.
pause
