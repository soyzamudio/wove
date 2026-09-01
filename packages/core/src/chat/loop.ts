import { z } from "zod";
import { ToolCatalog, type ChatMessage, type ChatToolCall } from "@wove/sdk";
import { jsonSchemaFor } from "../openapi";
import { dispatch, registry as defaultRegistry, hasScopes, type Ctx, type Registry, type Tool } from "../tools/registry";
import { readSettings } from "../tools/shared";
import type { AiSession } from "../ai/run";
import { recordUsage } from "../ai/run";
import type { AiUsageTokens, ProviderChatMessage, ProviderContentPart, ProviderToolDef } from "../ai/provider";
import { unifiedDiff } from "./diff";
import { createThread, insertMessage, listMessages, ownThread, titleFor } from "./store";

export const CHAT_TOOL = "chat.send";
export const MAX_TURNS = 12;
export const CHAT_MAX_TOKENS = 8000;
export const MAX_RESULT_CHARS = 8000;

/**
 * Tools the site chat never gets to see, whatever the actor's scopes:
 * its own plumbing, credential and bulk-data surfaces, and the audit trail it would
 * otherwise be able to read back at the user.
 */
const EXCLUDED_PREFIXES = ["chat.", "agent.", "import."];
const EXCLUDED_NAMES = new Set(["export.site", "ai.usage", "audit.list", "post.emptyTrash"]);

export function isExposed(name: string): boolean {
  if (EXCLUDED_NAMES.has(name)) return false;
  return !EXCLUDED_PREFIXES.some((p) => name.startsWith(p));
}

/** `permanent: true` is not a decision a chat agent gets to propose. */
const NARROWED_INPUT: Record<string, z.ZodTypeAny> = {
  "post.delete": z.object({ id: ToolCatalog["post.delete"].input.shape.id }),
};

export interface ExposedTool {
  tool: Tool<any, any>;
  def: ProviderToolDef;
}

/** The tool list handed to the model: exposed, in-scope, with destructive options stripped. */
export function exposedChatTools(ctx: Ctx, reg: Registry = defaultRegistry): ExposedTool[] {
  return reg
    .list()
    .filter((t) => isExposed(t.name) && hasScopes(ctx.actor, t.scopes))
    .map((t) => ({
      tool: t,
      def: {
        name: t.name,
        description: t.description,
        parameters: jsonSchemaFor(NARROWED_INPUT[t.name] ?? t.input) as Record<string, unknown>,
      },
    }));
}

export function chatSystemPrompt(ctx: Ctx, baseUrl: string): string {
  const s = readSettings(ctx.db);
  const who =
    ctx.actor.kind === "user" ? `a signed-in admin user (id ${ctx.actor.id})` : `an API agent (id ${ctx.actor.id})`;
  return [
    `You are the site assistant for '${s.siteTitle}' — ${s.tagline}. The site lives at ${baseUrl}.`,
    `Today is ${new Date().toISOString().slice(0, 10)}. You are talking to ${who}.`,
    "",
    "You operate the site through tools.",
    "- Use read tools to inspect the real state before you propose anything; never guess ids, slugs or titles.",
    "- Mutations are NOT executed when you call them: they are shown to the user as a proposal to approve. Call them anyway, then explain in plain language what each one will do.",
    "- Never claim a change has been made, and never fabricate a tool result — only state what a tool actually returned.",
    "- Keep replies short and concrete. Markdown, no preamble.",
  ].join("\n");
}

// ---------------------------------------------------------------- previews

function labelFor(input: any, old: { title?: string } | null): string | null {
  if (input && typeof input.title === "string" && input.title) return input.title;
  if (old?.title) return old.title;
  if (input && typeof input.slug === "string" && input.slug) return input.slug;
  if (input && typeof input.id === "string" && input.id) return input.id;
  return null;
}

/**
 * What the user sees on the approval card. For `post.update` we read the post first and
 * render a real before/after diff of the title and body.
 */
async function buildPreview(ctx: Ctx, reg: Registry, name: string, input: any): Promise<ChatToolCall["preview"]> {
  let old: { title: string; content: string } | null = null;
  if (name === "post.update" && input?.id) {
    const res = await dispatch("post.get", { id: input.id }, ctx, reg);
    if (res.ok) old = res.data as { title: string; content: string };
  }
  const label = labelFor(input, old);
  const title = label ? `${name}: "${label}"` : name;

  if (name !== "post.update" || !old) return { title, diff: null };
  const parts: string[] = [];
  if (typeof input.title === "string" && input.title !== old.title) {
    parts.push(unifiedDiff(old.title, input.title, "title"));
  }
  if (typeof input.content === "string" && input.content !== old.content) {
    parts.push(unifiedDiff(old.content, input.content, "content"));
  }
  const diff = parts.filter(Boolean).join("\n");
  return { title, diff: diff || null };
}

// ---------------------------------------------------------------- the loop

export type ChatStreamEvent =
  | { type: "thread"; threadId: string; title: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; call: ChatToolCall }
  | { type: "message"; message: ChatMessage }
  | { type: "done"; usage: AiUsageTokens };

const truncate = (s: string) =>
  s.length <= MAX_RESULT_CHARS ? s : `${s.slice(0, MAX_RESULT_CHARS)}\n… [truncated, ${s.length} chars total]`;

const PROPOSED_RESULT = JSON.stringify({ status: "proposed - awaiting user approval" });

/** Prior turns, replayed as plain text. Tool calls are summarised, not re-sent. */
function history(messages: ChatMessage[]): ProviderChatMessage[] {
  return messages.map((m) => {
    if (m.role === "user" || m.toolCalls.length === 0) return { role: m.role, content: m.content };
    const summary = m.toolCalls.map((c) => `[${c.tool} — ${c.status}]`).join(" ");
    return { role: m.role as "assistant", content: `${m.content}\n${summary}`.trim() };
  });
}

/**
 * One user turn: streams the assistant's reply, executing reads as they are requested and
 * collecting mutations into a plan the user approves later via `chat.apply`.
 */
export async function* runChat(
  ctx: Ctx,
  session: AiSession,
  opts: { threadId?: string; message: string; baseUrl: string; registry?: Registry },
): AsyncGenerator<ChatStreamEvent> {
  const reg = opts.registry ?? ctx.registry ?? defaultRegistry;
  const exposed = exposedChatTools(ctx, reg);
  const byName = new Map(exposed.map((e) => [e.tool.name, e.tool]));
  const tools = exposed.map((e) => e.def);

  let threadId = opts.threadId;
  if (threadId) {
    ownThread(ctx, threadId);
  } else {
    const thread = createThread(ctx, titleFor(opts.message));
    threadId = thread.id;
    yield { type: "thread", threadId, title: thread.title };
  }

  const prior = history(listMessages(ctx.db, threadId));
  insertMessage(ctx.db, threadId, { role: "user", content: opts.message, toolCalls: [], planPending: false, usage: null });

  const messages: ProviderChatMessage[] = [...prior, { role: "user", content: opts.message }];
  const system = chatSystemPrompt(ctx, opts.baseUrl);

  const calls: ChatToolCall[] = [];
  const text: string[] = [];
  const usage: AiUsageTokens = { inputTokens: 0, outputTokens: 0 };
  const started = performance.now();
  const meta = { tool: CHAT_TOOL, provider: session.provider, model: session.model, keySource: session.keySource };

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const turnText: string[] = [];
      const uses: { id: string; name: string; input: unknown }[] = [];
      let stopReason: "end" | "tool_use" = "end";

      for await (const ev of session.client.chatStream({ system, messages, tools, maxTokens: CHAT_MAX_TOKENS })) {
        if (ev.type === "token") {
          turnText.push(ev.text);
          yield { type: "token", text: ev.text };
        } else if (ev.type === "toolUse") {
          uses.push({ id: ev.id, name: ev.name, input: ev.input });
        } else {
          usage.inputTokens += ev.usage.inputTokens;
          usage.outputTokens += ev.usage.outputTokens;
          stopReason = ev.stopReason;
        }
      }

      const said = turnText.join("");
      if (said) text.push(said);
      if (stopReason !== "tool_use" || uses.length === 0) break;

      const assistantParts: ProviderContentPart[] = [];
      if (said) assistantParts.push({ type: "text", text: said });
      for (const u of uses) assistantParts.push({ type: "toolUse", id: u.id, name: u.name, input: u.input });
      messages.push({ role: "assistant", content: assistantParts });

      // Anthropic requires every result for a turn in ONE user message, in call order.
      const results: ProviderContentPart[] = [];
      for (const use of uses) {
        const tool = byName.get(use.name);
        if (!tool) {
          const call: ChatToolCall = {
            id: use.id, tool: use.name, input: use.input, kind: "read", status: "failed",
            result: `Unknown or unavailable tool "${use.name}"`, preview: null,
          };
          calls.push(call);
          yield { type: "tool_call", call };
          results.push({ type: "toolResult", id: use.id, content: `Unknown or unavailable tool "${use.name}"`, isError: true });
          continue;
        }

        if (!tool.mutation) {
          const res = await dispatch(use.name, use.input, ctx, reg);
          const payload = res.ok ? JSON.stringify(res.data) : JSON.stringify(res.error);
          const call: ChatToolCall = {
            id: use.id, tool: use.name, input: use.input, kind: "read",
            status: res.ok ? "executed" : "failed",
            result: res.ok ? res.data : res.error.message,
            preview: null,
          };
          calls.push(call);
          yield { type: "tool_call", call };
          results.push({ type: "toolResult", id: use.id, content: truncate(payload), isError: !res.ok });
          continue;
        }

        const call: ChatToolCall = {
          id: use.id, tool: use.name, input: use.input, kind: "mutation", status: "proposed",
          result: null,
          preview: await buildPreview(ctx, reg, use.name, use.input),
        };
        calls.push(call);
        yield { type: "tool_call", call };
        results.push({ type: "toolResult", id: use.id, content: PROPOSED_RESULT });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    recordUsage(ctx, { ...meta, usage, durationMs: performance.now() - started, ok: false });
    throw e;
  }

  recordUsage(ctx, { ...meta, usage, durationMs: performance.now() - started, ok: true });

  const message = insertMessage(ctx.db, threadId, {
    role: "assistant",
    content: text.join("\n\n").trim(),
    toolCalls: calls,
    planPending: calls.some((c) => c.status === "proposed"),
    usage,
  });
  yield { type: "message", message };
  yield { type: "done", usage };
}
