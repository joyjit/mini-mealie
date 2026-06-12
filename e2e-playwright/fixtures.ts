import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/**
 * Chromium E2E fixture.
 *
 * Firefox E2E lives in `e2e-geckodriver/` (Selenium + non-snap geckodriver +
 * `install_addon(temporary=True)`) — Playwright cannot install unsigned MV3
 * add-ons in Firefox in this environment.
 */
function chromiumExtensionDir(): string {
    const fromEnv = process.env.E2E_CHROME_EXTENSION_PATH?.trim();
    if (fromEnv) return path.resolve(repoRoot, fromEnv);
    return path.join(repoRoot, '.output/chrome-mv3');
}

export type MiniMealieFixtures = {
    context: BrowserContext;
    /** `chrome-extension://…` without trailing slash */
    extensionOrigin: string;
    /** Extension popup — same APIs as toolbar popup; used for storage + `runtime.sendMessage` */
    extensionBridgePage: Page;
    /** Background service worker */
    backgroundContext: { evaluate: (fn: Function, ...args: any[]) => Promise<any> };
};

export const test = base.extend<MiniMealieFixtures>({
    context: async ({}, use) => {
        const pathToExtension = chromiumExtensionDir();
        // Mirrors Chrome's `--load-extension=…` flow (Playwright "Chrome extensions" pattern).
        const browserContext = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
            ],
        });
        await use(browserContext);
        await browserContext.close();
    },

    extensionOrigin: async ({ context }, use) => {
        let [worker] = context.serviceWorkers();
        if (!worker) {
            worker = await context.waitForEvent('serviceworker');
        }
        const id = worker.url().split('/')[2];
        if (!id) {
            throw new Error(`Could not parse chrome-extension id from ${worker.url()}`);
        }
        await use(`chrome-extension://${id}`);
    },

    extensionBridgePage: async ({ context, extensionOrigin }, use) => {
        const page = await context.newPage();
        await page.goto(`${extensionOrigin}/popup.html`, { waitUntil: 'domcontentloaded' });
        await use(page);
        await page.close();
    },

    backgroundContext: async ({ context }, use) => {
        let [worker] = context.serviceWorkers();
        if (!worker) {
            worker = await context.waitForEvent('serviceworker');
        }
        await use(worker as any);
    },
});

export const expect = test.expect;
