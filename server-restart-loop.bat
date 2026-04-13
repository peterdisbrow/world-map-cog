@echo off
:: Internal helper — called by "Start Prayer Table.bat" to run the server
:: with an auto-restart loop. Exit code 100 = server updated itself and
:: wants to restart immediately (before the nightly reboot at 3am).
cd /d "%~dp0"
echo [%date% %time%] ===== server-restart-loop.bat started, dir=%cd% ===== >> "%~dp0debug.log"
:loop
echo [%date% %time%] Launching node.exe server.js >> "%~dp0debug.log"
node.exe server.js >> server.log 2>&1
set NODE_EXIT=%errorlevel%
echo [%date% %time%] node.exe exited with errorlevel %NODE_EXIT% >> "%~dp0debug.log"
if %NODE_EXIT% == 100 (
  echo [%date% %time%] Restarting server after auto-update... >> "%~dp0debug.log"
  echo [%date% %time%] Restarting server after auto-update... >> server.log
  goto loop
)
echo [%date% %time%] server-restart-loop.bat exiting (errorlevel %NODE_EXIT%) >> "%~dp0debug.log"
