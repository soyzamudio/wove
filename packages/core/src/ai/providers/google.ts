import { GoogleGenAI } from "@google/genai";
import { ToolError } from "../../tools/registry";
import { missingKey, type AiGenerateRequest, type AiProviderClient, type AiProviderOptions, type AiStreamEvent } from "../provider";

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
