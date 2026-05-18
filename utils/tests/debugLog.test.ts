import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Note on coverage strategy:
// `VERBOSE` is captured at module-load time from `import.meta.env`. Under
// `MODE=test` it is always false (by design — keeps test output quiet). To
// exercise the verbose path we stub the env, then `vi.resetModules()` and
// re-import so the module re-evaluates the const with the stubbed values.

describe('debugLog (VERBOSE = false — default test mode)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('isVerboseExtensionDebug returns false', async () => {
        const { isVerboseExtensionDebug } = await import('../debugLog');
        expect(isVerboseExtensionDebug()).toBe(false);
    });

    it('miniDebug is a no-op (does not call console.debug)', async () => {
        const { miniDebug } = await import('../debugLog');
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        miniDebug('scope', 'message', { foo: 'bar' });
        miniDebug('scope', 'no-data');
        expect(spy).not.toHaveBeenCalled();
    });

    it('miniDebugTrace resolves without calling logEvent', async () => {
        vi.doMock('../logging', () => ({ logEvent: vi.fn() }));
        vi.resetModules();
        const { miniDebugTrace } = await import('../debugLog');
        const logging = await import('../logging');
        await miniDebugTrace('action', 'message', { ctx: 1 });
        expect(logging.logEvent).not.toHaveBeenCalled();
        vi.doUnmock('../logging');
        vi.resetModules();
    });
});

describe('debugLog (VERBOSE = true — env-forced)', () => {
    beforeEach(() => {
        // Bypass the test-mode guard so VERBOSE captures as true on re-import.
        vi.stubEnv('MODE', 'development');
        vi.stubEnv('DEV', true);
        vi.stubEnv('WXT_DEBUG_EXTENSION', 'true');
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('isVerboseExtensionDebug returns true', async () => {
        const { isVerboseExtensionDebug } = await import('../debugLog');
        expect(isVerboseExtensionDebug()).toBe(true);
    });

    it('miniDebug emits console.debug with prefix and data when data is non-empty', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const { miniDebug } = await import('../debugLog');
        miniDebug('storage', 'merged credentials', { srv: true, tok: true });
        expect(spy).toHaveBeenCalledWith('[Mini Mealie debug:storage]', 'merged credentials', {
            srv: true,
            tok: true,
        });
    });

    it('miniDebug emits console.debug without data arg when data is empty/omitted', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const { miniDebug } = await import('../debugLog');
        miniDebug('boot', 'starting');
        miniDebug('boot', 'starting empty obj', {});
        expect(spy).toHaveBeenNthCalledWith(1, '[Mini Mealie debug:boot]', 'starting');
        expect(spy).toHaveBeenNthCalledWith(2, '[Mini Mealie debug:boot]', 'starting empty obj');
    });

    it('miniDebugTrace forwards to logEvent with feature=extension-debug, level=debug', async () => {
        const logEvent = vi.fn(() => Promise.resolve());
        vi.doMock('../logging', () => ({ logEvent }));
        vi.resetModules();
        const { miniDebugTrace } = await import('../debugLog');
        await miniDebugTrace('credential-merge', 'sync backfilled', { hadPartialSync: true });
        expect(logEvent).toHaveBeenCalledWith({
            level: 'debug',
            feature: 'extension-debug',
            action: 'credential-merge',
            message: 'sync backfilled',
            data: { hadPartialSync: true },
        });
        vi.doUnmock('../logging');
    });
});
