import type { APIRoute } from "astro";
import { getSettings, listAllPublished } from "../lib/api";

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GET: APIRoute = async () => {
  const settings = await getSettings();
  const siteUrl = settings.siteUrl.replace(/\/+$/, "");
  const items = (await listAllPublished()).filter((post) => !post.seo.noindex);

  const urls = [
    `<url><loc>${xmlEscape(siteUrl + "/")}</loc></url>`,
    ...items.map((post) => {
      const lastmod = (post.updatedAt ?? post.publishedAt ?? "").slice(0, 10);
      return `<url><loc>${xmlEscape(`${siteUrl}/${post.slug}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
    }),
  ].join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
