@echo off
REM Launch World Map in Chrome kiosk mode for the prayer table (2400x1350)
REM Double-click this file to launch

set URL=https://world-map-cog.vercel.app
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

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
  %URL%
