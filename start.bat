@echo off
rem Windows equivalent of ./start.sh - double-click or run from a terminal.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0config\scripts\win\run.ps1" start %*
echo.
pause
