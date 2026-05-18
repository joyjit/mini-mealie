/**
 * Manifest V3 exposes toolbar APIs on `chrome.action` (Chrome and Firefox).
 */
export function getToolbarAction(): typeof chrome.action | undefined {
    if (typeof chrome === 'undefined') return undefined;
    return chrome.action;
}

/** Opens the extension popup from the background/service worker when the browser allows it. */
export function openToolbarPopup(): void {
    if (typeof chrome === 'undefined') return;
    const action = chrome.action as { openPopup?: () => void } | undefined;
    action?.openPopup?.();
}
