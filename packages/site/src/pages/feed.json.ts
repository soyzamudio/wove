import type { APIRoute } from "astro";
import { getSettings, listPosts } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { API_URL } from "../lib/env";

export const GET: APIRoute = async () => {
  const settings = await getSettings();
  const siteUrl = settings.siteUrl.replace(/\/+$/, "");
  const { items } = await listPosts({ type: "post", limit: settings.postsPerPage });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: settings.siteTitle,
    description: settings.tagline || undefined,
    home_page_url: siteUrl,
    feed_url: `${siteUrl}/feed.json`,
    items: items.map((post) => ({
      id: post.id,
      url: `${siteUrl}/${post.slug}`,
      title: post.title,
      content_html: renderMarkdown(post.content, API_URL),
      summary: post.excerpt ?? undefined,
      date_published: post.publishedAt ?? undefined,
      date_modified: post.updatedAt,
      tags: post.terms.map((term) => term.name),
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { "Content-Type": "application/feed+json; charset=utf-8" },
  });
};
