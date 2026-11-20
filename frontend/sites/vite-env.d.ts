/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITES_FUNCTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
