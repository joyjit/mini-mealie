# Mini Mealie

[![Release][release-shield]][release-url]
[![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![AGPL License][license-shield]][license-url]
[![Coverage Status][coverage-shield]][coverage-url]
[![Conventional Commits][conventional-commits-shield]][conventional-commits-url]
[![Chrome Web Store][chrome-web-store-shield]][chrome-web-store-url]
[![Buy Me a Coffee][coffee-shield]](#-support-me)

Mini Mealie is a Chrome extension built using WXT and React, designed to speed up recipe creation. This extension integrates with Mealie to scrape recipes and import into Mealie.

---

## Features

- **Dual Import Modes:**
    - **URL Mode:** Send recipe URL directly to Mealie for server-side parsing
    - **HTML Mode:** Extract page HTML in the browser and send to Mealie (useful for paywalled or JavaScript-heavy sites)
- **Import Options:**
    - **Import Tags:** Optionally import original keywords from recipe metadata as Mealie tags
    - **Import Categories:** Optionally import recipe categories from structured data
    - _Note: Tag and category extraction depends on the source recipe having proper metadata (schema.org keywords, meta tags, etc.). Not all recipes include this information._
    - _Example recipe with tags/categories: [Homemade Nutty Granola](https://www.katheats.com/homemade-nutty-granola-recipe)_
- **Intelligent Recipe Detection:** Automatic dry-run detection on active tab to verify recipe presence
- **Activity Logging System:** Real-time event logging with dedicated viewer (`chrome-extension://[id]/logs.html`)
- **Smart Context Menu:** Mode-aware menu options that adapt to your selected import method
- **Secure Credential Storage:** API tokens stored securely using `chrome.storage.sync`
- **Self-Hosted Support:** Connect to any Mealie server instance

---

## Requirements and Dependencies

- **Node.js** v22.x or later
- **pnpm** (Package Manager)
- **Chrome** (for testing and development)
- Dependencies:
    - **WXT** (Web Extension Toolkit)
    - **React** v19.x
    - **TypeScript** 5.9.x

---

## Installation and Setup

1. **Clone the repository:**

2. **Install dependencies using pnpm:**

    ```bash
    pnpm install
    ```

3. **Set up your local development environment (optional but recommended):**

    ```bash
    cp .env.local.example .env.local
    ```

    Then edit `.env.local` and fill in your Mealie server details:

    ```env
    WXT_MEALIE_SERVER=https://your-mealie-server.com
    WXT_MEALIE_API_TOKEN=your-api-token-here
    WXT_MEALIE_USERNAME=your-username

    # Optional: richer debugging (`pnpm dev:firefox` already implies DEV — production zip builds need a rebuild after enabling)
    # WXT_DEBUG_EXTENSION=true
    ```

    **Why `.env.local`?**
    - ✅ Pre-populates your Mealie server URL and API token during development
    - ✅ No need to re-login every time you restart the dev browser
    - ✅ Persistent Chrome profile remembers your settings
    - ✅ Your credentials never get committed to git (`.env.local` is gitignored)

    Without `.env.local`, you'll need to manually configure the extension via the popup on each dev session - it will still work, just less convenient!

4. **Start the development server:**

    ```bash
    pnpm dev
    ```

    This will:
    - Start the WXT dev server
    - Open Chrome with the extension loaded in a persistent profile (`.wxt/chrome-data`)
    - Auto-open a recipe page for testing (https://www.allrecipes.com/recipe/286369/)
    - Auto-open the activity logs page (`logs.html`) for real-time monitoring
    - Pre-populate your credentials from `.env.local` (if configured)

    Your settings and browser state persist across dev sessions - no need to re-configure!

5. **Build the extension for production:**

    ```bash
    pnpm build
    ```

6. **Load the extension in Chrome:**
    - Go to `chrome://extensions/`
    - Enable **Developer Mode**
    - Click **Load unpacked** and select the `dist` folder

### Firefox

WXT builds a Firefox target separately from Chrome; **both use Manifest V3** in this repo (`pnpm *firefox` passes `--mv3`).

- **Development:** `pnpm dev:firefox` — runs the WXT dev server for **Firefox MV3**. WXT **cannot** auto-open Firefox for Firefox MV3 ([upstream limitation](https://github.com/wxt-dev/wxt/issues/230)), so this script sets `WXT_WEB_EXT_DISABLED=true` and prints the unpacked path. Load **`.output/firefox-mv3-dev/manifest.json`** via `about:debugging` → **Load Temporary Add-on…**, then use **Alt+R** / the dev workflow to reload after edits. Profile-related options in `web-ext.config.ts` apply when web-ext launches the browser; for manual loads you use whatever profile Firefox is already running.
- **`.env.local` / Mealie URL + token:** Pre-fill from `WXT_MEALIE_SERVER` / `WXT_MEALIE_API_TOKEN` only happens in **development** (`initDevEnvironment` in `utils/devInit.ts` checks `import.meta.env.DEV`). Use **`pnpm dev:firefox`** after editing `.env.local`, then restart that dev command if you change the file. **`pnpm build:firefox`** + loading `.output/firefox-mv3` is a **production** bundle — it will **not** read `.env.local`; enter credentials in the popup (or build a separate dev workflow).
- **Production build:** `pnpm build:firefox` — unpacked output under `.output/firefox-mv3/`.
- **Zip for testers / AMO source bundles:** `pnpm zip:firefox` — archive under `.output/` (name includes the version from `package.json`).
- **Verify before manual QA:** Run **`pnpm verify`** (compile, ESLint, full Vitest run including badge/menu refresh-queue regressions, `pnpm build:firefox`). Use this as the gate before loading `.output/firefox-mv3/` in the browser so fixes are checked in CI-parity steps first.
- **Temporary manual load:** Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → choose `.output/firefox-mv3/manifest.json` (or the zip, depending on your Firefox version). Temporary installs drop when you quit the browser—use a signed build or normal profile workflow for persistence.
- **`storage.sync` + temporary loads:** Firefox refuses **`browser.storage.sync`** for temporary add-ons unless the manifest sets an explicit **`browser_specific_settings.gecko.id`** (see `wxt.config.ts`). Without it, **Connect** fails with “storage API will not work with a temporary addon ID”. After changing the id, **remove** the old temporary entry and **load** the new build again.

#### Root-cause debugging (context menu / Activity Logs)

If Activity Logs only show **`auth/getUser`** after you connect, the popup ran — but you still need evidence that the **background** refreshed menus.

1. After **`pnpm verify`** and reloading the add-on, open **`logs.html`** and look for **`recipe-detect` / `badgeMenuRefresh`** rows (persisted from `utils/storage.ts`). The **`data.outcome`** field tells you what happened (examples: **`skipped_no_credentials`**, **`html_mode_static_menu`**, **`skipped_detection_superseded`**, **`menu_updated`**).
2. **Inspect extension storage (Firefox):** `about:debugging` → **This Firefox** → Mini Mealie → **Inspect**. In the toolbox **Console**, run:
    ```javascript
    browser.storage.sync.get(null, console.log);
    browser.storage.local.get(null, console.log);
    ```
    Confirm **`mealieServer`** / **`mealieApiToken`** appear where you expect (sync vs local mirror). If the popup shows “connected” but sync keys are empty while **`chrome.storage.local`** holds credentials, focus on merge/sync writes rather than guessing UI fixes.
3. In the same toolbox **Console**, check for **errors** from **`background.js`** when switching tabs.

**Sync:** Like Chrome, settings use `chrome.storage.sync` (supported in Firefox as `browser.storage.sync`). Data syncs across devices only if Firefox Sync is enabled with a Mozilla account; otherwise values stay on the local profile.

#### Automated E2E tests

Two harnesses cover the two browsers; both drive the extension end-to-end against your Mealie server.

| Browser | Harness | Command |
|---|---|---|
| Firefox | `e2e-geckodriver/` (Python + Selenium + non-snap geckodriver) | `pnpm test:e2e:gecko` |
| Chrome  | `e2e-playwright/` (Playwright `launchPersistentContext` + `--load-extension`) | `pnpm test:e2e:chromium` |

Setup (one-time):
```bash
pnpm test:e2e:gecko:setup        # installs selenium, non-snap geckodriver + Firefox
pnpm test:e2e:chromium:install   # installs Playwright's Chromium
```

Run:
```bash
pnpm build && pnpm build:firefox
pnpm test:e2e:chromium  # ~7s
pnpm test:e2e:gecko     # ~30s
```

Both read Mealie creds from `WXT_MEALIE_SERVER` / `WXT_MEALIE_API_TOKEN` (or `E2E_MEALIE_*` overrides). `E2E_IMPORT_MODE=url|html` (default `html`), `E2E_RECIPE_URL` to change the test page, `E2E_FIREFOX_HEADLESS=0` to watch the Firefox run.

Why two harnesses: Playwright cannot install unsigned MV3 add-ons in Firefox in this environment; geckodriver's `install_addon(temporary=True)` is Mozilla's officially supported automation path for unsigned extensions.

If the Firefox test reports `Mealie reachability probe: NetworkError`, check Cloudflare / WAF rules on the Mealie origin — bot-protection on `/api` blocks both the test and the extension itself.

---

## Architecture

### Import Modes

Mini Mealie supports two distinct recipe import strategies:

- **URL Mode:** Sends the recipe URL to Mealie's server-side scraper. This is the default mode and works well for most public recipe sites. Fast and efficient.

- **HTML Mode:** Captures the entire page HTML in the browser using `chrome.scripting.executeScript`, then sends the HTML content to Mealie. Useful for:
    - Sites behind paywalls or authentication
    - JavaScript-heavy sites that don't render properly server-side
    - Sites with bot detection that blocks server requests

The extension automatically detects when URL mode fails and suggests switching to HTML mode.

### Event Logging System

All major extension operations are tracked through a structured logging system:

- **Persistent Storage:** Logs stored in `chrome.storage.local` with LRU cache management (up to 300 entries)
- **Event Correlation:** Each operation gets a unique operation ID for tracing multi-step workflows
- **Real-time Viewer:** Dedicated logs page with auto-refresh, filtering, and export capabilities
- **Activity Tracking:** Visual feedback via extension badge and tooltip during operations

Logged operations include:

- User authentication and connection verification
- Recipe detection (dry-run test scrapes)
- Recipe creation (both URL and HTML modes)
- HTML page capture
- Network requests and errors

---

## Configuration

- To use the Mealie integration, you will need to **generate an API token** in your Mealie instance.
- Save the token securely within the extension popup.
- Obtain your **local host URL** or public Mealie **instance URL** for API calls.
- Modify your Mealie infrastructure to allow CORS (Cross-Origin Resource Sharing) calls, as the Chrome extension will be making API requests:
    - This involves configuring your reverse proxies, authentication, or other related infrastructure.

---

## Usage

### Importing Recipes

1. **Configure your import mode** via the extension popup:
    - **URL Mode (default):** Fast server-side parsing - works for most public recipes
    - **HTML Mode:** Client-side extraction - best for sites with paywalls or heavy JavaScript
2. **Configure import options** (optional):
    - **Import tags from recipe:** Extract keywords from recipe metadata as Mealie tags
    - **Import categories from recipe:** Extract categories from structured recipe data
    - Both options depend on the source recipe having proper metadata - many recipes won't have this information
3. **Right-click** on any recipe webpage.
4. Select **"Add Recipe to Mealie (URL)"** or **"Add Recipe to Mealie (HTML)"** from the context menu (depends on your selected mode).
5. The extension will process the recipe and send it to your Mealie server.

### Monitoring Activity

- **Extension Badge:** Shows real-time status (⏳ processing, ✅ success, ❌ error)
- **Activity Log Viewer:** Access detailed logs at `chrome-extension://[id]/logs.html` or via the popup
- **Event Tracking:** All major operations (authentication, recipe creation, detection) are logged with timestamps and correlation IDs

### Troubleshooting Failed Imports

If URL mode fails to detect a recipe:

- The extension will automatically suggest switching to HTML mode
- HTML mode captures the full page content, which often resolves parsing issues on complex sites

---

## Development and Contribution

- **Open Source Invitation**:
    - Contributions are welcome as Mini Mealie evolves. Enhance features or propose new ones!
- **Discussion and Issues**:
    - Use the [discussion page][discussions-url] for suggestions or issue troubleshooting. Feel free to create [detailed issues][issues-url] for bugs or desired features.

### Pull Request Process

1. **Branches**:
    - **`main`**: Stable production build.
    - Develop new features or fixes in a feature branch.
    - Open a pull request (PR) pointing to `main`.

2. **Review**:
    - Request a review from a repository admin.

3. **Release Management**:
    - After a successful review and merge, a GitHub Action evaluates if a new release is necessary based on the PR commits.
    - This project follows Conventional Commits for release determination.
    - Approved releases are published to the Chrome Web Store via an upload workflow.

### Copilot Commit Helper (Optional)

If you use GitHub Copilot Chat in VS Code, you can use the prompt file at `.github/prompts/cz.prompt.md` to:

- Inspect **staged** changes only (`git diff --staged`)
- Propose a strict **Conventional Commits** message
- Iterate with you until you say **"commit those changes"**

Typical flow:

1. Stage your work (`git add ...`).
2. Open the prompt file and run it in Copilot Chat (or paste its contents into chat).
3. Review/tweak the proposed message.
4. When satisfied, respond: **"commit those changes"**.

### Code Reviews

- All pull request reviews must be kept up-to-date with the `main` branch.
- Branch protection rules are enforced to ensure:
    - Passing of ESLint tests.
    - Successful completion of unit tests.
    - Adequate test coverage is maintained.
    - All commits conform to Conventional Commits (enforced by CI commitlint check).
- All issues must be resolved prior to requesting a review.
- Pull requests require approval from at least one reviewer.

---

## 📄 License

Distributed under the [AGPL License][license-url]. See the [LICENSE](LICENSE) file for more details.

---

## ☕ Support Me

If you find this project useful, consider [buying me a coffee](https://www.buymeacoffee.com/atomos) to show your support!

---

## Contact

For questions or collaboration requests, contact:

- **Adam Shappy** - atom@shaplabs.net
- **GitHub** - https://github.com/mrshappy0

---

[contributors-shield]: https://img.shields.io/github/contributors/mrshappy0/mini-mealie.svg?style=for-the-badge
[contributors-url]: https://github.com/mrshappy0/mini-mealie/graphs/contributors
[stars-shield]: https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fmrshappy0%2Fmini-mealie&query=stargazers_count&style=for-the-badge&label=stars&color=blue&logo=github
[stars-url]: https://github.com/mrshappy0/mini-mealie/stargazers
[issues-shield]: https://img.shields.io/github/issues-raw/mrshappy0/mini-mealie.svg?style=for-the-badge
[issues-url]: https://github.com/mrshappy0/mini-mealie/issues
[license-shield]: https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=for-the-badge
[license-url]: https://github.com/mrshappy0/mini-mealie/blob/main/LICENSE
[coverage-shield]: https://img.shields.io/endpoint?url=https://adam-shappy.com/mini-mealie/coverage-badge.json&style=for-the-badge
[coverage-url]: https://adam-shappy.com/mini-mealie/coverage-badge.json
[conventional-commits-shield]: https://img.shields.io/badge/Conventional%20Commits-enabled-%23FE5196?logo=conventionalcommits&logoColor=white&style=for-the-badge
[conventional-commits-url]: https://conventionalcommits.org/
[coffee-shield]: https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FF813F.svg?style=for-the-badge&logo=buy-me-a-coffee
[release-shield]: https://img.shields.io/github/actions/workflow/status/mrshappy0/mini-mealie/release.yml?branch=main&style=for-the-badge&label=release
[release-url]: https://github.com/mrshappy0/mini-mealie/actions/workflows/release.yml
[discussions-url]: https://github.com/mrshappy0/mini-mealie/discussions
[chrome-web-store-shield]: https://img.shields.io/chrome-web-store/v/lchfnbjpjoeejalacnpjnafenacmdocc.svg?style=for-the-badge
[chrome-web-store-url]: https://chromewebstore.google.com/detail/mini-mealie/lchfnbjpjoeejalacnpjnafenacmdocc
