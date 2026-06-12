@echo off
rem Windows equivalent of ./run.sh - double-click or run from a terminal.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0config\scripts\win\run.ps1" run %*
echo.
echo %cmdcmdline% | findstr /i /c:"%~nx0" >nul && cmd /k
