import type { Post, Settings, Term } from "@agentpress/sdk";
import { sampleDoc } from "@agentpress/blocks";

const now = "2026-01-01T00:00:00.000Z";

export const mockSettings: Settings = {
  siteTitle: "agentpress Demo",
  tagline: "The CMS for the agentic era.",
  siteUrl: "http://localhost:4321",
  theme: "default",
  postsPerPage: 10,
};

export const mockPosts: Post[] = [
  {
    id: "1",
    type: "post",
    slug: "hello-world",
    title: "Hello, World",
    content:
      "# Hello, World\n\nThis is the first post published on this agentpress site. " +
      "It includes a relative image reference to make sure media links resolve correctly:\n\n" +
      "![A placeholder graphic](/media/hello.jpg)\n\n" +
      "Agents and humans publish through the same typed tools.",
    excerpt: "An introductory post welcoming you to agentpress.",
    status: "published",
    authorId: "1",
    publishedAt: "2026-01-01T09:00:00.000Z",
    meta: {},
    format: "markdown",
    blocks: null,
    terms: [
      { taxonomy: "tag", slug: "intro", name: "Intro" },
      { taxonomy: "category", slug: "news", name: "News" },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "2",
    type: "post",
    slug: "second-post",
    title: "Shipping the Public Renderer",
    content:
      "## Zero JS by default\n\nThe public site renders server-side with Astro and ships " +
      "no client-side JavaScript unless a theme opts in.\n\nIt also exposes `/llms.txt` and " +
      "`/feed.json` so agents can consume the site without scraping HTML.",
    excerpt: "Notes on how the Astro-based public site renders content.",
    status: "published",
    authorId: "1",
    publishedAt: "2026-01-05T12:00:00.000Z",
    meta: {},
    format: "markdown",
    blocks: null,
    terms: [{ taxonomy: "tag", slug: "updates", name: "Updates" }],
    createdAt: now,
    updatedAt: now,
  },
];

export const mockPages: Post[] = [
  {
    id: "3",
    type: "page",
    slug: "about",
    title: "About",
    content: "# About\n\nagentpress is an open-source, agent-native CMS.",
    excerpt: "What agentpress is and who it's for.",
    status: "published",
    authorId: "1",
    publishedAt: "2026-01-01T00:00:00.000Z",
    meta: {},
    format: "markdown",
    blocks: null,
    terms: [],
    createdAt: now,
    updatedAt: now,
  },
  (() => {
    const blocks = sampleDoc();
    return {
      id: "4",
      type: "page",
      slug: "home",
      title: "Home",
      content: JSON.stringify(blocks),
      excerpt: "A CMS your agents can actually use.",
      status: "published",
      authorId: "1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      meta: {},
      format: "blocks",
      blocks,
      terms: [],
      createdAt: now,
      updatedAt: now,
    } satisfies Post;
  })(),
];

export const mockAllContent: Post[] = [...mockPosts, ...mockPages];

export const mockTerms: Term[] = [
  { id: "t1", taxonomy: "tag", slug: "intro", name: "Intro", count: 1 },
  { id: "t2", taxonomy: "tag", slug: "updates", name: "Updates", count: 1 },
  { id: "t3", taxonomy: "category", slug: "news", name: "News", count: 1 },
];
