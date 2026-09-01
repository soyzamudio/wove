import Anthropic from "@anthropic-ai/sdk";
import { ToolError } from "../../tools/registry";
import { missingKey, type AiGenerateRequest, type AiProviderClient, type AiProviderOptions, type AiStreamEvent } from "../provider";

/** Map the SDK's typed errors onto ToolError codes so the HTTP layer stays JSON. */
function mapError(e: unknown): ToolError {
  if (e instanceof Anthropic.AuthenticationError) return new ToolError("forbidden", "Anthropic rejected the API key: invalid API key");
  if (e instanceof Anthropic.PermissionDeniedError) return new ToolError("forbidden", "Anthropic denied this request (check the key's permissions)");
  if (e instanceof Anthropic.RateLimitError) return new ToolError("conflict", "Anthropic rate limited this request — retry shortly");
  if (e instanceof Anthropic.NotFoundError) return new ToolError("not_found", `Anthropic: ${(e as Error).message}`);
  if (e instanceof Anthropic.APIError) return new ToolError("conflict", `Anthropic API error: ${(e as Error).message}`);
  if (e instanceof ToolError) return e;
  return new ToolError("internal_error", (e as Error)?.message ?? "Anthropic request failed");
}

const refusal = () =>
  new ToolError("conflict", "The model declined to produce this content (refusal). Try rephrasing the prompt.");

export function createAnthropicClient(opts: AiProviderOptions): AiProviderClient {
  if (!opts.apiKey) missingKey("anthropic");
  const client = new Anthropic({ apiKey: opts.apiKey, ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}) });
  const model = opts.model;

  /** Shared request body. No temperature/top_p: unsupported alongside adaptive thinking. */
  const body = (req: AiGenerateRequest) => ({
    model,
    max_tokens: req.maxTokens,
    thinking: { type: "adaptive" as const },
    system: req.system,
    messages: [{ role: "user" as const, content: req.prompt }],
  });

  return {
    async generate(req) {
      try {
        const res = await client.messages.stream(body(req)).finalMessage();
        if (res.stop_reason === "refusal") throw refusal();
        const text = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        return {
          text,
          model: res.model ?? model,
          usage: { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 },
        };
      } catch (e) {
        throw mapError(e);
      }
    },

    async *stream(req): AsyncIterable<AiStreamEvent> {
      const s = client.messages.stream(body(req));
      try {
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "token", text: event.delta.text };
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") throw refusal();
        yield {
          type: "done",
          model: final.model ?? model,
          usage: { inputTokens: final.usage?.input_tokens ?? 0, outputTokens: final.usage?.output_tokens ?? 0 },
        };
      } catch (e) {
        throw mapError(e);
      }
    },

    async listModels() {
      try {
        const out: { id: string; name: string | null }[] = [];
        for await (const m of client.models.list()) out.push({ id: m.id, name: m.display_name ?? null });
        return out;
      } catch (e) {
        throw mapError(e);
      }
    },
  };
}
