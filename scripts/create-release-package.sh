#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
STAMP="$(date +%Y-%m-%d)"
PACKAGE_NAME="world-map-cog-kiosk-${STAMP}"
STAGING_DIR="$RELEASE_DIR/$PACKAGE_NAME"
ZIP_PATH="$RELEASE_DIR/${PACKAGE_NAME}.zip"

rm -rf "$STAGING_DIR" "$ZIP_PATH"
mkdir -p "$STAGING_DIR"

rsync -a \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '.env.local' \
  --exclude '.vercel' \
  --exclude 'local-data' \
  --exclude 'node_modules' \
  --exclude 'release' \
  "$ROOT_DIR/" "$STAGING_DIR/"

chmod +x "$STAGING_DIR/start-local-server.sh" "$STAGING_DIR/launch-kiosk-local.sh"

(
  cd "$RELEASE_DIR"
  zip -qry "${PACKAGE_NAME}.zip" "$PACKAGE_NAME"
)

echo "Created release package:"
echo "  $ZIP_PATH"
