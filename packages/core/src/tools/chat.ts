import { eq } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions, type ChatMessage, type ChatToolCall } from "@wove/sdk";
import { chatThreads } from "../db/schema";
import { getMessage, listMessages, listThreads, ownThread, saveToolCalls, toMessage, toThread } from "../chat/store";
import { defineTool, dispatch, registry, type Ctx } from "./registry";

const D = ToolDescriptions;

export const chatThreadsTool = defineTool({
  name: "chat.threads",
  description: D["chat.threads"],
  input: ToolCatalog["chat.threads"].input,
  output: ToolCatalog["chat.threads"].output,
  scopes: ToolCatalog["chat.threads"].scopes,
  mutation: false,
  handler: (ctx) => listThreads(ctx),
});

export const chatGet = defineTool({
  name: "chat.get",
  description: D["chat.get"],
  input: ToolCatalog["chat.get"].input,
  output: ToolCatalog["chat.get"].output,
  scopes: ToolCatalog["chat.get"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const thread = ownThread(ctx, input.id);
    return { thread: toThread(thread), messages: listMessages(ctx.db, thread.id) };
  },
});

export const chatDelete = defineTool({
  name: "chat.delete",
  description: D["chat.delete"],
  input: ToolCatalog["chat.delete"].input,
  output: ToolCatalog["chat.delete"].output,
  scopes: ToolCatalog["chat.delete"].scopes,
  handler: (ctx, input) => {
    const thread = ownThread(ctx, input.id);
    ctx.db.delete(chatThreads).where(eq(chatThreads.id, thread.id)).run();
    return { ok: true as const };
  },
});

/**
 * Approval. Only calls the model *proposed* can be applied, and only the ones the user
 * ticked; the rest of the plan is rejected in the same breath, so a message never keeps a
 * half-answered plan hanging around. Each call goes through `dispatch`, so the actor's
 * scopes — not the chat's — decide what actually runs, and every one is audited.
 */
export const chatApply = defineTool({
  name: "chat.apply",
  description: D["chat.apply"],
  input: ToolCatalog["chat.apply"].input,
  output: ToolCatalog["chat.apply"].output,
  scopes: ToolCatalog["chat.apply"].scopes,
  handler: async (ctx, input): Promise<ChatMessage> => {
    const thread = ownThread(ctx, input.threadId);
    const row = getMessage(ctx.db, thread.id, input.messageId);
    const calls = ((row.toolCalls ?? []) as ChatToolCall[]).map((c) => ({ ...c }));
    const approve = new Set(input.approve);

    for (const call of calls) {
      if (call.status !== "proposed") continue;
      if (!approve.has(call.id)) {
        call.status = "rejected";
        continue;
      }
      const res = await dispatch(call.tool, call.input, chatCtx(ctx), ctx.registry ?? registry);
      if (res.ok) {
        call.status = "applied";
        call.result = res.data;
      } else {
        // One failure does not abandon the rest of the plan — the user sees what landed.
        call.status = "failed";
        call.result = res.error.message;
      }
    }

    saveToolCalls(ctx.db, row.id, calls);
    return toMessage({ ...row, toolCalls: calls as unknown[], planPending: calls.some((c) => c.status === "proposed") });
  },
});

export const chatDiscard = defineTool({
  name: "chat.discard",
  description: D["chat.discard"],
  input: ToolCatalog["chat.discard"].input,
  output: ToolCatalog["chat.discard"].output,
  scopes: ToolCatalog["chat.discard"].scopes,
  handler: (ctx, input): ChatMessage => {
    const thread = ownThread(ctx, input.threadId);
    const row = getMessage(ctx.db, thread.id, input.messageId);
    const calls = ((row.toolCalls ?? []) as ChatToolCall[]).map((c) =>
      c.status === "proposed" ? { ...c, status: "rejected" as const } : c,
    );
    saveToolCalls(ctx.db, row.id, calls);
    return toMessage({ ...row, toolCalls: calls as unknown[], planPending: false });
  },
});

/** Applied mutations are attributed to the chat, whichever transport asked for them. */
const chatCtx = (ctx: Ctx): Ctx => ({ ...ctx, channel: "chat" });

export const chatTools = [chatThreadsTool, chatGet, chatApply, chatDiscard, chatDelete];
