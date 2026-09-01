import { desc } from "drizzle-orm";
import type { DB } from "../db";
import { terms as termsTable } from "../db/schema";
import { readSettings } from "../tools/shared";
import { blockCatalog } from "../tools/blocks";

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

// ---------------------------------------------------------------- blocks / pages

/** Generic tolerant JSON extraction: bare, fenced, or embedded in prose. Null when unparseable. */
export function parseJsonLoose(raw: string): unknown | null {
  const text = raw.trim();
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const first = text.indexOf(open);
    const last = text.lastIndexOf(close);
    if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * The block vocabulary, rendered for a system prompt: one line of prose per type plus the
 * JSON schema of its props. `html` is deliberately absent — raw HTML is admin-authored only,
 * never something a model gets to emit.
 */
export function blockCatalogPrompt(): string {
  const entries = blockCatalog().filter((b) => b.type !== "html");
  return entries
    .map((b) => `- ${b.type}: ${b.description}\n  props: ${JSON.stringify(b.propsSchema)}`)
    .join("\n");
}

const BLOCK_RULES = [
  "Every block is {\"type\": <one of the types above>, \"props\": <object matching that type's props schema>}.",
  "Never invent image URLs: leave `image`, `images`, `avatar` and `logos` out entirely unless a URL was given to you.",
  "Icons are lucide icon names in lowercase kebab-case (e.g. 'zap', 'shield-check').",
  "Write real copy derived from the user's prompt — never lorem ipsum, never placeholder names or fake metrics presented as facts.",
  "Do not use the `html` block.",
].join("\n");

export function generatePageSystem(base: string): string {
  return [
    base,
    "",
    "You design landing pages as a JSON document of typed blocks. Available block types:",
    blockCatalogPrompt(),
    "",
    'Return ONLY a JSON object {"title": string, "blocks": Block[]} — no prose, no code fences, no commentary.',
    "The page must have 4 to 8 blocks, start with a `hero`, and end with a `cta` or `faq`.",
    BLOCK_RULES,
  ].join("\n");
}

export function generateBlockSystem(base: string, type: string | undefined, page: string | null): string {
  const lines = [
    base,
    "",
    "You write single page sections as typed JSON blocks. Available block types:",
    blockCatalogPrompt(),
    "",
    type
      ? `Return ONLY a JSON Block of type ${type} — no prose, no code fences, no commentary.`
      : "Return ONLY a single JSON Block, choosing the type that best fits the request — no prose, no code fences, no commentary.",
    BLOCK_RULES,
  ];
  if (page) lines.push("", page);
  return lines.join("\n");
}

export function editBlockSystem(base: string, block: { type: string }, page: string | null): string {
  const lines = [
    base,
    "",
    "You edit a single page section, expressed as a typed JSON block. Available block types:",
    blockCatalogPrompt(),
    "",
    `Return ONLY the rewritten JSON Block. It must keep type "${block.type}" and satisfy that type's props schema — no prose, no code fences, no commentary.`,
    BLOCK_RULES,
  ];
  if (page) lines.push("", page);
  return lines.join("\n");
}

/** Feed zod's complaints straight back to the model; it fixes them more often than not. */
export const FIX_ERRORS_NUDGE = (issues: string[]) =>
  `Fix these errors and return only JSON: ${issues.join("; ")}`;
