#!/bin/bash
# Builds the portable kiosk release zip.
# Usage: bash make-release.sh
# Output: world-map-kiosk-release.zip

set -e

RELEASE_NAME="world-map-kiosk-release"
OUTPUT_ZIP="${RELEASE_NAME}.zip"
STAGING_DIR="/tmp/${RELEASE_NAME}"

echo "Building release: ${OUTPUT_ZIP}"

# Clean staging area
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Copy files needed for the portable kiosk (no node_modules needed — server uses only built-ins)
cp server.js         "$STAGING_DIR/"
cp package.json      "$STAGING_DIR/"
cp seed-data.json    "$STAGING_DIR/"
cp launch-kiosk.sh   "$STAGING_DIR/"
cp launch-kiosk.bat  "$STAGING_DIR/"
cp -r public         "$STAGING_DIR/public"

# Make the launch scripts executable
chmod +x "$STAGING_DIR/launch-kiosk.sh"

# Create zip from the staging dir
cd /tmp
rm -f "${OLDPWD}/${OUTPUT_ZIP}"
zip -r "${OLDPWD}/${OUTPUT_ZIP}" "${RELEASE_NAME}"

# Clean up
rm -rf "$STAGING_DIR"

echo ""
echo "Release built: ${OUTPUT_ZIP}"
echo "Contents:"
unzip -l "${OLDPWD}/${OUTPUT_ZIP}" | tail -n +4 | grep -v "^---"
