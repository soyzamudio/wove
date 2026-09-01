import type { APIRoute } from "astro";
import { getSettings, listAllPublished } from "../lib/api";
import { formatLlmsFullTxt } from "../lib/llms";
import { blocksToMarkdown } from "../lib/blocks-text";
import { collectCollectionDataForDocs } from "../lib/collections";

export const GET: APIRoute = async () => {
  const settings = await getSettings();
  const items = await listAllPublished();
  const collections = await collectCollectionDataForDocs(items.map((post) => post.blocks));
  const body = formatLlmsFullTxt(
    settings,
    items.map((post) => ({
      title: post.title,
      content: post.format === "blocks" && post.blocks ? blocksToMarkdown(post.blocks, collections) : post.content,
    })),
  );
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
