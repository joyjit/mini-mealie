/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Built-in WXT/Vite env vars
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;

    // Custom Mealie dev environment vars
    readonly WXT_MEALIE_SERVER?: string;
    readonly WXT_MEALIE_API_TOKEN?: string;
    readonly WXT_MEALIE_USERNAME?: string;

    /** When `"true"`, enables miniDebug / miniDebugTrace (rebuild required). */
    readonly WXT_DEBUG_EXTENSION?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
