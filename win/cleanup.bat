@echo off
rem Windows equivalent of ./cleanup.sh - removes rendered config files.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\config\scripts\win\run.ps1" cleanup %*
echo.
pause
