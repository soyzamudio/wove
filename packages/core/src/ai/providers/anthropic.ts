import Anthropic from "@anthropic-ai/sdk";
import { ToolError } from "../../tools/registry";
import {
  missingKey,
  type AiChatEvent, type AiChatRequest, type AiGenerateRequest, type AiProviderClient,
  type AiProviderOptions, type AiStreamEvent, type ProviderChatMessage,
} from "../provider";

/**
 * Our neutral message shape → Anthropic content blocks. Anthropic requires every
 * `tool_result` for one assistant turn to arrive in a SINGLE user message, in the order
 * the `tool_use` blocks were emitted — the loop already builds them that way, so a
 * one-to-one mapping preserves it.
 */
function toAnthropicMessages(messages: ProviderChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const content = m.content.map((part): Anthropic.ContentBlockParam => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "toolUse":
          return { type: "tool_use", id: part.id, name: part.name, input: (part.input ?? {}) as object };
        case "toolResult":
          return { type: "tool_result", tool_use_id: part.id, content: part.content, ...(part.isError ? { is_error: true } : {}) };
      }
    });
    return { role: m.role, content };
  });
}

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
    async *chatStream(req: AiChatRequest): AsyncIterable<AiChatEvent> {
      const s = client.messages.stream({
        model,
        max_tokens: req.maxTokens,
        thinking: { type: "adaptive" as const },
        system: req.system,
        ...(req.tools.length
          ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })) }
          : {}),
        messages: toAnthropicMessages(req.messages),
      });
      let final: Anthropic.Message;
      try {
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "token", text: event.delta.text };
          }
        }
        final = await s.finalMessage();
        if (final.stop_reason === "refusal") throw refusal();
      } catch (e) {
        throw mapError(e);
      }
      // Tool calls are emitted once the turn is complete; the loop only acts on whole calls.
      for (const block of final.content) {
        if (block.type === "tool_use") yield { type: "toolUse", id: block.id, name: block.name, input: block.input };
      }
      yield {
        type: "done",
        usage: { inputTokens: final.usage?.input_tokens ?? 0, outputTokens: final.usage?.output_tokens ?? 0 },
        stopReason: final.stop_reason === "tool_use" ? "tool_use" : "end",
      };
    },

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
