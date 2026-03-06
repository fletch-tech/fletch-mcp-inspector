/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISABLE_POSTHOG_LOCAL: string;
  readonly VITE_DOCKER?: string;
  readonly VITE_RUNTIME?: string;
  readonly VITE_MCPJAM_HOSTED_MODE?: string;
  readonly VITE_MAIN_URL?: string;
  readonly VITE_CONVEX_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
