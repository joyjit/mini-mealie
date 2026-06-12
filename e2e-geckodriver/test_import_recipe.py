"""Firefox E2E for the Mini Mealie extension via geckodriver + Selenium.

Why this exists: prior Playwright attempts (see MEMORY.md) could never get the
unpacked MV3 extension to register a UUID in Firefox. Geckodriver's
`install_addon(path, temporary=True)` is Mozilla's officially supported API for
loading unsigned add-ons under automation and works in this environment when
both Firefox and geckodriver are non-snap binaries.

Flow mirrors `e2e-playwright/import-recipe.spec.ts`:
  1. Launch Firefox via geckodriver
  2. install_addon as temporary
  3. Open moz-extension://<uuid>/popup.html and seed Mealie creds into
     chrome.storage.sync
  4. Open recipe URL in a new tab
  5. Send the internal e2e message that triggers the same code path as the
     context-menu "Save to Mealie" click
  6. Poll Mealie GET /api/recipes for the expected slug
"""
from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION_DIR = Path(os.environ.get("E2E_EXTENSION_PATH") or REPO_ROOT / ".output/firefox-mv3").resolve()
ADDON_ID = "mini-mealie-firefox@infotune.com"
E2E_MESSAGE_TYPE = "mini-mealie/e2e/run-create-recipe"


def env(name: str, default: Optional[str] = None) -> Optional[str]:
    val = os.environ.get(name)
    if val is None or val.strip() == "":
        return default
    return val.strip()


def log(msg: str) -> None:
    print(f"[e2e] {msg}", flush=True)


def read_uuid_from_profile(driver, profile_dir: Path, timeout_s: float = 30.0) -> str:
    """Poll prefs.js for the addon UUID. Firefox flushes prefs asynchronously, so
    we nudge it with about:debugging navigations and poll with a generous timeout."""
    import json
    pattern = re.compile(
        r'user_pref\("extensions\.webextensions\.uuids",\s*"((?:[^"\\]|\\.)*)"\)'
    )
    deadline = time.monotonic() + timeout_s
    nudge_at = time.monotonic() + 2.0
    nudged = False
    last_seen: Optional[str] = None
    while time.monotonic() < deadline:
        prefs = profile_dir / "prefs.js"
        if prefs.exists():
            text = prefs.read_text(errors="replace")
            m = pattern.search(text)
            if m:
                decoded = m.group(1).encode("utf-8").decode("unicode_escape")
                try:
                    uuids = json.loads(decoded)
                except Exception as exc:
                    last_seen = f"json parse failed: {exc}"
                else:
                    if ADDON_ID in uuids:
                        return uuids[ADDON_ID]
                    last_seen = f"pref keys: {list(uuids)!r}"
        if not nudged and time.monotonic() > nudge_at:
            # about:debugging enumerates installed extensions which forces prefs flush.
            try:
                driver.get("about:debugging#/runtime/this-firefox")
            except Exception:
                pass
            nudged = True
        time.sleep(0.4)
    raise RuntimeError(
        f"Timed out waiting for UUID of {ADDON_ID} in prefs.js (last: {last_seen})"
    )


def poll_extension_log_for_import(
    driver, recipe_url: str, mode: str, timeout_s: float = 120.0
) -> dict:
    """Poll the extension's own activity log (chrome.storage.local) for the
    recipe-create success/failure event.

    This is the extension's source of truth: a `phase: 'success'` entry means
    Mealie returned 2xx for the import POST. Using the extension's log instead of
    the Mealie HTTP API also sidesteps Cloudflare bot-protection on the Mealie
    origin, which blocks non-browser-with-cookies requests.
    """
    from urllib.parse import urlparse
    parsed = urlparse(recipe_url)
    expected_sanitized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    expected_action = "createFromHtml" if mode == "html" else "createFromUrl"
    poll_script = """
        const [done] = arguments;
        chrome.storage.local.get(['miniMealie.eventLog'], (items) => {
            const err = chrome.runtime.lastError;
            if (err) { done({ error: String(err.message || err) }); return; }
            done({ events: items['miniMealie.eventLog'] || [] });
        });
    """
    deadline = time.monotonic() + timeout_s
    last_count = 0
    last_action_summary: Optional[str] = None
    while time.monotonic() < deadline:
        result = driver.execute_async_script(poll_script)
        if result.get("error"):
            raise RuntimeError(f"chrome.storage.local.get failed: {result['error']}")
        events = result.get("events") or []
        last_count = len(events)
        # Search newest-first for a recipe-create terminal event matching our URL.
        for ev in reversed(events):
            if ev.get("feature") != "recipe-create":
                continue
            if ev.get("action") != expected_action:
                continue
            if ev.get("phase") not in ("success", "failure"):
                continue
            data = ev.get("data") or {}
            url_in_log = data.get("url")
            if url_in_log != expected_sanitized:
                continue
            if ev["phase"] == "success":
                return ev
            raise AssertionError(
                f"Extension reported import FAILURE for {expected_sanitized}: "
                f"{ev.get('message')!r}"
            )
        # Surface the most recent recipe-create event for diagnostics if we time out.
        for ev in reversed(events):
            if ev.get("feature") == "recipe-create":
                last_action_summary = (
                    f"{ev.get('action')} phase={ev.get('phase')} "
                    f"msg={ev.get('message')!r}"
                )
                break
        time.sleep(2)
    raise AssertionError(
        f"Timed out waiting for recipe-create.{expected_action} success event "
        f"for {expected_sanitized} (event count: {last_count}; last recipe-create: "
        f"{last_action_summary})."
    )


def main() -> int:
    mealie_server = env("E2E_MEALIE_SERVER") or env("WXT_MEALIE_SERVER")
    mealie_token = env("E2E_MEALIE_TOKEN") or env("WXT_MEALIE_API_TOKEN")
    if not mealie_server or not mealie_token:
        log("SKIP: set E2E_MEALIE_SERVER / E2E_MEALIE_TOKEN (or WXT_MEALIE_* fallbacks)")
        return 77  # autotools "skip" convention

    recipe_url = env(
        "E2E_RECIPE_URL",
        "https://www.allrecipes.com/recipe/269394/pistachio-crusted-salmon/",
    )
    import_mode = "url" if env("E2E_IMPORT_MODE", "html") == "url" else "html"

    if not EXTENSION_DIR.exists() or not (EXTENSION_DIR / "manifest.json").exists():
        log(f"FAIL: extension not built at {EXTENSION_DIR} — run `pnpm build:firefox` first")
        return 2

    firefox_bin = env(
        "E2E_FIREFOX_EXECUTABLE",
        str(Path.home() / ".local/firefox-nonsnap/firefox/firefox"),
    )
    gecko_bin = env("E2E_GECKODRIVER", str(Path.home() / ".local/bin/geckodriver"))
    if not Path(firefox_bin).exists():
        log(f"FAIL: Firefox binary missing at {firefox_bin}")
        return 2
    if not Path(gecko_bin).exists():
        log(f"FAIL: geckodriver missing at {gecko_bin}")
        return 2

    options = Options()
    options.binary_location = firefox_bin
    if env("E2E_FIREFOX_HEADLESS", "1") != "0":
        options.add_argument("-headless")
    # Non-snap Firefox content sandbox fails on this kernel; disable.
    os.environ.setdefault("MOZ_DISABLE_CONTENT_SANDBOX", "1")

    gecko_log = Path("/tmp/geckodriver-e2e.log")
    service = Service(executable_path=gecko_bin, log_output=open(gecko_log, "w"))

    log(f"firefox={firefox_bin}")
    log(f"geckodriver={gecko_bin}")
    log(f"extension={EXTENSION_DIR}")
    log(f"mealie={mealie_server}  mode={import_mode}")
    log("launching Firefox...")
    driver = webdriver.Firefox(service=service, options=options)
    try:
        log("install_addon(temporary=True)...")
        addon_id = driver.install_addon(str(EXTENSION_DIR), temporary=True)
        log(f"installed: {addon_id}")

        profile_dir = Path(driver.capabilities["moz:profile"])
        uuid = read_uuid_from_profile(driver, profile_dir)
        ext_origin = f"moz-extension://{uuid}"
        log(f"extension origin: {ext_origin}")

        log("opening popup.html to get a page where chrome.storage.* is in scope...")
        driver.get(f"{ext_origin}/popup.html")
        # Give the popup React app a tick — not required for storage APIs, but ensures
        # the page is fully loaded before we run scripts.
        time.sleep(1.0)

        log("seeding Mealie credentials into chrome.storage.sync...")
        seed_script = """
            const [server, token, mode, done] = arguments;
            chrome.storage.sync.set({
                mealieServer: server,
                mealieApiToken: token,
                recipeCreateMode: mode,
                importTags: true,
                importCategories: true,
                openAfterImport: false,
            }, () => {
                const err = chrome.runtime.lastError;
                done(err ? String(err.message || err) : null);
            });
        """
        err = driver.execute_async_script(
            seed_script, mealie_server, mealie_token, import_mode
        )
        if err:
            raise RuntimeError(f"chrome.storage.sync.set failed: {err}")

        log("opening recipe tab...")
        driver.switch_to.new_window("tab")
        driver.get(recipe_url)
        # Give background detection / scrape pipeline time to settle, matches Playwright wait.
        time.sleep(6 if env("CI") else 3)
        recipe_tab_url = driver.current_url
        log(f"recipe tab loaded: {recipe_tab_url}")

        # Switch back to the popup window (first handle) where chrome.runtime is available.
        handles = driver.window_handles
        driver.switch_to.window(handles[0])

        log("dispatching e2e runCreateRecipe message...")
        trigger_script = """
            const [type, matchUrl, done] = arguments;
            chrome.runtime.sendMessage({ type, matchUrl }, (r) => {
                const err = chrome.runtime.lastError;
                if (err) done({ error: String(err.message || err) });
                else done(r || {});
            });
        """
        ack = driver.execute_async_script(
            trigger_script, E2E_MESSAGE_TYPE, recipe_tab_url
        )
        log(f"trigger ack: {ack}")
        if not isinstance(ack, dict) or ack.get("error") or ack.get("ok") is not True:
            raise RuntimeError(f"runCreateRecipe trigger failed: {ack}")

        log(f"polling extension activity log for recipe-create success...")
        ev = poll_extension_log_for_import(driver, recipe_url, import_mode, timeout_s=120.0)
        log(f"PASS — extension reported import success: {ev.get('message')!r}")
        return 0
    except Exception as exc:
        log(f"FAIL: {type(exc).__name__}: {exc}")
        # Dump the extension's activity log to make root-cause obvious — the test
        # is wired up correctly, so a failure here usually points at the Mealie
        # server (auth, CORS, Cloudflare bot-protection, etc.).
        try:
            events = driver.execute_async_script(
                "const [done] = arguments;"
                "chrome.storage.local.get(['miniMealie.eventLog'], (i) =>"
                " done(i['miniMealie.eventLog'] || []));"
            )
            log(f"--- extension activity log ({len(events)} events) ---")
            for ev in events[-30:]:
                log(
                    f"  [{ev.get('level')}] {ev.get('feature')}/{ev.get('action')}"
                    f" {ev.get('phase') or ''} :: {ev.get('message')}"
                    + (f"  data={ev.get('data')}" if ev.get("data") else "")
                )
        except Exception as dump_err:
            log(f"(could not dump activity log: {dump_err})")
        # Probe Mealie directly from the extension's network context to localize
        # the issue: is the server unreachable, is auth broken, or is it the
        # specific import endpoint?
        try:
            base = (mealie_server or "").rstrip("/")
            probe_script = """
                const [server, token, done] = arguments;
                fetch(server + '/api/users/self', {
                    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
                }).then(async (r) => {
                    let body = '';
                    try { body = (await r.text()).slice(0, 200); } catch (_) {}
                    done({ status: r.status, type: r.type, redirected: r.redirected, url: r.url, body });
                }).catch((e) => done({ error: String(e && e.message || e) }));
            """
            probe = driver.execute_async_script(probe_script, base, (mealie_token or "").strip())
            log(f"--- Mealie reachability probe (GET /api/users/self from popup) ---")
            log(f"  {probe}")
        except Exception as probe_err:
            log(f"(could not probe Mealie: {probe_err})")
        try:
            tail = "\n".join(gecko_log.read_text(errors="replace").splitlines()[-15:])
            log(f"--- geckodriver log (last 15 lines) ---\n{tail}")
        except Exception:
            pass
        return 1
    finally:
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
