@echo off
title Prayer Table
cd /d "%~dp0"

echo [%date% %time%] ===== Start Prayer Table.bat launched ===== >> "%~dp0debug.log"

:: ── Sanity check: node.exe and node_modules must be present in this folder ──
if not exist "node.exe" (
    echo [%date% %time%] ERROR: node.exe not found >> "%~dp0debug.log"
    echo.
    echo  ERROR: node.exe not found.
    echo  Re-download world-map-kiosk-portable.zip from the GitHub release page
    echo  and unzip it again — the zip includes node.exe and node_modules.
    echo.
    pause
    exit /b 1
)
echo [%date% %time%] node.exe found OK >> "%~dp0debug.log"

:SETUP_DONE

:: ── Clear Chrome cache (so updates appear immediately) ────────────────
set CHROME_CACHE=%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache
set CHROME_CODE=%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache
if exist "%CHROME_CACHE%"    rd /s /q "%CHROME_CACHE%"    >nul 2>&1
if exist "%CHROME_CODE%"     rd /s /q "%CHROME_CODE%"     >nul 2>&1

:: ── Start the local server with restart-after-update loop ─────────────
:: Use curl (built into Windows 10+) — far faster than spawning powershell.exe
curl -s -f -m 3 http://127.0.0.1:3030/api/health >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] Server not running — launching server-restart-loop.bat >> "%~dp0debug.log"
    start "Prayer Table Server" /min cmd /c ""%~dp0server-restart-loop.bat""
    echo [%date% %time%] start command issued >> "%~dp0debug.log"
) else (
    echo [%date% %time%] Server already running — skipping launch >> "%~dp0debug.log"
)

:: ── Wait for server ready ─────────────────────────────────────────────
echo [%date% %time%] Waiting for server to become ready... >> "%~dp0debug.log"
:WAIT_LOOP
timeout /t 2 /nobreak >nul
curl -s -f -m 3 http://127.0.0.1:3030/api/health >nul 2>&1
if errorlevel 1 goto WAIT_LOOP

echo [%date% %time%] Server is ready — launching browser >> "%~dp0debug.log"

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
