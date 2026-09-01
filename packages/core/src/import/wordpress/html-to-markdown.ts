/**
 * WordPress HTML → Markdown.
 *
 * Pure: no I/O. Shortcodes are expanded (or dropped, with a warning) *before* turndown
 * sees the document, so the converter only ever deals with plain HTML.
 */
import TurndownService from "turndown";
// @ts-expect-error - turndown-plugin-gfm ships no types
import { tables, strikethrough } from "turndown-plugin-gfm";

export interface AttachmentRef {
  url: string;
  alt?: string;
}

export interface ConvertOptions {
  /** WordPress attachment id → the image we ended up with. Used to expand `[gallery]`. */
  attachments?: Map<string, AttachmentRef>;
}

export interface ConvertResult {
  markdown: string;
  warnings: string[];
}

/** Providers whose bare URL WordPress auto-embeds; we leave the URL on its own line. */
const OEMBED_HOST = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com|twitter\.com|x\.com)\//i;

function makeTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  td.use([tables, strikethrough]);

  // <pre><code class="language-x"> → fenced block with the language tag.
  td.addRule("fencedCodeWithLang", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      !!node.firstChild &&
      (node.firstChild as HTMLElement).nodeName === "CODE",
    replacement: (_content, node) => {
      const code = (node as HTMLElement).firstChild as HTMLElement;
      const cls = code.getAttribute?.("class") ?? "";
      const lang = /(?:language|lang)-([A-Za-z0-9_+-]+)/.exec(cls)?.[1] ?? "";
      const body = (code.textContent ?? "").replace(/\n$/, "");
      return `\n\n\`\`\`${lang}\n${body}\n\`\`\`\n\n`;
    },
  });

  // <figure><img><figcaption> → image followed by an italic caption line.
  td.addRule("figureWithCaption", {
    filter: (node) => node.nodeName === "FIGURE",
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const img = el.querySelector?.("img");
      const cap = el.querySelector?.("figcaption");
      const capText = (cap?.textContent ?? "").trim();
      if (!img) return capText ? `\n\n*${capText}*\n\n` : "\n\n";
      const src = img.getAttribute("src") ?? "";
      const alt = (img.getAttribute("alt") ?? "").replace(/[\[\]]/g, "");
      const image = `![${alt}](${src})`;
      return capText ? `\n\n${image}\n\n*${capText}*\n\n` : `\n\n${image}\n\n`;
    },
  });

  return td;
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Parse `id="1" align="left"` style shortcode attributes. */
export function parseShortcodeAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/** Shortcodes we understand; everything else is dropped with a warning. */
const KNOWN = new Set(["caption", "gallery", "embed", "wp_caption"]);

function preprocess(html: string, opts: ConvertOptions, warnings: string[]): string {
  let out = html;

  // 1. Gutenberg block delimiters.
  out = out.replace(/<!--\s*\/?\s*wp:[\s\S]*?-->/g, "");

  // 2. [caption]…[/caption] → <figure>
  out = out.replace(
    /\[(caption|wp_caption)\b([^\]]*)\]([\s\S]*?)\[\/\1\]/gi,
    (_all, _tag, _attrs, body: string) => {
      const imgMatch = /<img[^>]*>/i.exec(body);
      const img = imgMatch?.[0] ?? "";
      const caption = body.replace(/<img[^>]*>/i, "").replace(/<\/?a[^>]*>/gi, "").trim();
      return `<figure>${img}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
    },
  );

  // 3. [gallery ids="1,2"] → the images those attachment ids resolved to.
  out = out.replace(/\[gallery\b([^\]]*)\]/gi, (_all, attrs: string) => {
    const ids = (parseShortcodeAttrs(attrs).ids ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      warnings.push("[gallery] shortcode without `ids` was removed");
      return "";
    }
    const parts: string[] = [];
    for (const id of ids) {
      const found = opts.attachments?.get(id);
      if (!found) {
        warnings.push(`[gallery] references attachment ${id}, which is not in the export`);
        continue;
      }
      parts.push(`<p><img src="${escapeAttr(found.url)}" alt="${escapeAttr(found.alt ?? "")}" /></p>`);
    }
    return parts.join("");
  });

  // 4. [embed]url[/embed] and self-closing [embed url] → bare URL paragraph.
  out = out.replace(/\[embed\b[^\]]*\]([\s\S]*?)\[\/embed\]/gi, (_all, url: string) => `<p>${url.trim()}</p>`);
  out = out.replace(/\[embed\b\s+([^\]]+)\]/gi, (_all, url: string) => `<p>${url.trim()}</p>`);

  // 5. Everything else that looks like a shortcode.
  const drop = (name: string) => {
    if (!KNOWN.has(name.toLowerCase())) warnings.push(`Unknown shortcode [${name}] was removed`);
  };
  out = out.replace(/\[([a-zA-Z][\w-]*)\b([^\]]*)\]([\s\S]*?)\[\/\1\]/g, (_all, name: string, _a, inner: string) => {
    drop(name);
    return inner;
  });
  out = out.replace(/\[([a-zA-Z][\w-]*)((?:\s[^\]]*)?)\](?!\()/g, (all, name: string, attrs: string) => {
    // `[note]` with no attributes inside prose is more likely text than a shortcode.
    if (!attrs.trim() && !KNOWN.has(name.toLowerCase())) return all;
    drop(name);
    return "";
  });

  return out;
}

/** Bare oEmbed URLs turndown linkified — put the plain URL back on its own line. */
function unlinkifyEmbeds(md: string): string {
  return md.replace(/^\s*\[([^\]]+)\]\((\S+)\)\s*$/gm, (all, label: string, href: string) =>
    label.trim() === href.trim() && OEMBED_HOST.test(href) ? href : all,
  );
}

export function htmlToMarkdown(html: string, opts: ConvertOptions = {}): ConvertResult {
  const warnings: string[] = [];
  if (!html || !html.trim()) return { markdown: "", warnings };

  const prepared = preprocess(html, opts, warnings);
  let md: string;
  try {
    md = makeTurndown().turndown(prepared);
  } catch (e) {
    warnings.push(`HTML conversion failed, keeping plain text: ${(e as Error).message}`);
    md = prepared.replace(/<[^>]+>/g, "");
  }
  md = unlinkifyEmbeds(md);
  md = md.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return { markdown: md, warnings: [...new Set(warnings)] };
}

// ---------------------------------------------------------------- url rewriting

export interface UrlMap {
  /** Old absolute media URL → new URL. */
  media?: Map<string, string>;
  /** Old site roots, e.g. `https://old.site` (no trailing slash). */
  siteUrls?: string[];
  /** Old permalink path (or its last segment) → new site-relative path. */
  links?: Map<string, string>;
}

/** `…/photo-300x200.jpg` → `…/photo.jpg`. WP writes one file per registered size. */
export function stripSizeSuffix(url: string): string {
  return url.replace(/-\d{2,5}x\d{2,5}(?=\.[A-Za-z0-9]{2,5}(?:$|[?#]))/, "");
}

function lookupMedia(url: string, media: Map<string, string>): string | null {
  const clean = url.split(/[?#]/)[0]!;
  return media.get(url) ?? media.get(clean) ?? media.get(stripSizeSuffix(clean)) ?? null;
}

function lookupLink(url: string, map: UrlMap): string | null {
  const roots = map.siteUrls ?? [];
  const root = roots.find((r) => r && url.toLowerCase().startsWith(r.toLowerCase()));
  if (root == null) return null;
  const rest = url.slice(root.length).split(/[?#]/)[0]!;
  const path = rest.startsWith("/") ? rest : `/${rest}`;
  // Asset URLs we could not map stay as they are — never turn a missing upload into a page link.
  if (/\/wp-(content|includes)\//i.test(path) || /\.[A-Za-z0-9]{2,5}$/.test(path)) return null;
  const direct = map.links?.get(path) ?? map.links?.get(path.replace(/\/$/, ""));
  if (direct) return direct;
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return "/";
  const bySlug = map.links?.get(`/${last}`);
  return bySlug ?? `/${last}`;
}

/**
 * Rewrite old-site URLs inside a Markdown document: media URLs (including WP's
 * `-300x200` size-suffixed variants) and internal permalinks.
 */
export function rewriteUrls(md: string, map: UrlMap): string {
  const media = map.media ?? new Map<string, string>();
  return md.replace(/https?:\/\/[^\s)"'<>\]]+/g, (url) => {
    const trailing = /[.,;:]+$/.exec(url)?.[0] ?? "";
    const bare = trailing ? url.slice(0, -trailing.length) : url;
    const replaced = lookupMedia(bare, media) ?? lookupLink(bare, map);
    return (replaced ?? bare) + trailing;
  });
}
