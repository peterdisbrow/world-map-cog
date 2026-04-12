@echo off
REM Launch World Map in Chrome kiosk mode for the prayer table (2400x1350)
REM Starts the local sync server, waits for it to be ready, then opens Chrome.
REM Requires: Node.js 18+

set KIOSK_URL=http://localhost:3000
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set SCRIPT_DIR=%~dp0

REM ── Start the local server ─────────────────────────────────────────────────
echo Starting local kiosk server...
start "WorldMapServer" /min node "%SCRIPT_DIR%server.js"

REM Wait for server to be ready (poll up to 15 seconds)
echo Waiting for server to be ready...
set READY=0
for /l %%i in (1,1,30) do (
  if !READY!==0 (
    curl -s -o nul http://localhost:3000/api/sync-status >nul 2>&1
    if !errorlevel!==0 (
      set READY=1
      echo Server is ready.
    ) else (
      timeout /t 1 /nobreak >nul
    )
  )
)

REM ── Launch Chrome in kiosk mode ────────────────────────────────────────────
echo Launching Chrome kiosk at %KIOSK_URL%
start "" %CHROME% ^
  --kiosk ^
  --noerrdialogs ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --disable-translate ^
  --no-first-run ^
  --start-fullscreen ^
  --window-size=2400,1350 ^
  --window-position=0,0 ^
  --autoplay-policy=no-user-gesture-required ^
  --user-data-dir="%TEMP%\world-map-kiosk" ^
  %KIOSK_URL%

REM Note: the server process continues running in the background.
REM To stop it, close the "WorldMapServer" window or run: taskkill /f /im node.exe
