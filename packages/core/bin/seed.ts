#!/usr/bin/env bun
/** Seeds a demo site. Idempotent-ish: skips users/agents/posts that already exist. */
import { mkdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { openDb, defaultDbPath } from "../src/db";
import { posts, users, agents } from "../src/db/schema";
import { hooks } from "../src/hooks";
import { registerCoreTools, registry, dispatch } from "../src/tools";
import { mediaDir } from "../src/tools/media";
import { createUser, userActor } from "../src/auth";
import type { Actor } from "@agentpress/sdk";

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
  siteTitle: "agentpress demo",
  tagline: "The CMS for the agentic era",
  siteUrl: "http://localhost:4321",
});

// ---- content
const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
const seedPosts = [
  {
    type: "post", title: "Hello, agentpress", status: "published",
    content: "# Hello\n\nEvery admin action here is a typed, permissioned, auditable tool.",
    excerpt: "Why agentpress exists.",
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
    type: "page", title: "About", slug: "about", status: "published",
    content: "agentpress is an open-source CMS built for humans and agents on equal footing.",
  },
];

let created = 0;
for (const p of seedPosts) {
  const slug = (p as any).slug;
  if (slug && db.select().from(posts).where(eq(posts.slug, slug)).get()) continue;
  if (db.select().from(posts).where(eq(posts.title, p.title)).get()) continue;
  await call("post.create", p);
  created += 1;
}
console.log(`  content ${created} post(s)/page(s) created`);
console.log(`  db      ${defaultDbPath()}`);
console.log("  done.");
