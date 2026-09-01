/**
 * Helpers for the generation-first hero on the Posts/Pages list.
 *
 * The hero shows a row of "intent chips" that prefill a template prefix into
 * the prompt box. Clicking a chip should be additive (it keeps whatever the
 * author already typed) but idempotent (clicking the same chip twice must not
 * stack the prefix).
 */

export interface IntentChip {
  /** Short label shown on the chip. */
  label: string;
  /** Prompt prefix inserted into the textarea, ending with a trailing space. */
  template: string;
}

export const POST_CHIPS: IntentChip[] = [
  { label: "Announcement", template: "Write an announcement post about " },
  { label: "How-to guide", template: "Write a step-by-step how-to guide about " },
  { label: "Release notes", template: "Write release notes for " },
  { label: "Opinion piece", template: "Write an opinion piece arguing that " },
  { label: "Listicle", template: "Write a listicle about " },
];

export const PAGE_CHIPS: IntentChip[] = [
  { label: "Landing page", template: "Build a landing page for " },
  { label: "About page", template: "Build an about page for " },
  { label: "Pricing page", template: "Build a pricing page for " },
  { label: "FAQ page", template: "Build an FAQ page for " },
  { label: "Contact page", template: "Build a contact page for " },
];

export function chipsFor(postType: "post" | "page"): IntentChip[] {
  return postType === "page" ? PAGE_CHIPS : POST_CHIPS;
}

/**
 * Apply a chip `template` to the `current` prompt text.
 *
 * - Empty prompt → just the template.
 * - Prompt already starting with the template (ignoring leading whitespace and
 *   case) → returned unchanged, so repeat clicks are a no-op.
 * - Otherwise the template is prefixed, with exactly one space between it and
 *   the existing text.
 */
export function chipPrompt(current: string, template: string): string {
  const rest = current.replace(/^\s+/, "");
  if (rest.length === 0) return template;
  if (rest.toLowerCase().startsWith(template.trimEnd().toLowerCase())) return rest;
  return `${template.trimEnd()} ${rest}`;
}
