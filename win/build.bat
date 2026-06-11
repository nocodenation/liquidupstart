sta@echo off
rem Windows equivalent of ./build.sh - double-click or run from a terminal.
rem Forwards any flags (e.g. --no-cache) to the build.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\config\scripts\win\run.ps1" build %*
echo.
pause
