import type { APIRoute } from "astro";
import { getSettings, listAllPublished } from "../lib/api";
import { formatLlmsFullTxt } from "../lib/llms";

export const GET: APIRoute = async () => {
  const settings = await getSettings();
  const items = await listAllPublished();
  const body = formatLlmsFullTxt(
    settings,
    items.map((post) => ({ title: post.title, content: post.content })),
  );
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
