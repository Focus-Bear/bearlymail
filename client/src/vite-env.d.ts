/// <reference types="vite/client" />

// Global constants injected by vite.config.ts `define` at build time.
declare const __COMMIT_HASH__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_PUSHER_KEY?: string;
  readonly VITE_PUSHER_CLUSTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
