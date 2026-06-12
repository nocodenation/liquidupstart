@echo off
rem Windows equivalent of ./scripts/linux/start.sh - double-click or run from a terminal.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\config\scripts\win\run.ps1" start %*
echo.
echo %cmdcmdline% | findstr /i /c:"%~nx0" >nul && cmd /k
