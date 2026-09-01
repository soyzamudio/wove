/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly AGENTPRESS_API_URL?: string;
  readonly MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
