import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react'],
    /**
     * WXT cannot auto-open Firefox when targeting MV3 (see wxt-dev/wxt#230). `pnpm dev:firefox`
     * sets `WXT_WEB_EXT_DISABLED=true` so the dev server runs; load `.output/firefox-mv3-dev/`
     * manually from about:debugging.
     */
    webExt: {
        disabled: process.env.WXT_WEB_EXT_DISABLED === 'true',
    },
    manifest: ({ browser }) => ({
        // `tabs`: reliable `tab.url` after `tabs.query` on Firefox + clearer than relying on host
        // permission edge cases alone when diagnosing missing menu / empty activity logs.
        permissions: ['storage', 'activeTab', 'contextMenus', 'scripting', 'tabs'],
        host_permissions: ['<all_urls>'],
        description: 'Scrape recipes and save them to a Mealie instance.',
        name: 'Mini Mealie',
        commands: {
            'run-create-recipe': {
                suggested_key: {
                    default: 'Ctrl+Shift+M',
                    mac: 'Command+Shift+M',
                },
                description: 'Create recipe from the active tab (same as the context menu action)',
            },
        },
        ...(browser === 'firefox'
            ? {
                  browser_specific_settings: {
                      gecko: {
                          // Required for chrome.storage.sync / browser.storage.sync under temporary
                          // loads (about:debugging). Without an explicit ID, Firefox disables sync storage.
                          // Owned namespace for this fork's AMO listing; renaming orphans every
                          // user's storage.sync scope, so treat as permanent.
                          id: 'mini-mealie-firefox@infotune.com',
                          strict_min_version: '109.0',
                      },
                  },
              }
            : {}),
    }),
    // https://wxt.dev/guide/essentials/config/auto-imports.html
    imports: {
        eslintrc: { enabled: 9 },
    },
    hooks: {
        // Chrome creates a `_metadata/` folder inside the extension output directory after
        // loading an unpacked extension. On the next build/reload Chrome then refuses to
        // load the extension with "Filenames starting with '_' are reserved for use by the
        // system." Deleting it after each build keeps the directory clean for Chrome.
        'build:done': async (wxt) => {
            await rm(join(wxt.config.outDir, '_metadata'), { recursive: true, force: true });
        },
    },
});
