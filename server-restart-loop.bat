@echo off
:: Internal helper — called by "Start Prayer Table.bat" to run the server
:: with an auto-restart loop. Exit code 100 = server updated itself and
:: wants to restart immediately (before the nightly reboot at 3am).
cd /d "%~dp0"
:loop
node.exe server.js >> server.log 2>&1
if %errorlevel% == 100 (
  echo [%date% %time%] Restarting server after auto-update... >> server.log
  goto loop
)
