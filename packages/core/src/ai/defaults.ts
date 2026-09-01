import type { AiProvider } from "@agentpress/sdk";

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
