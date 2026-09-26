/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_OPEN_SOURCE_NOTICE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
