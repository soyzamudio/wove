import type { Post, Settings } from "@wove/sdk";

/** Escape text for use inside RSS/XML element content. Pure, unit-tested. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface RssItemInput {
  post: Post;
  siteUrl: string;
  contentHtml: string;
}

function buildItem({ post, siteUrl, contentHtml }: RssItemInput): string {
  const url = `${siteUrl}${post.path}`;
  const pubDate = post.publishedAt ? new Date(post.publishedAt).toUTCString() : new Date(post.updatedAt).toUTCString();
  const categories = post.terms.map((term) => `<category>${xmlEscape(term.name)}</category>`).join("");
  return [
    "<item>",
    `<title>${xmlEscape(post.title)}</title>`,
    `<link>${xmlEscape(url)}</link>`,
    `<guid isPermaLink="true">${xmlEscape(url)}</guid>`,
    `<pubDate>${pubDate}</pubDate>`,
    post.excerpt ? `<description>${xmlEscape(post.excerpt)}</description>` : "",
    `<content:encoded><![CDATA[${contentHtml}]]></content:encoded>`,
    categories,
    "</item>",
  ]
    .filter(Boolean)
    .join("");
}

/** Build a full RSS 2.0 document. Pure function (no I/O) for unit testing. */
export function buildRssFeed(settings: Settings, items: RssItemInput[]): string {
  const siteUrl = settings.siteUrl.replace(/\/+$/, "");
  const channel = [
    "<channel>",
    `<title>${xmlEscape(settings.siteTitle)}</title>`,
    `<link>${xmlEscape(siteUrl)}</link>`,
    `<description>${xmlEscape(settings.tagline)}</description>`,
    `<atom:link href="${xmlEscape(`${siteUrl}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    ...items.map(buildItem),
    "</channel>",
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">${channel}</rss>`;
}
