/**
 * Tiny Playwright↔Chrome smoke for the chrome-latest canary leg.
 *
 * Launches Google Chrome (or whatever PLAYWRIGHT_CHROME_CHANNEL names) with no extension and
 * no suite — if this fails, treat the red leg as tooling/compat, not product behavior.
 * See docs/developers-guide/e2e-testing.md (Canary) and issue #183.
 */
import { chromium } from '@playwright/test';

const channel = process.env.PLAYWRIGHT_CHROME_CHANNEL?.trim() || 'chrome';

const browser = await chromium.launch({ channel });
const page = await browser.newPage();
await page.goto('about:blank');
const title = await page.title();
await browser.close();

console.log(`chrome-channel-smoke ok: channel=${channel} title=${JSON.stringify(title)}`);
