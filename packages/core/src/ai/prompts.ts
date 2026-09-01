import { desc } from "drizzle-orm";
import type { DB } from "../db";
import { terms as termsTable } from "../db/schema";
import { readSettings } from "../tools/shared";

const MAX_TAGS = 30;

/**
 * Every generation is grounded in the site: its title, tagline and existing taxonomy,
 * plus whatever the operator added under `ai.systemPrompt`.
 */
export function baseSystemPrompt(db: DB, systemPrompt: string | null): string {
  const settings = readSettings(db);
  const tags = db
    .select({ name: termsTable.name })
    .from(termsTable)
    .orderBy(desc(termsTable.createdAt))
    .limit(MAX_TAGS)
    .all()
    .map((t) => t.name);

  const lines = [
    `You are the writing assistant for the website '${settings.siteTitle}' — ${settings.tagline}.`,
    `Existing tags: ${tags.length ? tags.join(", ") : "(none yet)"}.`,
    "Write in Markdown. Output only the requested content, no preamble.",
  ];
  if (systemPrompt) lines.push(systemPrompt);
  return lines.join(" ").trim();
}

/** `ai.generate` optionally carries the post being edited as context. */
export function withPostContext(system: string, post: { title: string; content: string } | null): string {
  if (!post) return system;
  return `${system}\n\nCurrent post:\n${post.title}\n\n${post.content}`;
}

export function rewriteSystem(base: string, instruction: string): string {
  return `${base}\n\nRewrite the user's text according to this instruction: ${instruction}\nOutput only the rewritten text, with no commentary, explanation or code fences.`;
}

export function draftPostSystem(base: string): string {
  return [
    base,
    "",
    'Respond with a single JSON object and nothing else: {"title": string, "excerpt": string, "content": string}.',
    "`title` is a short headline. `excerpt` is one or two sentences of summary. `content` is the full post body in Markdown (do not repeat the title as a heading).",
    "Do not wrap the JSON in code fences. Do not add any text before or after the JSON.",
  ].join("\n");
}

export const DRAFT_RETRY_NUDGE =
  "That was not valid JSON. Return only a JSON object with the keys title, excerpt and content — no prose, no code fences.";

export interface DraftPostJson {
  title: string;
  excerpt: string;
  content: string;
}

/** Tolerates ```json fences and leading/trailing prose. Returns null when unparseable. */
export function parseDraftJson(raw: string): DraftPostJson | null {
  const candidates: string[] = [];
  const text = raw.trim();
  candidates.push(text);

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as Partial<DraftPostJson>;
      if (parsed && typeof parsed === "object" && typeof parsed.title === "string" && typeof parsed.content === "string") {
        return {
          title: parsed.title.trim(),
          excerpt: typeof parsed.excerpt === "string" ? parsed.excerpt.trim() : "",
          content: parsed.content,
        };
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}
