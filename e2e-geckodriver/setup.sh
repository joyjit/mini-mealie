#!/usr/bin/env bash
# One-time setup for the geckodriver-based Firefox E2E test.
# Idempotent: re-running is safe and only fetches missing pieces.
set -euo pipefail

GECKO_VER=${GECKO_VER:-v0.36.0}
FIREFOX_DIR=${FIREFOX_DIR:-$HOME/.local/firefox-nonsnap}
GECKO_BIN=${GECKO_BIN:-$HOME/.local/bin/geckodriver}

echo "[setup] checking python3 + selenium..."
python3 -c "import selenium" 2>/dev/null || python3 -m pip install --user "selenium>=4.30"

if [[ ! -x "$GECKO_BIN" ]]; then
    echo "[setup] installing geckodriver $GECKO_VER -> $GECKO_BIN"
    mkdir -p "$(dirname "$GECKO_BIN")"
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    arch=linux64
    curl -fsSL "https://github.com/mozilla/geckodriver/releases/download/$GECKO_VER/geckodriver-$GECKO_VER-$arch.tar.gz" \
        | tar -xz -C "$tmp"
    install -m 0755 "$tmp/geckodriver" "$GECKO_BIN"
fi
"$GECKO_BIN" --version | head -1

if [[ ! -x "$FIREFOX_DIR/firefox/firefox" ]]; then
    echo "[setup] downloading non-snap Firefox -> $FIREFOX_DIR"
    mkdir -p "$FIREFOX_DIR"
    curl -fsSL "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US" -o /tmp/firefox.tar.xz
    tar -xJf /tmp/firefox.tar.xz -C "$FIREFOX_DIR"
    rm -f /tmp/firefox.tar.xz
fi
"$FIREFOX_DIR/firefox/firefox" --version

echo "[setup] OK — run with: pnpm build:firefox && pnpm test:e2e:gecko"
