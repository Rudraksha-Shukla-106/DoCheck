@echo off
REM Double-click this file to launch DocCheck. It builds the site,
REM opens it in your browser, and serves it. Close this window to stop.
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
  echo.
  echo BUILD FAILED - see the error above.
  pause
  exit /b 1
)
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 12; Start-Process 'http://localhost:4322/'"
call npm run preview -- --port 4322 --host 127.0.0.1
pause
