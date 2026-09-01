import OpenAI from "openai";
import { ToolError } from "../../tools/registry";
import {
  missingKey,
  type AiChatEvent, type AiChatRequest, type AiGenerateRequest, type AiProviderClient,
  type AiProviderOptions, type AiStreamEvent, type ProviderChatMessage,
} from "../provider";
import { ToolNameMap } from "../toolnames";

/** Neutral messages → OpenAI chat messages. Tool results become their own `role: "tool"` turns. */
function toOpenAiMessages(messages: ProviderChatMessage[], names: ToolNameMap): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam);
      continue;
    }
    const text = m.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("");
    const toolUses = m.content.filter((p) => p.type === "toolUse") as Extract<ProviderChatMessage["content"], any[]>[number][];
    const results = m.content.filter((p) => p.type === "toolResult");

    if (m.role === "assistant") {
      const calls = toolUses.map((p: any) => ({
        id: p.id,
        type: "function" as const,
        function: { name: names.toWire(p.name), arguments: JSON.stringify(p.input ?? {}) },
      }));
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      } as OpenAI.Chat.ChatCompletionMessageParam);
    } else if (text) {
      out.push({ role: "user", content: text });
    }
    for (const r of results as any[]) {
      out.push({ role: "tool", tool_call_id: r.id, content: r.content });
    }
  }
  return out;
}

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
    async *chatStream(req: AiChatRequest): AsyncIterable<AiChatEvent> {
      const names = new ToolNameMap(req.tools.map((t) => t.name));
      // id -> partial call, accumulated across `tool_calls` deltas.
      const calls = new Map<number, { id: string; name: string; args: string }>();
      let usage = { inputTokens: 0, outputTokens: 0 };
      let stopReason: "end" | "tool_use" = "end";
      try {
        const s = await client.chat.completions.create({
          model,
          max_completion_tokens: req.maxTokens,
          messages: [{ role: "system", content: req.system }, ...toOpenAiMessages(req.messages, names)],
          ...(req.tools.length
            ? {
                tools: req.tools.map((t) => ({
                  type: "function" as const,
                  function: { name: names.toWire(t.name), description: t.description, parameters: t.parameters },
                })),
              }
            : {}),
          stream: true,
          stream_options: { include_usage: true },
        });
        for await (const chunk of s) {
          const choice = chunk.choices?.[0];
          const text = choice?.delta?.content;
          if (text) yield { type: "token", text };
          for (const d of choice?.delta?.tool_calls ?? []) {
            const slot = calls.get(d.index) ?? { id: "", name: "", args: "" };
            if (d.id) slot.id = d.id;
            if (d.function?.name) slot.name += d.function.name;
            if (d.function?.arguments) slot.args += d.function.arguments;
            calls.set(d.index, slot);
          }
          if (choice?.finish_reason === "tool_calls") stopReason = "tool_use";
          if (chunk.usage) {
            usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 };
          }
        }
      } catch (e) {
        throw mapError(e, label);
      }
      for (const [index, call] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
        let input: unknown = {};
        try {
          input = call.args ? JSON.parse(call.args) : {};
        } catch {
          input = {};
        }
        yield { type: "toolUse", id: call.id || `call_${index}`, name: names.fromWire(call.name), input };
      }
      if (calls.size) stopReason = "tool_use";
      yield { type: "done", usage, stopReason };
    },

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
