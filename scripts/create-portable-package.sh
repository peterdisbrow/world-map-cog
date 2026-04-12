#!/bin/bash
# Creates world-map-kiosk-portable.zip — a zero-install Windows bundle.
# Includes node.exe (Windows x64) and node_modules so the kiosk works
# immediately on first launch with no internet access required.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
BUNDLE_NAME="world-map-kiosk-portable"
STAGING_DIR="$RELEASE_DIR/$BUNDLE_NAME"
ZIP_PATH="$RELEASE_DIR/${BUNDLE_NAME}.zip"
NODE_VERSION="22.14.0"
NODE_WIN_ZIP="node-v${NODE_VERSION}-win-x64.zip"
NODE_WIN_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_WIN_ZIP}"

# ── Ensure Windows node.exe is present ────────────────────────────────
if [ ! -f "$ROOT_DIR/node.exe" ]; then
  echo "node.exe not found — downloading Windows Node.js ${NODE_VERSION}..."
  TMP_DIR=$(mktemp -d)
  curl -fsSL --progress-bar "$NODE_WIN_URL" -o "$TMP_DIR/$NODE_WIN_ZIP"
  unzip -q "$TMP_DIR/$NODE_WIN_ZIP" -d "$TMP_DIR"
  cp "$TMP_DIR/node-v${NODE_VERSION}-win-x64/node.exe" "$ROOT_DIR/node.exe"
  rm -rf "$TMP_DIR"
  echo "node.exe ready."
fi

# ── Ensure node_modules is present ────────────────────────────────────
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "node_modules not found — running npm install..."
  (cd "$ROOT_DIR" && npm install --production --no-audit --no-fund)
  echo "node_modules ready."
fi

echo "Building portable kiosk bundle..."
rm -rf "$STAGING_DIR" "$ZIP_PATH"
mkdir -p "$STAGING_DIR"

# ── App files ──────────────────────────────────────────────────────────
rsync -a \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.DS_Store' \
  --exclude '.env.local' \
  --exclude '.vercel' \
  --exclude 'local-data' \
  --exclude 'release' \
  --exclude 'scripts' \
  --exclude 'server.log' \
  --exclude 'launch-kiosk*.bat' \
  --exclude 'launch-kiosk*.sh' \
  --exclude 'run-local-kiosk.bat' \
  --exclude 'start-local-server.bat' \
  --exclude 'start-local-server.sh' \
  --exclude 'README.md' \
  --exclude 'RELEASE-QUICKSTART.txt' \
  --exclude 'vercel.json' \
  --exclude '.gitignore' \
  "$ROOT_DIR/" "$STAGING_DIR/"

# ── Zip ────────────────────────────────────────────────────────────────
(
  cd "$RELEASE_DIR"
  zip -qry "${BUNDLE_NAME}.zip" "$BUNDLE_NAME"
)

SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
echo "Created: $ZIP_PATH  ($SIZE)"
echo ""
echo "Contents:"
zipinfo -1 "$ZIP_PATH" | head -40
