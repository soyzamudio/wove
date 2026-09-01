import type { APIRoute } from "astro";
import { getSettings, listAllPublished } from "../lib/api";
import { formatLlmsTxt } from "../lib/llms";

export const GET: APIRoute = async () => {
  const settings = await getSettings();
  const items = await listAllPublished();
  const body = formatLlmsTxt(
    settings,
    items.map((post) => ({ slug: post.slug, title: post.title, excerpt: post.excerpt })),
  );
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
