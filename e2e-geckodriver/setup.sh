#!/usr/bin/env bash
# One-time setup for the Selenium/geckodriver Firefox E2E harness.
# Fetches a NON-SNAP Firefox + geckodriver — snap Firefox is sandboxed and can't be
# driven by geckodriver. Idempotent: re-running only fetches what's missing.
#
# The Selenium client itself is an npm devDependency (selenium-webdriver), so no pip here.
set -euo pipefail

GECKO_VER=${GECKO_VER:-v0.36.0}
FIREFOX_DIR=${FIREFOX_DIR:-$HOME/.local/firefox-nonsnap}
GECKO_BIN=${GECKO_BIN:-$HOME/.local/bin/geckodriver}

if [[ ! -x "$GECKO_BIN" ]]; then
    echo "[setup] installing geckodriver $GECKO_VER -> $GECKO_BIN"
    mkdir -p "$(dirname "$GECKO_BIN")"
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    curl -fsSL "https://github.com/mozilla/geckodriver/releases/download/$GECKO_VER/geckodriver-$GECKO_VER-linux64.tar.gz" \
        | tar -xz -C "$tmp"
    install -m 0755 "$tmp/geckodriver" "$GECKO_BIN"
fi
"$GECKO_BIN" --version | head -1

if [[ ! -x "$FIREFOX_DIR/firefox/firefox" ]]; then
    echo "[setup] downloading non-snap Firefox -> $FIREFOX_DIR"
    mkdir -p "$FIREFOX_DIR"
    curl -fsSL "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US" \
        -o /tmp/firefox.tar.xz
    tar -xJf /tmp/firefox.tar.xz -C "$FIREFOX_DIR"
    rm -f /tmp/firefox.tar.xz
fi
"$FIREFOX_DIR/firefox/firefox" --version

echo "[setup] OK — run: pnpm zip:firefox && pnpm test:e2e:gecko"
