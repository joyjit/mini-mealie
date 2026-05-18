import { getToolbarAction } from './extensionToolbar';

/**
 * Shows a badge with the given text for a specified duration.
 * @param text - The text to display on the badge (e.g., ✅ or ❌).
 * @param duration - Optional duration in seconds.
 */
export const showBadge = (text: string, duration?: number) => {
    const action = getToolbarAction();
    // TODO: investigate if should be awaited
    void action?.setBadgeText?.({ text });

    // Clear badge after the specified duration (in seconds) if duration provided
    if (duration) {
        setTimeout(() => {
            clearBadge();
        }, duration * 1000);
    }
};

export const clearBadge = () => {
    const action = getToolbarAction();
    // TODO: investigate if should be awaited
    void action?.setBadgeText?.({ text: '' });
};
