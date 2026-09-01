/**
 * WXR (WordPress eXtended RSS) parser.
 *
 * Pure: takes the XML text, returns a plain object. No I/O, no database, no network.
 * Handles WXR 1.0/1.1 (`wp:category` / `wp:tag` elements) and 1.2 (generic `wp:term`).
 */
import { XMLParser } from "fast-xml-parser";

export interface WxrAuthor {
  login: string;
  email: string | null;
  displayName: string;
}

export interface WxrTerm {
  /** `wp:term_id` — what `_menu_item_object_id` points at for taxonomy menu items. */
  id: string | null;
  taxonomy: string;
  slug: string;
  name: string;
  parent: string | null;
}

export interface WxrCategoryRef {
  /** `category`, `post_tag`, `nav_menu`, … */
  domain: string;
  nicename: string;
  name: string;
}

export interface WxrItem {
  title: string;
  link: string | null;
  postId: string | null;
  postType: string;
  status: string;
  postName: string | null;
  /** ISO-8601, derived from `wp:post_date_gmt` (falling back to `wp:post_date`). */
  date: string | null;
  creator: string | null;
  content: string;
  excerpt: string;
  postParent: string | null;
  menuOrder: number;
  attachmentUrl: string | null;
  categories: WxrCategoryRef[];
  /** `wp:postmeta` pairs, last one wins. */
  meta: Record<string, string>;
}

export interface WxrDoc {
  siteTitle: string | null;
  siteUrl: string | null;
  baseSiteUrl: string | null;
  baseBlogUrl: string | null;
  version: string | null;
  authors: WxrAuthor[];
  terms: WxrTerm[];
  items: WxrItem[];
}

const TEXT = "#text";

/** Tags that must always come back as arrays, even with a single occurrence. */
const ARRAY_TAGS = new Set([
  "item",
  "category",
  "wp:author",
  "wp:category",
  "wp:tag",
  "wp:term",
  "wp:postmeta",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: TEXT,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  // CDATA sections are merged into the element's text value.
  isArray: (name) => ARRAY_TAGS.has(name),
});

/** Text of a node that may be a bare string, a `{ "#text": … }` object, or missing. */
function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const t = (node as Record<string, unknown>)[TEXT];
    return t == null ? "" : text(t);
  }
  return "";
}

const str = (node: unknown): string | null => {
  const v = text(node).trim();
  return v === "" ? null : v;
};

const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** `2021-03-04 10:00:00` (UTC) → ISO-8601. WordPress writes all-zeroes for "unset". */
export function wpDateToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || v.startsWith("0000-00-00")) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v);
  if (m) {
    const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseWxr(xml: string): WxrDoc {
  const root = parser.parse(xml) as Record<string, any>;
  const channel = root?.rss?.channel ?? root?.channel;
  if (!channel) throw new Error("Not a WXR file: no <rss><channel> element found");

  const authors: WxrAuthor[] = arr(channel["wp:author"]).map((a: any) => ({
    login: text(a?.["wp:author_login"]),
    email: str(a?.["wp:author_email"]),
    displayName:
      str(a?.["wp:author_display_name"]) ??
      (str([str(a?.["wp:author_first_name"]), str(a?.["wp:author_last_name"])].filter(Boolean).join(" ")) ??
        text(a?.["wp:author_login"])),
  }));

  const terms: WxrTerm[] = [];
  for (const c of arr(channel["wp:category"])) {
    const slug = str(c?.["wp:category_nicename"]);
    const name = str(c?.["wp:cat_name"]) ?? slug;
    if (slug && name) {
      terms.push({ id: str(c?.["wp:term_id"]), taxonomy: "category", slug, name, parent: str(c?.["wp:category_parent"]) });
    }
  }
  for (const t of arr(channel["wp:tag"])) {
    const slug = str(t?.["wp:tag_slug"]);
    const name = str(t?.["wp:tag_name"]) ?? slug;
    if (slug && name) terms.push({ id: str(t?.["wp:term_id"]), taxonomy: "post_tag", slug, name, parent: null });
  }
  for (const t of arr(channel["wp:term"])) {
    const taxonomy = str(t?.["wp:term_taxonomy"]);
    const slug = str(t?.["wp:term_slug"]);
    const name = str(t?.["wp:term_name"]) ?? slug;
    if (!taxonomy || !slug || !name) continue;
    if (terms.some((x) => x.taxonomy === taxonomy && x.slug === slug)) continue;
    terms.push({ id: str(t?.["wp:term_id"]), taxonomy, slug, name, parent: str(t?.["wp:term_parent"]) });
  }

  const items: WxrItem[] = arr(channel.item).map((it: any) => {
    const meta: Record<string, string> = {};
    for (const m of arr(it?.["wp:postmeta"])) {
      const key = str(m?.["wp:meta_key"]);
      if (key) meta[key] = text(m?.["wp:meta_value"]);
    }
    const categories: WxrCategoryRef[] = arr(it?.category)
      .map((c: any) => ({
        domain: (typeof c === "object" ? (c?.["@_domain"] as string) : "") || "category",
        nicename: (typeof c === "object" ? (c?.["@_nicename"] as string) : "") || "",
        name: text(c),
      }))
      .filter((c) => c.name || c.nicename);

    const menuOrder = Number(text(it?.["wp:menu_order"]));
    return {
      title: text(it?.title),
      link: str(it?.link),
      postId: str(it?.["wp:post_id"]),
      postType: str(it?.["wp:post_type"]) ?? "post",
      status: str(it?.["wp:status"]) ?? "publish",
      postName: str(it?.["wp:post_name"]),
      date: wpDateToIso(str(it?.["wp:post_date_gmt"])) ?? wpDateToIso(str(it?.["wp:post_date"])),
      creator: str(it?.["dc:creator"]),
      content: text(it?.["content:encoded"]),
      excerpt: text(it?.["excerpt:encoded"]),
      postParent: str(it?.["wp:post_parent"]),
      menuOrder: Number.isFinite(menuOrder) ? menuOrder : 0,
      attachmentUrl: str(it?.["wp:attachment_url"]),
      categories,
      meta,
    };
  });

  return {
    siteTitle: str(channel.title),
    siteUrl: str(channel.link),
    baseSiteUrl: str(channel["wp:base_site_url"]),
    baseBlogUrl: str(channel["wp:base_blog_url"]),
    version: str(channel["wp:wxr_version"]),
    authors,
    terms,
    items,
  };
}
