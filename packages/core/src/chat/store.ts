import { and, asc, desc, eq } from "drizzle-orm";
import type { ChatMessage, ChatThread, ChatToolCall } from "@wove/sdk";
import type { DB } from "../db";
import { chatMessages, chatThreads, type ChatMessageRow, type ChatThreadRow } from "../db/schema";
import { newId, nowIso } from "../ids";
import { notFound, type Ctx } from "../tools/registry";

export const THREAD_TITLE_MAX = 40;

/** A thread's title is the opening message, trimmed — cheap and good enough to scan a list. */
export function titleFor(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  if (!flat) return "New chat";
  return flat.length <= THREAD_TITLE_MAX ? flat : `${flat.slice(0, THREAD_TITLE_MAX).trimEnd()}…`;
}

export const toThread = (r: ChatThreadRow): ChatThread => ({
  id: r.id,
  title: r.title,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const toMessage = (r: ChatMessageRow): ChatMessage => ({
  id: r.id,
  role: r.role,
  content: r.content,
  toolCalls: (r.toolCalls ?? []) as ChatToolCall[],
  planPending: r.planPending,
  usage: (r.usage ?? null) as ChatMessage["usage"],
  ts: r.ts,
});

/** Threads belong to the actor that started them; everyone else gets a 404, not a 403. */
export function ownThread(ctx: Ctx, id: string): ChatThreadRow {
  const row = ctx.db.select().from(chatThreads).where(eq(chatThreads.id, id)).get();
  if (!row || row.actorKind !== ctx.actor.kind || row.actorId !== ctx.actor.id) {
    throw notFound(`Chat thread "${id}" not found`);
  }
  return row;
}

export function listThreads(ctx: Ctx): ChatThread[] {
  return ctx.db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.actorKind, ctx.actor.kind), ctx.actor.id ? eq(chatThreads.actorId, ctx.actor.id) : undefined))
    .orderBy(desc(chatThreads.updatedAt))
    .all()
    .filter((r) => r.actorId === ctx.actor.id)
    .map(toThread);
}

export function listMessages(db: DB, threadId: string): ChatMessage[] {
  return db.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(asc(chatMessages.ts)).all().map(toMessage);
}

export function createThread(ctx: Ctx, title: string): ChatThreadRow {
  const ts = nowIso();
  const row = {
    id: newId(),
    title,
    actorKind: ctx.actor.kind,
    actorId: ctx.actor.id,
    createdAt: ts,
    updatedAt: ts,
  } satisfies ChatThreadRow;
  ctx.db.insert(chatThreads).values(row).run();
  return row;
}

export function touchThread(db: DB, threadId: string): void {
  db.update(chatThreads).set({ updatedAt: nowIso() }).where(eq(chatThreads.id, threadId)).run();
}

export function insertMessage(
  db: DB,
  threadId: string,
  m: Omit<ChatMessage, "id" | "ts"> & { id?: string; ts?: string },
): ChatMessage {
  const row = {
    id: m.id ?? newId(),
    threadId,
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls as unknown[],
    planPending: m.planPending,
    usage: m.usage ?? null,
    ts: m.ts ?? nowIso(),
  };
  db.insert(chatMessages).values(row).run();
  touchThread(db, threadId);
  return toMessage(row as ChatMessageRow);
}

export function getMessage(db: DB, threadId: string, messageId: string): ChatMessageRow {
  const row = db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.threadId, threadId)))
    .get();
  if (!row) throw notFound(`Chat message "${messageId}" not found`);
  return row;
}

export function saveToolCalls(db: DB, messageId: string, calls: ChatToolCall[]): void {
  db.update(chatMessages)
    .set({ toolCalls: calls as unknown[], planPending: calls.some((c) => c.status === "proposed") })
    .where(eq(chatMessages.id, messageId))
    .run();
}
