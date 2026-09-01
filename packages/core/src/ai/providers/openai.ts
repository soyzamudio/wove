import OpenAI from "openai";
import { ToolError } from "../../tools/registry";
import { missingKey, type AiGenerateRequest, type AiProviderClient, type AiProviderOptions, type AiStreamEvent } from "../provider";

export const XAI_BASE_URL = "https://api.x.ai/v1";

function mapError(e: unknown, label: string): ToolError {
  if (e instanceof OpenAI.AuthenticationError) return new ToolError("forbidden", `Invalid API key — ${label} rejected it.`);
  if (e instanceof OpenAI.PermissionDeniedError) return new ToolError("forbidden", `Request denied by ${label} (check the key's permissions).`);
  if (e instanceof OpenAI.RateLimitError) return new ToolError("conflict", `Rate limited by ${label} — retry shortly.`);
  if (e instanceof OpenAI.NotFoundError) return new ToolError("not_found", `Not found at ${label}: ${(e as Error).message}`);
  if (e instanceof OpenAI.APIConnectionError) return new ToolError("conflict", `Could not reach ${label}: ${(e as Error).message}`);
  if (e instanceof OpenAI.APIError) return new ToolError("conflict", `API error from ${label}: ${(e as Error).message}`);
  if (e instanceof ToolError) return e;
  return new ToolError("internal_error", (e as Error)?.message ?? `${label} request failed`);
}

/** Serves `openai`, `xai` (OpenAI-compatible endpoint) and any `openai-compatible` base URL. */
export function createOpenAiClient(opts: AiProviderOptions): AiProviderClient {
  const label = opts.provider === "xai" ? "xAI" : opts.provider === "openai" ? "OpenAI" : "the OpenAI-compatible endpoint";

  const baseURL =
    opts.provider === "xai" ? XAI_BASE_URL : opts.provider === "openai-compatible" ? opts.baseUrl ?? undefined : opts.baseUrl ?? undefined;

  if (opts.provider === "openai-compatible" && !baseURL) {
    throw new ToolError("validation_error", "openai-compatible requires a baseUrl (e.g. http://localhost:11434/v1).");
  }
  // Local runtimes (Ollama, LM Studio) accept any key; only the hosted providers truly need one.
  if (!opts.apiKey && opts.provider !== "openai-compatible") missingKey(opts.provider);

  const client = new OpenAI({
    apiKey: opts.apiKey ?? "not-needed",
    ...(baseURL ? { baseURL } : {}),
  });
  const model = opts.model;

  const messages = (req: AiGenerateRequest): OpenAI.Chat.ChatCompletionMessageParam[] => [
    { role: "system", content: req.system },
    { role: "user", content: req.prompt },
  ];

  return {
    async generate(req) {
      try {
        const res = await client.chat.completions.create({
          model,
          max_completion_tokens: req.maxTokens,
          messages: messages(req),
        });
        return {
          text: res.choices[0]?.message?.content ?? "",
          model: res.model ?? model,
          usage: {
            inputTokens: res.usage?.prompt_tokens ?? 0,
            outputTokens: res.usage?.completion_tokens ?? 0,
          },
        };
      } catch (e) {
        throw mapError(e, label);
      }
    },

    async *stream(req): AsyncIterable<AiStreamEvent> {
      try {
        const s = await client.chat.completions.create({
          model,
          max_completion_tokens: req.maxTokens,
          messages: messages(req),
          stream: true,
          stream_options: { include_usage: true },
        });
        let inputTokens = 0;
        let outputTokens = 0;
        let seenModel = model;
        for await (const chunk of s) {
          if (chunk.model) seenModel = chunk.model;
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) yield { type: "token", text };
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0;
            outputTokens = chunk.usage.completion_tokens ?? 0;
          }
        }
        yield { type: "done", model: seenModel, usage: { inputTokens, outputTokens } };
      } catch (e) {
        throw mapError(e, label);
      }
    },

    async listModels() {
      try {
        const res = await client.models.list();
        return res.data.map((m) => ({ id: m.id, name: null }));
      } catch (e) {
        // A compatible endpoint may not implement /models at all — that is not an error.
        if (opts.provider === "openai-compatible") return [];
        throw mapError(e, label);
      }
    },
  };
}
