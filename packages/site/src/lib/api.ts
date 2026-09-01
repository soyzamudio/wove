import type { Design, Menu, Post, Settings, Term } from "@wove/sdk";
import { API_URL, MOCK } from "./env";
import { cached } from "./cache";
import { shouldReport404 } from "./redirects";
import { mockAllContent, mockDesign, mockMenus, mockSearch, mockSettings, mockTerms } from "./mock-data";

export interface ListPostsParams {
  type?: Post["type"];
  term?: string;
  limit?: number;
  cursor?: string;
}

export interface PostPage {
  items: Post[];
  nextCursor: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${API_URL.replace(/\/+$/, "")}${path}`;
  return cached(url, async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`wove core request failed: ${res.status} ${url}`);
    }
    return (await res.json()) as T;
  });
}

export async function getSettings(): Promise<Settings> {
  if (MOCK) return mockSettings;
  return getJson<Settings>("/api/public/settings");
}

export async function listPosts(params: ListPostsParams = {}): Promise<PostPage> {
  if (MOCK) return listMockPosts(params);

  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.term) qs.set("term", params.term);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cursor) qs.set("cursor", params.cursor);
  const query = qs.toString();
  return getJson<PostPage>(`/api/public/posts${query ? `?${query}` : ""}`);
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  if (MOCK) {
    return mockAllContent.find((item) => item.slug === slug) ?? null;
  }
  const url = `${API_URL.replace(/\/+$/, "")}/api/public/posts/${encodeURIComponent(slug)}`;
  return cached(url, async () => {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`wove core request failed: ${res.status} ${url}`);
    }
    return (await res.json()) as Post;
  });
}

export async function listTerms(): Promise<Term[]> {
  if (MOCK) return mockTerms;
  return getJson<Term[]>("/api/public/terms");
}

export async function getMenus(): Promise<Menu[]> {
  if (MOCK) return mockMenus;
  return getJson<Menu[]>("/api/public/menus");
}

export async function getDesign(): Promise<Design> {
  if (MOCK) return mockDesign;
  return getJson<Design>("/api/public/design");
}

export async function searchPosts(q: string, limit = 20): Promise<Post[]> {
  if (!q.trim()) return [];
  if (MOCK) return mockSearch(q, limit);
  const qs = new URLSearchParams({ q, limit: String(limit) });
  const { items } = await getJson<{ items: Post[] }>(`/api/public/search?${qs.toString()}`);
  return items;
}

/** Every published post/page — used by /llms.txt, /llms-full.txt, /sitemap.xml. */
export async function listAllPublished(): Promise<Post[]> {
  if (MOCK) return mockAllContent;
  const [posts, pages] = await Promise.all([
    listPosts({ type: "post", limit: 100 }),
    listPosts({ type: "page", limit: 100 }),
  ]);
  return [...posts.items, ...pages.items];
}

function listMockPosts(params: ListPostsParams): PostPage {
  let items = mockAllContent.filter((post) => post.status === "published");
  if (params.type) items = items.filter((post) => post.type === params.type);
  if (params.term) {
    items = items.filter((post) => post.terms.some((term) => term.slug === params.term));
  }
  items = [...items].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  const limit = params.limit ?? 20;
  const offset = params.cursor ? Number(params.cursor) : 0;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : null;
  return { items: page, nextCursor };
}

// ---------------------------------------------------------------- redirects & 404s

export interface RedirectHit {
  toPath: string;
  code: 301 | 302;
}

/** How long the site will wait on core before it just renders the 404. */
const REDIRECT_TIMEOUT_MS = 2000;
const REPORT_404_TIMEOUT_MS = 500;

/**
 * Ask core whether a missing path has a redirect. Never throws and never blocks a render
 * for long: any error, timeout or non-200 means "no redirect".
 */
export async function resolveRedirect(path: string): Promise<RedirectHit | null> {
  if (MOCK) return null;
  const url = `${API_URL.replace(/\/+$/, "")}/api/public/resolve?path=${encodeURIComponent(path)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { redirect: RedirectHit | null };
    const hit = body?.redirect;
    if (!hit || typeof hit.toPath !== "string" || !hit.toPath) return null;
    return { toPath: hit.toPath, code: hit.code === 302 ? 302 : 301 };
  } catch {
    return null;
  }
}

/**
 * Tell core about a 404. Fire-and-forget: the returned promise is never awaited by pages,
 * it is capped by its own timeout, and every failure is swallowed.
 */
export function report404(path: string, referrer?: string | null): void {
  if (MOCK || !shouldReport404(path)) return;
  const url = `${API_URL.replace(/\/+$/, "")}/api/public/404`;
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, referrer: referrer ?? null }),
    signal: AbortSignal.timeout(REPORT_404_TIMEOUT_MS),
  }).catch(() => {});
}
