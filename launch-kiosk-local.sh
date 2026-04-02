#!/bin/bash
# Launch World Map local kiosk mode for the prayer table (2400x1350)
# Start the local server first with: ./start-local-server.sh

URL="http://127.0.0.1:3030"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

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
  --user-data-dir="/tmp/world-map-kiosk-local" \
  "$URL"
