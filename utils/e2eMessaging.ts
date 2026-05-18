/**
 * Internal `chrome.runtime.sendMessage` type used by Playwright (moz-extension pages only).
 * Invokes the same `runCreateRecipe(tab)` path as the context-menu item `runCreateRecipe`.
 * Not reachable from normal web pages.
 */
export const MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE =
    'mini-mealie/e2e/run-create-recipe' as const;
