import type { AiProvider } from "@wove/sdk";

/**
 * Default model per provider, pre-filled when the provider is chosen/changed and no
 * model is set. Ids verified against each vendor's public model docs (see report).
 * `openai-compatible` has no sensible default — the user must type one.
 */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5.6",
  google: "gemini-3.7-flash",
  xai: "grok-4.6",
  "openai-compatible": "",
};

export const DEFAULT_PROVIDER: AiProvider = "anthropic";

/** Fallback token budget for a single generation. */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Built-in model suggestions per provider, so the admin can offer choices before a key
 * exists (every hosted provider's list-models endpoint is authenticated). When a key is
 * present, `ai.models` merges the live list on top of these. Any id can still be typed.
 */
export const KNOWN_MODELS: Record<AiProvider, { id: string; name: string | null }[]> = {
  anthropic: [
    { id: "claude-opus-5", name: "Claude Opus 5" },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
    { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-5.6", name: "GPT-5.6" },
    { id: "gpt-5.6-mini", name: "GPT-5.6 mini" },
    { id: "gpt-5", name: "GPT-5" },
    { id: "gpt-5-mini", name: "GPT-5 mini" },
  ],
  google: [
    { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (preview)" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  ],
  xai: [
    { id: "grok-4.6", name: "Grok 4.6" },
    { id: "grok-4", name: "Grok 4" },
  ],
  "openai-compatible": [],
};
