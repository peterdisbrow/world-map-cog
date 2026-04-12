@echo off
REM One-click launcher for the local World Map kiosk on Windows.
REM Starts the local Node server if needed, waits for readiness, then opens kiosk mode.

setlocal
cd /d "%~dp0"

set URL=http://127.0.0.1:3030
set HEALTH_URL=%URL%/api/health
set SERVER_LOG=%~dp0local-data\server.log

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

if not exist local-data mkdir local-data

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if errorlevel 1 (
  echo Starting local server...
  start "World Map Local Server" /MIN cmd /c "cd /d ""%~dp0"" && call ""%~dp0start-local-server.bat"""
) else (
  echo Local server already running.
)

echo Waiting for local server...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ready = $false; for ($i = 0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {} Start-Sleep -Seconds 1 }; if ($ready) { exit 0 } else { exit 1 }"

if errorlevel 1 (
  echo The local server did not become ready.
  echo Check local-data\server.log for details.
  pause
  exit /b 1
)

call "%~dp0launch-kiosk-local.bat"
endlocal
