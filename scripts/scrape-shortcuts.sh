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

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to normalize the catalog (see mise.toml)." >&2
  exit 1
fi

RAW="$(mktemp)"
trap 'rm -f "$RAW"' EXIT

cargo run --manifest-path "$VMIX_RS/Cargo.toml" \
  -p vmix-shortcuts --features scrape --bin scrape -- \
  --help-version "$HELP_VERSION" \
  --output "$RAW"

# The upstream scraper also emits a Category field that the app does not use.
# Writing only Name/Description/Parameters keeps the committed catalog stable,
# so a refresh produces no unrelated diff.
bun -e '
const fs = require("node:fs");
const [input, output] = process.argv.slice(1);
const catalog = JSON.parse(fs.readFileSync(input, "utf8"));
const normalized = catalog.map((entry) => ({
  Name: entry.Name,
  Description: entry.Description,
  Parameters: entry.Parameters ?? null,
}));
fs.writeFileSync(output, `${JSON.stringify(normalized, null, 2)}\n`);
' "$RAW" "$OUTPUT"

echo "wrote $(LC_ALL=C grep -c '"Name"' "$OUTPUT") functions to $OUTPUT"
