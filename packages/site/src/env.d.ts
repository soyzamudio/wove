/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly WOVE_API_URL?: string;
  readonly MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
