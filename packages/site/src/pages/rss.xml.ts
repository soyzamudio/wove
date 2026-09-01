import type { APIRoute } from "astro";
import { getSettings, listPosts } from "../lib/api";
import { renderMarkdown } from "../lib/markdown";
import { blocksToMarkdown } from "../lib/blocks-text";
import { buildRssFeed } from "../lib/rss";
import { PUBLIC_URL } from "../lib/env";

export const GET: APIRoute = async () => {
  const settings = await getSettings();
  const siteUrl = settings.siteUrl.replace(/\/+$/, "");
  const { items } = await listPosts({ type: "post", limit: settings.postsPerPage });

  const rssItems = items.map((post) => {
    const isBlocks = post.format === "blocks" && Boolean(post.blocks);
    const markdownContent = isBlocks ? blocksToMarkdown(post.blocks!) : post.content;
    return { post, siteUrl, contentHtml: renderMarkdown(markdownContent, PUBLIC_URL) };
  });

  const xml = buildRssFeed(settings, rssItems);

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
