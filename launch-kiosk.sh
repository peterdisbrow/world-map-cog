#!/bin/bash
# Launch World Map in Chrome kiosk mode for the prayer table (2400x1350)
# Usage: double-click this file or run: ./launch-kiosk.sh

URL="https://world-map-cog.vercel.app"

# macOS Chrome path
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Windows fallback (uncomment if on Windows)
# CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"

"$CHROME" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --no-first-run \
  --start-fullscreen \
  --window-size=2400,1350 \
  --window-position=0,0 \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir="/tmp/world-map-kiosk" \
  "$URL"
