import { logEvent } from './logging';

/**
 * Opt-in verbose debugging for extension internals (Firefox parity troubleshooting).
 *
 * Enable via either:
 * - Development builds (`import.meta.env.DEV`), or
 * - `.env.local`: `WXT_DEBUG_EXTENSION=true` then rebuild (`pnpm dev:firefox` / `pnpm build:firefox`).
 *
 * Outputs use console.debug with prefix `[Mini Mealie debug:<scope>]`.
 * Optional `miniDebugTrace` writes level `debug` rows into Activity Logs (feature `extension-debug`).
 */

const VERBOSE =
    import.meta.env.MODE !== 'test' &&
    (import.meta.env.DEV ||
        String(import.meta.env.WXT_DEBUG_EXTENSION ?? '').toLowerCase() === 'true');

/** Useful when branching UX based on verbose mode (rare). */
export function isVerboseExtensionDebug(): boolean {
    return VERBOSE;
}

/** Cheap console breadcrumbs — avoids noisy logs when verbose mode is off. */
export function miniDebug(scope: string, message: string, data?: Record<string, unknown>): void {
    if (!VERBOSE) return;
    const prefix = `[Mini Mealie debug:${scope}]`;
    if (data && Object.keys(data).length > 0) {
        console.debug(prefix, message, data);
    } else {
        console.debug(prefix, message);
    }
}

/** Persist sparse breadcrumbs to the Activity Logs ring buffer (only when verbose). */
export async function miniDebugTrace(
    action: string,
    message: string,
    data?: Record<string, unknown>,
): Promise<void> {
    if (!VERBOSE) return;
    await logEvent({
        level: 'debug',
        feature: 'extension-debug',
        action,
        message,
        data,
    });
}
