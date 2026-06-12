import { MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE } from '../utils/e2eMessaging';

import { test, expect } from './fixtures';
import { waitForRecipeMatchingUrl } from './mealie-api';

const mealieServer = process.env.E2E_MEALIE_SERVER?.trim();
const mealieToken = process.env.E2E_MEALIE_TOKEN?.trim();

const recipePageUrl =
    process.env.E2E_RECIPE_URL?.trim() ??
    'https://www.allrecipes.com/recipe/269394/pistachio-crusted-salmon/';

/** `keyboard` → Ctrl+Shift+M on the recipe tab (manifest command). `message` → internal E2E `runtime.sendMessage`. `context-menu` → simulate context menu click via background dispatch. */
function getTriggerMode(): 'keyboard' | 'message' | 'context-menu' {
    const t = process.env.E2E_TRIGGER?.trim().toLowerCase();
    if (t === 'message') return 'message';
    if (t === 'context-menu') return 'context-menu';
    return 'keyboard';
}

test.describe('Mini Mealie E2E (Level 3)', () => {
    test.beforeEach(({}, testInfo) => {
        testInfo.skip(
            !mealieServer || !mealieToken,
            'Set E2E_MEALIE_SERVER and E2E_MEALIE_TOKEN. Default browser: Firefox (`pnpm test:e2e`). Optional Chromium: E2E_BROWSER=chromium / `pnpm test:e2e:chromium`. Trigger: E2E_TRIGGER=keyboard|message|context-menu.',
        );
    });

    test('load extension, drive recipe page + popup, import, assert GET /api/recipes items', async ({
        context,
        extensionBridgePage,
        backgroundContext,
        request,
    }) => {
        await extensionBridgePage.evaluate(
            async ({
                server,
                token,
                mode,
            }: {
                server: string;
                token: string;
                mode: 'url' | 'html';
            }) => {
                await new Promise<void>((resolve, reject) => {
                    chrome.storage.sync.set(
                        {
                            mealieServer: server,
                            mealieApiToken: token,
                            recipeCreateMode: mode,
                            importTags: true,
                            importCategories: true,
                            openAfterImport: false,
                        },
                        () => {
                            const err = chrome.runtime.lastError;
                            if (err) reject(err);
                            else resolve();
                        },
                    );
                });
            },
            {
                server: mealieServer!,
                token: mealieToken!,
                mode: (process.env.E2E_IMPORT_MODE === 'url' ? 'url' : 'html') as 'url' | 'html',
            },
        );

        const recipePage = await context.newPage();
        await recipePage.goto(recipePageUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });

        await recipePage.waitForTimeout(process.env.CI ? 8000 : 4000);

        const trigger = getTriggerMode();
        if (trigger === 'keyboard') {
            await recipePage.bringToFront();
            await recipePage.keyboard.press('ControlOrMeta+Shift+M');
        } else if (trigger === 'context-menu') {
            const tabUrl = recipePage.url();
            // Simulate the context menu click by dispatching the event in the background script.
            // This follows the Gemini advice to bypass native UI automation.
            await (backgroundContext as any).evaluate(
                ({ menuItemId, pageUrl }: { menuItemId: string; pageUrl: string }) => {
                    // @ts-ignore
                    const browserObj = typeof browser !== 'undefined' ? browser : chrome;
                    browserObj.contextMenus.onClicked.dispatch(
                        {
                            menuItemId,
                            pageUrl,
                            editable: false,
                            modifiers: [],
                        },
                        {
                            id: 1,
                            url: pageUrl,
                        },
                    );
                },
                {
                    menuItemId: 'save-to-mini-mealie',
                    pageUrl: tabUrl,
                },
            );
        } else {
            const tabUrl = recipePage.url();
            const ack = await extensionBridgePage.evaluate(
                async ([type, matchUrl]) => {
                    return await new Promise<{ ok?: boolean; error?: string }>((resolve, reject) => {
                        chrome.runtime.sendMessage(
                            { type, matchUrl },
                            (r: { ok?: boolean; error?: string } | undefined) => {
                                const err = chrome.runtime.lastError;
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve(r ?? {});
                            },
                        );
                    });
                },
                [MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE, tabUrl] as const,
            );
            expect(ack.ok).toBe(true);
        }

        // Match on orgURL (the recipe's source URL) rather than slug. Mealie appends
        // `-1`, `-2`, … to duplicate slugs, so re-running the test against the same
        // recipe would otherwise fail even when the import succeeded. orgURL is
        // stable across re-imports.
        const hit = await waitForRecipeMatchingUrl({
            request,
            mealieBase: mealieServer!,
            token: mealieToken!,
            pageUrl: recipePage.url(),
            timeoutMs: 120_000,
        });
        expect(hit.slug).toBeTruthy();

        await recipePage.close();
    });
});
