import type { ChatToolCall } from "@wove/sdk";

/** Summarize an applied/discarded plan for the toast: "3 applied, 1 failed". */
export function planSummary(calls: ChatToolCall[]): string {
  const counts = { applied: 0, failed: 0, rejected: 0 };
  for (const c of calls) {
    if (c.status === "applied") counts.applied++;
    else if (c.status === "failed") counts.failed++;
    else if (c.status === "rejected") counts.rejected++;
  }
  const parts: string[] = [];
  if (counts.applied) parts.push(`${counts.applied} applied`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (counts.rejected) parts.push(`${counts.rejected} discarded`);
  return parts.length ? parts.join(", ") : "Nothing to apply";
}

/**
 * Admin route for a post an applied call just created, so the card can offer
 * "Open in editor". Only `post.create` / `ai.generatePage` produce one; the
 * route depends on the post `type` (page vs post).
 */
export function openInEditorTarget(call: ChatToolCall): string | null {
  if (call.status !== "applied") return null;
  if (call.tool !== "post.create" && call.tool !== "ai.generatePage") return null;
  const result = call.result as any;
  const post = result?.post ?? result;
  const id: unknown = post?.id ?? result?.postId;
  if (typeof id !== "string" || !id) return null;
  const type = post?.type ?? (call.input as any)?.type ?? "post";
  return type === "page" ? `/pages/${id}` : `/posts/${id}`;
}

/** Reads execute server-side and come back done; everything else is plan material. */
export function isReadCall(call: ChatToolCall): boolean {
  return call.kind === "read" || call.status === "executed";
}
