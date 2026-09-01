import { GoogleGenAI } from "@google/genai";
import { ToolError } from "../../tools/registry";
import {
  missingKey,
  type AiChatEvent, type AiChatRequest, type AiGenerateRequest, type AiProviderClient,
  type AiProviderOptions, type AiStreamEvent, type ProviderChatMessage,
} from "../provider";
import { ToolNameMap } from "../toolnames";

/** Neutral messages → Gemini `contents`. Assistant is "model"; tool results are functionResponse parts. */
function toGoogleContents(messages: ProviderChatMessage[], names: ToolNameMap): any[] {
  const out: any[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      out.push({ role, parts: [{ text: m.content }] });
      continue;
    }
    const parts: any[] = [];
    for (const p of m.content) {
      if (p.type === "text") parts.push({ text: p.text });
      else if (p.type === "toolUse") parts.push({ functionCall: { id: p.id, name: names.toWire(p.name), args: (p.input ?? {}) as object } });
      else parts.push({ functionResponse: { id: p.id, name: p.id, response: { result: p.content } } });
    }
    if (parts.length) out.push({ role, parts });
  }
  return out;
}

function mapError(e: unknown): ToolError {
  if (e instanceof ToolError) return e;
  const message = (e as Error)?.message ?? "Google request failed";
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(message)) {
    return new ToolError("forbidden", "Google rejected the API key: invalid API key");
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|rate limit/i.test(message)) {
    return new ToolError("conflict", "Google rate limited this request — retry shortly");
  }
  if (status === 404 || /NOT_FOUND/i.test(message)) return new ToolError("not_found", `Google: ${message}`);
  return new ToolError("conflict", `Google API error: ${message}`);
}

export function createGoogleClient(opts: AiProviderOptions): AiProviderClient {
  if (!opts.apiKey) missingKey("google");
  const client = new GoogleGenAI({ apiKey: opts.apiKey });
  const model = opts.model;

  const params = (req: AiGenerateRequest) => ({
    model,
    contents: req.prompt,
    config: {
      systemInstruction: req.system,
      maxOutputTokens: req.maxTokens,
    },
  });

  const tokens = (meta: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined) => ({
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
  });

  return {
    async *chatStream(req: AiChatRequest): AsyncIterable<AiChatEvent> {
      const names = new ToolNameMap(req.tools.map((t) => t.name));
      // functionResponse must echo the *declared* name, so remember it per call id.
      const callNames = new Map<string, string>();
      for (const m of req.messages) {
        if (typeof m.content === "string") continue;
        for (const p of m.content) if (p.type === "toolUse") callNames.set(p.id, names.toWire(p.name));
      }
      const contents = toGoogleContents(req.messages, names).map((c) => ({
        ...c,
        parts: c.parts.map((p: any) =>
          p.functionResponse ? { functionResponse: { ...p.functionResponse, name: callNames.get(p.functionResponse.id) ?? p.functionResponse.name } } : p,
        ),
      }));

      const uses: { id: string; name: string; input: unknown }[] = [];
      let usage = { inputTokens: 0, outputTokens: 0 };
      try {
        const s = await client.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: req.system,
            maxOutputTokens: req.maxTokens,
            ...(req.tools.length
              ? {
                  tools: [
                    {
                      functionDeclarations: req.tools.map((t) => ({
                        name: names.toWire(t.name),
                        description: t.description,
                        parameters: t.parameters as any,
                      })),
                    },
                  ],
                }
              : {}),
          },
        });
        let n = 0;
        for await (const chunk of s) {
          if (chunk.text) yield { type: "token", text: chunk.text };
          for (const call of chunk.functionCalls ?? []) {
            uses.push({ id: call.id ?? `call_${n++}`, name: names.fromWire(call.name ?? ""), input: call.args ?? {} });
          }
          if (chunk.usageMetadata) usage = tokens(chunk.usageMetadata);
        }
      } catch (e) {
        throw mapError(e);
      }
      for (const u of uses) yield { type: "toolUse", ...u };
      yield { type: "done", usage, stopReason: uses.length ? "tool_use" : "end" };
    },

    async generate(req) {
      try {
        const res = await client.models.generateContent(params(req));
        return { text: res.text ?? "", model, usage: tokens(res.usageMetadata) };
      } catch (e) {
        throw mapError(e);
      }
    },

    async *stream(req): AsyncIterable<AiStreamEvent> {
      try {
        const s = await client.models.generateContentStream(params(req));
        let usage = { inputTokens: 0, outputTokens: 0 };
        for await (const chunk of s) {
          if (chunk.text) yield { type: "token", text: chunk.text };
          if (chunk.usageMetadata) usage = tokens(chunk.usageMetadata);
        }
        yield { type: "done", model, usage };
      } catch (e) {
        throw mapError(e);
      }
    },

    async listModels() {
      try {
        const out: { id: string; name: string | null }[] = [];
        const page = await client.models.list();
        for await (const m of page) {
          const id = (m.name ?? "").replace(/^models\//, "");
          if (id) out.push({ id, name: m.displayName ?? null });
        }
        return out;
      } catch (e) {
        throw mapError(e);
      }
    },
  };
}
