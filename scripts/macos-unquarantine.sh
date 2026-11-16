#!/usr/bin/env bash
# Repair a downloaded vmix-utility.app that macOS reports as "damaged".
#
# Older releases were distributed without a complete code signature, so
# Gatekeeper shows "vmix-utility"は壊れているため開けません on Apple Silicon.
# This script removes the quarantine flag and, if needed, re-signs the bundle
# ad-hoc so the app opens normally.
#
# Usage: bash scripts/macos-unquarantine.sh [path/to/vmix-utility.app]
#        (defaults to /Applications/vmix-utility.app)
set -euo pipefail

APP_PATH="${1:-/Applications/vmix-utility.app}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "error: app bundle not found: $APP_PATH" >&2
  echo "       install the app first (e.g. drag it from the mounted .dmg into /Applications)" >&2
  exit 1
fi

echo "Removing quarantine flag from: $APP_PATH"
xattr -dr com.apple.quarantine "$APP_PATH" || true

if ! codesign --verify --deep --strict "$APP_PATH" >/dev/null 2>&1; then
  echo "Code signature is incomplete; re-signing ad-hoc ..."
  codesign --force --deep -s - "$APP_PATH"
fi

codesign --verify --deep --strict "$APP_PATH"
echo "OK: $APP_PATH is now signed and unquarantined. Double-click it to launch."
