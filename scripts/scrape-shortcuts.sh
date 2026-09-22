#!/usr/bin/env bash
# Regenerate app/src/assets/shortcuts.json with the vmix-rs scrape bin.
# VMIX_RS defaults to the sibling checkout. HELP_VERSION defaults to 29.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VMIX_RS="${VMIX_RS:-"$ROOT/../vmix-rs"}"
HELP_VERSION="${HELP_VERSION:-29}"
OUTPUT="${1:-"$ROOT/app/src/assets/shortcuts.json"}"

if [[ ! -f "$VMIX_RS/Cargo.toml" ]]; then
  echo "vmix-rs was not found at $VMIX_RS. Set VMIX_RS to that checkout." >&2
  exit 1
fi

cargo run --manifest-path "$VMIX_RS/Cargo.toml" \
  -p vmix-shortcuts --features scrape --bin scrape -- \
  --help-version "$HELP_VERSION" \
  --output "$OUTPUT"
