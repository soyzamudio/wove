import type { AiProvider } from "@wove/sdk";
import { badRequest } from "../tools/registry";
import { envVarFor } from "./keys";

export interface AiGenerateRequest {
  system: string;
  prompt: string;
  maxTokens: number;
}

export interface AiUsageTokens {
  inputTokens: number;
  outputTokens: number;
}

export interface AiGenerateResult {
  text: string;
  usage: AiUsageTokens;
  model: string;
}

export type AiStreamEvent =
  | { type: "token"; text: string }
  | { type: "done"; usage: AiUsageTokens; model: string };

export interface AiProviderClient {
  generate(req: AiGenerateRequest): Promise<AiGenerateResult>;
  stream(req: AiGenerateRequest): AsyncIterable<AiStreamEvent>;
  listModels(): Promise<{ id: string; name: string | null }[]>;
}

export interface AiProviderOptions {
  provider: AiProvider;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
}

export type ProviderFactory = (opts: AiProviderOptions) => AiProviderClient | Promise<AiProviderClient>;

/** Thrown when nothing can serve the request — actionable on purpose. */
export function missingKey(provider: AiProvider): never {
  throw badRequest(
    `No API key configured for provider ${provider}. Add one under Settings → AI or set ${envVarFor(provider)}.`,
  );
}

const defaultFactory: ProviderFactory = async (opts) => {
  switch (opts.provider) {
    case "anthropic":
      return (await import("./providers/anthropic")).createAnthropicClient(opts);
    case "google":
      return (await import("./providers/google")).createGoogleClient(opts);
    case "openai":
    case "xai":
    case "openai-compatible":
      return (await import("./providers/openai")).createOpenAiClient(opts);
  }
};

let factory: ProviderFactory = defaultFactory;

/** Test seam: swap in a fake provider. Returns a restore function. */
export function setProviderFactory(f: ProviderFactory | null): () => void {
  const prev = factory;
  factory = f ?? defaultFactory;
  return () => {
    factory = prev;
  };
}

export function createProviderClient(opts: AiProviderOptions): Promise<AiProviderClient> {
  return Promise.resolve(factory(opts));
}
