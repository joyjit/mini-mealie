import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Chromium-only Playwright config. Firefox E2E lives in `e2e-geckodriver/`.
 * Trigger modes: `E2E_TRIGGER=keyboard` (Ctrl+Shift+M, default), `message`, or `context-menu`.
 */
export default defineConfig({
    testDir: __dirname,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    timeout: 180_000,
    expect: { timeout: 60_000 },
    reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }]],
    use: {
        ...devices['Desktop Chrome'],
        trace: 'on-first-retry',
    },
});
