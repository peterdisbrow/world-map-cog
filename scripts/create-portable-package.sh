#!/bin/bash
# Creates world-map-kiosk-portable.zip — a zero-install Windows bundle.
# node.exe and node_modules are NOT included; the launcher downloads them
# on first run. This keeps the zip tiny (well under 1 MB).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
BUNDLE_NAME="world-map-kiosk-portable"
STAGING_DIR="$RELEASE_DIR/$BUNDLE_NAME"
ZIP_PATH="$RELEASE_DIR/${BUNDLE_NAME}.zip"

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
  --exclude 'node_modules' \
  --exclude 'node.exe' \
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
