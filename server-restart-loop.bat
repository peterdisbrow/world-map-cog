@echo off
:: Internal helper — called by "Start Prayer Table.bat" to run the server
:: with an auto-restart loop. Exit code 100 = server updated itself and
:: wants to restart immediately (before the nightly reboot at 3am).
::
:: Crash-loop protection: if the server crashes (non-100 exit) more than
:: 5 times within 10 minutes, wait 60 seconds before retrying.
cd /d "%~dp0"
echo [%date% %time%] ===== server-restart-loop.bat started, dir=%cd% ===== >> "%~dp0debug.log"

:: Crash tracking — we store up to 5 timestamps (as seconds since midnight)
set CRASH_COUNT=0
set CRASH_WINDOW_SEC=600
set CRASH_MAX=5
set CRASH_COOLDOWN=60

:loop
:: Log rotation: if server.log or debug.log exceed ~5MB, rotate
call :rotate_log "%~dp0server.log"
call :rotate_log "%~dp0debug.log"

echo [%date% %time%] Launching node.exe server.js >> "%~dp0debug.log"
node.exe server.js >> server.log 2>&1
set NODE_EXIT=%errorlevel%
echo [%date% %time%] node.exe exited with errorlevel %NODE_EXIT% >> "%~dp0debug.log"

if %NODE_EXIT% == 100 (
  echo [%date% %time%] Restarting server after auto-update... >> "%~dp0debug.log"
  echo [%date% %time%] Restarting server after auto-update... >> server.log
  set CRASH_COUNT=0
  goto loop
)

:: Non-update exit — count as a crash
set /a CRASH_COUNT+=1
echo [%date% %time%] CRASH #%CRASH_COUNT% (exit code %NODE_EXIT%) >> "%~dp0debug.log"
echo [%date% %time%] CRASH #%CRASH_COUNT% (exit code %NODE_EXIT%) >> server.log

if %CRASH_COUNT% GEQ %CRASH_MAX% (
  echo [%date% %time%] Too many crashes (%CRASH_COUNT% in rapid succession). Cooling down %CRASH_COOLDOWN%s... >> "%~dp0debug.log"
  echo [%date% %time%] Too many crashes (%CRASH_COUNT% in rapid succession). Cooling down %CRASH_COOLDOWN%s... >> server.log
  timeout /t %CRASH_COOLDOWN% /nobreak >nul
  set CRASH_COUNT=0
  echo [%date% %time%] Cooldown complete — resuming restart loop >> "%~dp0debug.log"
)

goto loop

:: ── Log rotation subroutine ──────────────────────────────────────────
:rotate_log
if not exist %1 goto :eof
for %%A in (%1) do set LOG_SIZE=%%~zA
if not defined LOG_SIZE goto :eof
:: 5MB = 5242880 bytes
if %LOG_SIZE% GEQ 5242880 (
  echo [%date% %time%] Rotating %1 (%LOG_SIZE% bytes) >> "%~dp0debug.log"
  del /f /q "%~1.old" >nul 2>&1
  rename %1 "%~nx1.old" >nul 2>&1
)
goto :eof
