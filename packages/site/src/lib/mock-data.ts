import type { Design, Menu, Post, Settings, Term } from "@wove/sdk";
import { sampleDoc } from "@wove/blocks";

const now = "2026-01-01T00:00:00.000Z";

export const mockSettings: Settings = {
  siteTitle: "wove Demo",
  tagline: "The CMS for the agentic era.",
  siteUrl: "http://localhost:4321",
  theme: "default",
  postsPerPage: 10,
  postPermalink: "/:slug",
};

/** Mirrors core's path computation so the fixtures stay honest about `Post.path`. */
const postPath = (slug: string) => mockSettings.postPermalink.replace(":slug", slug);

export const mockMenus: Menu[] = [
  {
    location: "header",
    name: "Header",
    items: [
      { id: "m-home", label: "Home", href: "/" },
      { id: "m-blog", label: "Blog", href: "/blog" },
      {
        id: "m-about",
        label: "About",
        href: "/about",
        children: [{ id: "m-about-team", label: "Our approach", href: "/about#approach" }],
      },
    ],
  },
  {
    location: "footer",
    name: "Footer",
    items: [
      { id: "f-blog", label: "Blog", href: "/blog" },
      { id: "f-feed", label: "RSS", href: "/rss.xml" },
    ],
  },
];

export const mockDesign: Design = {
  logo: null,
  colors: {
    accent: "#e8734a",
    background: "#ffffff",
    foreground: "#18181b",
    darkBackground: "#0a0a0a",
    darkForeground: "#f4f4f5",
  },
  fonts: { heading: "inter", body: "system" },
  radius: 10,
  customCss: ".site-title a { letter-spacing: -0.02em; }",
};

export const mockPosts: Post[] = [
  {
    id: "1",
    type: "post",
    slug: "hello-world",
    title: "Hello, World",
    content:
      "# Hello, World\n\nThis is the first post published on this wove site. " +
      "It includes a relative image reference to make sure media links resolve correctly:\n\n" +
      "![A placeholder graphic](/media/hello.jpg)\n\n" +
      "Agents and humans publish through the same typed tools.",
    excerpt: "An introductory post welcoming you to wove.",
    featuredImage: {
      url: "/media/hello-featured.jpg",
      alt: "A placeholder hero graphic",
      width: 1600,
      height: 900,
      variants: [
        { width: 400, url: "/media/hello-featured-400.jpg" },
        { width: 800, url: "/media/hello-featured-800.jpg" },
        { width: 1600, url: "/media/hello-featured-1600.jpg" },
      ],
    },
    seo: { title: null, description: null, ogImage: null, noindex: false },
    status: "published",
    parentId: null,
    path: postPath("hello-world"),
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
    featuredImage: null,
    seo: {
      title: "Shipping the Public Renderer — a deep dive",
      description: "Custom SEO description overriding the excerpt for search engines and social cards.",
      ogImage: null,
      noindex: false,
    },
    status: "published",
    parentId: null,
    path: postPath("second-post"),
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
    content: "# About\n\nwove is an open-source, agent-native CMS.",
    excerpt: "What wove is and who it's for.",
    featuredImage: null,
    seo: { title: null, description: null, ogImage: null, noindex: false },
    status: "published",
    parentId: null,
    path: "/about",
    authorId: "1",
    publishedAt: "2026-01-01T00:00:00.000Z",
    meta: {},
    format: "markdown",
    blocks: null,
    terms: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "5",
    type: "page",
    slug: "services",
    title: "Services",
    content: "# Services\n\nWhat we do.",
    excerpt: "What we do.",
    featuredImage: null,
    seo: { title: null, description: null, ogImage: null, noindex: false },
    status: "published",
    parentId: null,
    path: "/services",
    authorId: "1",
    publishedAt: "2026-01-01T00:00:00.000Z",
    meta: {},
    format: "markdown",
    blocks: null,
    terms: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "6",
    type: "page",
    slug: "consulting",
    title: "Consulting",
    content: "# Consulting\n\nA nested page, one level under Services.",
    excerpt: "A nested page under Services.",
    featuredImage: null,
    seo: { title: null, description: null, ogImage: null, noindex: false },
    status: "published",
    parentId: "5",
    path: "/services/consulting",
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
      featuredImage: null,
      seo: { title: null, description: null, ogImage: null, noindex: false },
      status: "published",
      parentId: null,
      path: "/home",
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

/** Naive title/content substring search over the published mock fixtures. */
export function mockSearch(q: string, limit = 20): Post[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return mockAllContent
    .filter((post) => post.status === "published")
    .filter((post) => post.title.toLowerCase().includes(needle) || post.content.toLowerCase().includes(needle))
    .slice(0, limit);
}
