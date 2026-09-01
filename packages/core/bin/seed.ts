#!/usr/bin/env bun
/** Seeds a demo site. Idempotent-ish: skips users/agents/posts that already exist. */
import { mkdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { openDb, defaultDbPath } from "../src/db";
import { media, posts, users, agents } from "../src/db/schema";
import { hooks } from "../src/hooks";
import { registerCoreTools, registry, dispatch } from "../src/tools";
import { mediaDir } from "../src/tools/media";
import { createUser, userActor } from "../src/auth";
import type { Actor } from "@wove/sdk";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin1234";

mkdirSync(mediaDir(), { recursive: true });
const db = openDb(defaultDbPath());
registerCoreTools(registry);

let admin = db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).get();
if (!admin) {
  admin = await createUser(db, { email: ADMIN_EMAIL, name: "Ada Admin", password: ADMIN_PASSWORD, role: "admin" }) as any;
  console.log(`  user    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
} else {
  console.log(`  user    ${ADMIN_EMAIL} (already existed)`);
}

/** A user per role, so the roles/ownership rules are exercisable straight after a seed. */
const TEAM = [
  { email: "editor@example.com", password: "editor1234", name: "Edie Editor", role: "editor" as const },
  { email: "writer@example.com", password: "writer1234", name: "Wren Writer", role: "contributor" as const },
];
for (const m of TEAM) {
  if (db.select().from(users).where(eq(users.email, m.email)).get()) {
    console.log(`  user    ${m.email} (already existed)`);
    continue;
  }
  await createUser(db, m);
  console.log(`  user    ${m.email} / ${m.password}  (${m.role})`);
}

const actor: Actor = userActor(admin!);
const ctx = { actor, channel: "system" as const, db, hooks };

async function call(name: string, input: unknown) {
  const r = await dispatch(name, input, ctx);
  if (!r.ok) throw new Error(`${name}: ${r.error.code} ${r.error.message} ${JSON.stringify(r.error.details ?? {})}`);
  return r.data as any;
}

// ---- agent
const existingAgent = db.select().from(agents).where(eq(agents.name, "demo-agent")).get();
if (existingAgent) {
  console.log(`  agent   demo-agent already exists (id ${existingAgent.id}); key not recoverable — revoke + reseed for a new one`);
} else {
  const a = await call("agent.create", { name: "demo-agent", scopes: ["*"] });
  console.log(`  agent   demo-agent  key: ${a.apiKey}`);
}

// ---- settings
await call("settings.update", {
  siteTitle: "Wove demo",
  tagline: "The CMS for the agentic era",
  siteUrl: "http://localhost:4321",
});

// ---- content
const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
const seedPosts = [
  {
    type: "post", title: "Hello, Wove", status: "published",
    content: "# Hello\n\nEvery admin action here is a typed, permissioned, auditable tool.",
    excerpt: "Why Wove exists.",
    terms: [{ taxonomy: "category", name: "Announcements" }, { taxonomy: "tag", name: "intro" }],
  },
  {
    type: "post", title: "Tools, not routes", status: "published",
    content: "## Tools, not routes\n\nOne registry derives REST, MCP, OpenAPI and the audit log.",
    excerpt: "One registry, four surfaces.",
    terms: [{ taxonomy: "category", name: "Engineering" }, { taxonomy: "tag", name: "architecture" }],
  },
  {
    type: "post", title: "What ships next week", status: "scheduled", publishedAt: soon,
    content: "A roadmap post that is scheduled, not yet visible to the public API.",
    terms: [{ taxonomy: "category", name: "Announcements" }],
  },
  {
    type: "post", title: "Draft: plugin authoring guide", status: "draft",
    content: "Notes on `definePlugin` — not finished yet.",
    terms: [{ taxonomy: "tag", name: "plugins" }],
  },
  {
    type: "post", title: "Draft: Postgres migration notes", status: "draft",
    content: "TODO: swap the drizzle driver, keep the same DB type.",
    terms: [{ taxonomy: "tag", name: "database" }],
  },
  {
    type: "page", title: "Home", slug: "home", status: "published",
    seo: { description: "Wove is an open-source CMS where every editorial action is a typed, permissioned, audited tool — drivable by people and agents alike." },
    // A blocks page: `content` is the JSON document, `format` is set to "blocks" by post.create.
    blocks: {
      version: 1,
      blocks: [
        {
          type: "hero",
          props: {
            eyebrow: "Open source CMS",
            headline: "The CMS agents can actually drive",
            subheadline: "Wove exposes every editorial action as a typed, permissioned, audited tool — so people and agents publish through the same door.",
            layout: "split",
            buttons: [
              { label: "Read the docs", href: "/about", variant: "primary" },
              { label: "Browse the blog", href: "/blog", variant: "secondary" },
            ],
          },
        },
        {
          type: "features",
          props: {
            headline: "Built tools-first",
            intro: "One registry defines the contract. REST, MCP, OpenAPI and the audit log are derived from it, never hand-maintained.",
            columns: 3,
            items: [
              { icon: "plug", title: "One registry, four surfaces", body: "Register a tool once and it is instantly callable over REST, over MCP, documented in OpenAPI, and recorded in the audit log." },
              { icon: "shield-check", title: "Scopes on every call", body: "Users and agents are the same kind of principal: an actor with scopes. Nothing runs without the scopes it declares." },
              { icon: "history", title: "Revisions by default", body: "Every update snapshots the previous state, so an agent's edit is as reversible as a human's." },
              { icon: "blocks", title: "Blocks for pages", body: "Landing pages are typed block documents — validated on write, rendered by the site, editable by hand or by model." },
              { icon: "sparkles", title: "Bring your own model", body: "Anthropic, OpenAI, Google, xAI or any OpenAI-compatible endpoint, with per-call token metering." },
              { icon: "file-json", title: "Typed end to end", body: "The SDK owns the schemas; core implements exactly the catalog, and drift fails the build." },
            ],
          },
        },
        {
          type: "stats",
          props: {
            headline: "The shape of the system",
            items: [
              { value: "32", label: "typed tools in the catalog" },
              { value: "4", label: "surfaces derived from one registry" },
              { value: "12", label: "page block types" },
              { value: "100%", label: "of mutations audited" },
            ],
          },
        },
        {
          type: "testimonials",
          props: {
            headline: "What early users say",
            items: [
              { quote: "Our publishing agent stopped screen-scraping an admin UI and started calling tools. The audit log finally tells us who changed what.", name: "Dana Okoye", role: "Platform lead, Kestrel Media" },
              { quote: "Blocks were the missing piece. The model drafts a page, we tweak two headlines, and it ships.", name: "Marco Vidal", role: "Head of content, Northwind" },
            ],
          },
        },
        {
          type: "cta",
          props: {
            headline: "Give your agents a real CMS",
            body: "Clone the repo, run the seed, and point an MCP client at /mcp.",
            style: "card",
            buttons: [{ label: "Get started", href: "/about", variant: "primary" }],
          },
        },
      ],
    },
  },
  {
    type: "page", title: "About", slug: "about", status: "published",
    content: "Wove is an open-source CMS built for humans and agents on equal footing.",
  },
];

// ---- menus
await call("menu.set", {
  location: "header",
  name: "Header",
  items: [
    { id: "home", label: "Home", href: "/" },
    { id: "blog", label: "Blog", href: "/blog" },
    { id: "about", label: "About", href: "/about" },
  ],
});
await call("menu.set", {
  location: "footer",
  name: "Footer",
  items: [
    { id: "about", label: "About", href: "/about" },
    { id: "blog", label: "Blog", href: "/blog" },
  ],
});
console.log("  menus   header, footer");

let created = 0;
for (const p of seedPosts) {
  const slug = (p as any).slug;
  if (slug && db.select().from(posts).where(eq(posts.slug, slug)).get()) continue;
  if (db.select().from(posts).where(eq(posts.title, p.title)).get()) continue;
  await call("post.create", p);
  created += 1;
}
console.log(`  content ${created} post(s)/page(s) created`);

// ---- featured image on the first published post, when the library has something to point at
const firstImage = db.select().from(media).all().find((m) => m.mime.startsWith("image/"));
if (firstImage) {
  const target = db.select().from(posts).where(eq(posts.slug, "hello-wove")).get();
  if (target && !target.featuredImage) {
    await call("post.update", {
      id: target.id,
      featuredImage: {
        url: firstImage.url,
        alt: firstImage.alt ?? "",
        mediaId: firstImage.id,
        ...(firstImage.width ? { width: firstImage.width } : {}),
        ...(firstImage.height ? { height: firstImage.height } : {}),
      },
    });
    console.log(`  featured ${firstImage.url} -> ${target.slug}`);
  }
}
console.log(`  db      ${defaultDbPath()}`);
console.log("  done.");
