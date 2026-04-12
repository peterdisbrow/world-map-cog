#!/bin/bash
# Launch World Map in Chrome kiosk mode for the prayer table (2400x1350)
# Starts the local sync server, waits for the first sync, then opens Chrome.
# Usage: double-click this file or run: ./launch-kiosk.sh
# Requires: Node.js 18+

KIOSK_URL="http://localhost:3000"
SERVER_SCRIPT="$(dirname "$0")/server.js"

# macOS Chrome path
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# ── Start the local server ────────────────────────────────────────────────────
echo "Starting local kiosk server..."
node "$SERVER_SCRIPT" &
SERVER_PID=$!

# Trap exit to kill the server when the script ends
trap "echo 'Shutting down server...'; kill $SERVER_PID 2>/dev/null" EXIT INT TERM

# Wait for the server to be ready (up to 15 seconds)
echo "Waiting for server to be ready..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:3000/api/sync-status"; then
    echo "Server is ready."
    break
  fi
  sleep 0.5
done

# ── Launch Chrome in kiosk mode ───────────────────────────────────────────────
echo "Launching Chrome kiosk at $KIOSK_URL"
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
  "$KIOSK_URL"

# Server shuts down when Chrome exits (via trap above)
