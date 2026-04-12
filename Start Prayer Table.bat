@echo off
title Prayer Table
cd /d "%~dp0"

:: ── Start the local server (skip if already running) ──────────────────
powershell -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:3030/api/health' -UseBasicParsing -TimeoutSec 2 >$null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    start "" /b node.exe server.js > server.log 2>&1
)

:: ── Wait for server ready ─────────────────────────────────────────────
:WAIT_LOOP
timeout /t 1 /nobreak >nul
powershell -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:3030/api/health' -UseBasicParsing -TimeoutSec 2 >$null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto WAIT_LOOP

:: ── Browser paths ─────────────────────────────────────────────────────
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set CHROME86="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set EDGE="%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set EDGE86="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

:: ── Launch browser in kiosk mode ──────────────────────────────────────
:LAUNCH_BROWSER
if exist %CHROME% (
    start "" %CHROME% --kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble --noerrdialogs --disable-pinch --overscroll-history-navigation=0 "--disable-features=TranslateUI,Translate" --disable-translate http://127.0.0.1:3030
) else if exist %CHROME86% (
    start "" %CHROME86% --kiosk --no-first-run --disable-infobars --disable-session-crashed-bubble --noerrdialogs --disable-pinch --overscroll-history-navigation=0 "--disable-features=TranslateUI,Translate" --disable-translate http://127.0.0.1:3030
) else if exist %EDGE% (
    start "" %EDGE% --kiosk http://127.0.0.1:3030 --edge-kiosk-type=fullscreen --no-first-run --disable-infobars --noerrdialogs --disable-pinch --overscroll-history-navigation=0
) else if exist %EDGE86% (
    start "" %EDGE86% --kiosk http://127.0.0.1:3030 --edge-kiosk-type=fullscreen --no-first-run --disable-infobars --noerrdialogs --disable-pinch --overscroll-history-navigation=0
) else (
    start http://127.0.0.1:3030
)

:: ── Watch loop: restart browser if it closes ─────────────────────────
:WATCH_LOOP
timeout /t 15 /nobreak >nul
powershell -Command "if (Get-Process -Name 'chrome','msedge' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 goto LAUNCH_BROWSER
goto WATCH_LOOP
