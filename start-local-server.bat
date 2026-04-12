@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

if not exist local-data mkdir local-data

:restart_loop
node server.js >> local-data\server.log 2>&1
if %errorlevel% == 100 (
  echo [%date% %time%] Restarting server after auto-update... >> local-data\server.log
  goto restart_loop
)
