@echo off
REM Launch World Map local kiosk mode for the prayer table (2400x1350)
REM Start the local server first with start-local-server.bat

setlocal
set URL=http://127.0.0.1:3030
set BROWSER=

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set BROWSER="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set BROWSER="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set BROWSER="%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set BROWSER="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
  echo Could not find Chrome or Edge.
  echo Install Google Chrome or Microsoft Edge, then run this script again.
  pause
  exit /b 1
)

start "" %BROWSER% ^
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
  --user-data-dir="%TEMP%\world-map-kiosk-local" ^
  %URL%

endlocal
