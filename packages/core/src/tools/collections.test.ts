import { describe, expect, test } from "bun:test";
import type { Actor } from "@wove/sdk";
import { ADMIN, EDITOR, makeHarness, unwrap } from "../test-helpers";
import { entrySchemaFor } from "../collections/schema";
import { users } from "../db/schema";

const h = makeHarness();
const req = (path: string) => h.app.fetch(new Request(`http://localhost:4000${path}`));

const AUTHOR: Actor = {
  kind: "user", id: "u_author",
  scopes: ["content:read", "content:write", "content:publish", "media:read", "media:write", "settings:read"],
};
h.db.insert(users).values({ id: "u_author", email: "a@example.com", name: "Ann Author", role: "author", passwordHash: "x", createdAt: new Date().toISOString() }).run();
h.db.insert(users).values({ id: "u_admin", email: "admin@example.com", name: "Ada", role: "admin", passwordHash: "x", createdAt: new Date().toISOString() }).run();

const ALL_FIELDS = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "summary", label: "Summary", type: "textarea" },
  { key: "body", label: "Body", type: "markdown" },
  { key: "count", label: "Count", type: "number" },
  { key: "featured", label: "Featured", type: "boolean" },
  { key: "day", label: "Day", type: "date" },
  { key: "kind", label: "Kind", type: "select", options: ["a", "b"] },
  { key: "photo", label: "Photo", type: "image" },
  { key: "link", label: "Link", type: "url" },
] as any[];

describe("collections / field schema", () => {
  const schema = entrySchemaFor({ slug: "x", fields: ALL_FIELDS as any });

  test("accepts one value of every type", () => {
    const ok = schema.safeParse({
      title: "hi", summary: "s", body: "# b", count: 3, featured: true,
      day: "2024-01-02", kind: "a", photo: { url: "/media/a.png", alt: "" }, link: "https://x.dev",
    });
    expect(ok.success).toBe(true);
  });

  test("required vs optional+nullable", () => {
    expect(schema.safeParse({ title: "hi" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false); // title required
    expect(schema.safeParse({ title: "hi", count: null, kind: null }).success).toBe(true);
    expect(schema.safeParse({ title: null }).success).toBe(false);
  });

  test("type rules: date regex, select options, url, image shape", () => {
    expect(schema.safeParse({ title: "t", day: "2024-1-2" }).success).toBe(false);
    expect(schema.safeParse({ title: "t", day: "not-a-date" }).success).toBe(false);
    expect(schema.safeParse({ title: "t", day: "2024-12-31" }).success).toBe(true);
    expect(schema.safeParse({ title: "t", kind: "c" }).success).toBe(false);
    expect(schema.safeParse({ title: "t", link: "not a url" }).success).toBe(false);
    expect(schema.safeParse({ title: "t", photo: { alt: "x" } }).success).toBe(false); // url required
    expect(schema.safeParse({ title: "t", photo: { url: "/media/a.png" } }).success).toBe(true); // alt defaults
    expect(schema.safeParse({ title: "t", count: "3" }).success).toBe(false);
    expect(schema.safeParse({ title: "t", featured: "yes" }).success).toBe(false);
  });

  test("unknown keys are rejected, not stripped", () => {
    expect(schema.safeParse({ title: "t", nope: 1 }).success).toBe(false);
  });
});

describe("collection.create", () => {
  test("derives slug, plural and titleFieldKey; dedupes slugs", async () => {
    const c = unwrap(await h.call(ADMIN, "collection.create", {
      name: "Event",
      fields: [{ key: "name", label: "Name", type: "text" }, { key: "when", label: "When", type: "date" }],
    }));
    expect(c.slug).toBe("event");
    expect(c.namePlural).toBe("Events");
    expect(c.titleFieldKey).toBe("name");
    expect(c.icon).toBe("database");
    expect(c.public).toBe(false);

    const dup = unwrap(await h.call(ADMIN, "collection.create", {
      name: "Event", fields: [{ key: "name", label: "Name", type: "text" }],
    }));
    expect(dup.slug).toBe("event-2");
  });

  test("reserved slugs, duplicate keys, optionless selects and bad title fields are 400s", async () => {
    for (const slug of ["posts", "pages", "media", "settings", "users", "menus"]) {
      const r = await h.call(ADMIN, "collection.create", {
        slug, name: "Nope", fields: [{ key: "name", label: "Name", type: "text" }],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.status).toBe(400); expect(r.error.message).toContain("reserved"); }
    }

    const dupKeys = await h.call(ADMIN, "collection.create", {
      name: "Dup", fields: [{ key: "name", label: "A", type: "text" }, { key: "name", label: "B", type: "text" }],
    });
    expect(dupKeys.ok).toBe(false);
    if (!dupKeys.ok) { expect(dupKeys.status).toBe(400); expect(dupKeys.error.message).toContain("name"); }

    const noOptions = await h.call(ADMIN, "collection.create", {
      name: "Sel", fields: [{ key: "name", label: "N", type: "text" }, { key: "pick", label: "Pick", type: "select" }],
    });
    expect(noOptions.ok).toBe(false);
    if (!noOptions.ok) expect(noOptions.error.message).toContain("no options");

    const noText = await h.call(ADMIN, "collection.create", {
      name: "Numbers", fields: [{ key: "n", label: "N", type: "number" }],
    });
    expect(noText.ok).toBe(false);
    if (!noText.ok) expect(noText.error.message).toContain("titleFieldKey");

    const badTitle = await h.call(ADMIN, "collection.create", {
      name: "Bad", titleFieldKey: "missing", fields: [{ key: "name", label: "N", type: "text" }],
    });
    expect(badTitle.ok).toBe(false);
    if (!badTitle.ok) expect(badTitle.error.message).toContain("not a text field");
  });
});

describe("entries", () => {
  const setup = async () => {
    const slug = `things-${Math.random().toString(36).slice(2, 8)}`;
    unwrap(await h.call(ADMIN, "collection.create", { slug, name: "Thing", public: true, fields: ALL_FIELDS }));
    return slug;
  };

  test("create validates data and reports unknown keys by name", async () => {
    const slug = await setup();
    const e = unwrap(await h.call(ADMIN, "entry.create", {
      collection: slug, status: "published", data: { title: "One", kind: "a", count: 2 },
    }));
    expect(e.data).toEqual({ title: "One", kind: "a", count: 2 });
    expect(e.authorId).toBe("u_admin");

    const unknown = await h.call(ADMIN, "entry.create", { collection: slug, data: { title: "x", nope: 1, alsoNope: 2 } });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.status).toBe(400);
      expect(unknown.error.message).toContain("nope");
      expect(unknown.error.message).toContain("alsoNope");
      expect((unknown.error.details as any).unknown).toEqual(["nope", "alsoNope"]);
    }

    const badSelect = await h.call(ADMIN, "entry.create", { collection: slug, data: { title: "x", kind: "zzz" } });
    expect(badSelect.ok).toBe(false);
    if (!badSelect.ok) expect(badSelect.error.message).toContain("kind");

    const missing = await h.call(ADMIN, "entry.create", { collection: slug, data: { count: 1 } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.message).toContain("title");
  });

  test("update merges by key, null clears, and revalidates the merged result", async () => {
    const slug = await setup();
    const e = unwrap(await h.call(ADMIN, "entry.create", {
      collection: slug, data: { title: "One", count: 1, kind: "a" },
    }));

    const merged = unwrap(await h.call(ADMIN, "entry.update", { collection: slug, id: e.id, data: { count: 9 } }));
    expect(merged.data).toEqual({ title: "One", count: 9, kind: "a" });

    const cleared = unwrap(await h.call(ADMIN, "entry.update", { collection: slug, id: e.id, data: { kind: null } }));
    expect(cleared.data).toEqual({ title: "One", count: 9 });
    expect("kind" in cleared.data).toBe(false);

    const clearRequired = await h.call(ADMIN, "entry.update", { collection: slug, id: e.id, data: { title: null } });
    expect(clearRequired.ok).toBe(false);
    if (!clearRequired.ok) expect(clearRequired.status).toBe(400);

    const badMerge = await h.call(ADMIN, "entry.update", { collection: slug, id: e.id, data: { day: "nope" } });
    expect(badMerge.ok).toBe(false);

    const statusOnly = unwrap(await h.call(ADMIN, "entry.update", { collection: slug, id: e.id, status: "published" }));
    expect(statusOnly.status).toBe("published");
    expect(statusOnly.data).toEqual({ title: "One", count: 9 });
  });

  test("list filters by status and q, newest first, and paginates", async () => {
    const slug = await setup();
    for (const title of ["Alpha", "Beta", "Gamma"]) {
      unwrap(await h.call(ADMIN, "entry.create", { collection: slug, data: { title }, status: title === "Gamma" ? "draft" : "published" }));
    }
    const all = unwrap(await h.call(ADMIN, "entry.list", { collection: slug }));
    expect(all.items.length).toBe(3);
    const published = unwrap(await h.call(ADMIN, "entry.list", { collection: slug, status: "published" }));
    expect(published.items.length).toBe(2);
    const found = unwrap(await h.call(ADMIN, "entry.list", { collection: slug, q: "Beta" }));
    expect(found.items.map((i: any) => i.data.title)).toEqual(["Beta"]);

    const page = unwrap(await h.call(ADMIN, "entry.list", { collection: slug, limit: 2 }));
    expect(page.items.length).toBe(2);
    expect(page.nextCursor).toBeTruthy();
    const rest = unwrap(await h.call(ADMIN, "entry.list", { collection: slug, limit: 2, cursor: page.nextCursor }));
    expect(rest.items.length).toBe(1);
    expect(rest.nextCursor).toBeNull();

    const missing = await h.call(ADMIN, "entry.list", { collection: "nope" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);
  });

  test("authors may only edit or delete their own entries", async () => {
    const slug = await setup();
    const mine = unwrap(await h.call(AUTHOR, "entry.create", { collection: slug, data: { title: "Mine" } }));
    expect(mine.authorId).toBe("u_author");
    const theirs = unwrap(await h.call(ADMIN, "entry.create", { collection: slug, data: { title: "Theirs" } }));

    unwrap(await h.call(AUTHOR, "entry.update", { collection: slug, id: mine.id, data: { count: 1 } }));

    const foreign = await h.call(AUTHOR, "entry.update", { collection: slug, id: theirs.id, data: { count: 1 } });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) { expect(foreign.status).toBe(403); expect(foreign.error.message).toContain("your own"); }

    const del = await h.call(AUTHOR, "entry.delete", { collection: slug, id: theirs.id });
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.status).toBe(403);

    // Editors reach everything.
    unwrap(await h.call(EDITOR, "entry.update", { collection: slug, id: theirs.id, data: { count: 2 } }));
    unwrap(await h.call(AUTHOR, "entry.delete", { collection: slug, id: mine.id }));
  });
});

describe("collection.update / delete", () => {
  test("removing a field keeps orphan data readable and out of validation", async () => {
    const slug = `orphan-${Math.random().toString(36).slice(2, 8)}`;
    unwrap(await h.call(ADMIN, "collection.create", {
      slug, name: "Orphan",
      fields: [{ key: "name", label: "Name", type: "text", required: true }, { key: "legacy", label: "Legacy", type: "number" }],
    }));
    const e = unwrap(await h.call(ADMIN, "entry.create", { collection: slug, data: { name: "n", legacy: 42 } }));

    unwrap(await h.call(ADMIN, "collection.update", {
      slug, fields: [{ key: "name", label: "Name", type: "text", required: true }],
    }));

    const read = unwrap(await h.call(ADMIN, "entry.get", { collection: slug, id: e.id }));
    expect(read.data.legacy).toBe(42); // still there, just ignored

    // The removed key is now unknown on the wire...
    const rejected = await h.call(ADMIN, "entry.update", { collection: slug, id: e.id, data: { legacy: 1 } });
    expect(rejected.ok).toBe(false);
    // ...but an unrelated edit still validates and preserves it.
    const updated = unwrap(await h.call(ADMIN, "entry.update", { collection: slug, id: e.id, data: { name: "n2" } }));
    expect(updated.data).toEqual({ legacy: 42, name: "n2" });
  });

  test("update revalidates titleFieldKey against the new fields", async () => {
    const slug = `title-${Math.random().toString(36).slice(2, 8)}`;
    unwrap(await h.call(ADMIN, "collection.create", {
      slug, name: "Titled",
      fields: [{ key: "name", label: "Name", type: "text" }, { key: "other", label: "Other", type: "text" }],
    }));
    const orphanedTitle = await h.call(ADMIN, "collection.update", {
      slug, fields: [{ key: "other", label: "Other", type: "text" }],
    });
    expect(orphanedTitle.ok).toBe(false);
    if (!orphanedTitle.ok) expect(orphanedTitle.error.message).toContain("not a text field");

    const ok = unwrap(await h.call(ADMIN, "collection.update", {
      slug, titleFieldKey: "other", fields: [{ key: "other", label: "Other", type: "text" }],
    }));
    expect(ok.titleFieldKey).toBe("other");
  });

  test("delete refuses a non-empty collection unless deleteEntries is set", async () => {
    const slug = `doomed-${Math.random().toString(36).slice(2, 8)}`;
    unwrap(await h.call(ADMIN, "collection.create", { slug, name: "Doomed", fields: [{ key: "name", label: "N", type: "text" }] }));
    unwrap(await h.call(ADMIN, "entry.create", { collection: slug, data: { name: "x" } }));

    const guarded = await h.call(ADMIN, "collection.delete", { slug });
    expect(guarded.ok).toBe(false);
    if (!guarded.ok) { expect(guarded.status).toBe(409); expect((guarded.error.details as any).entryCount).toBe(1); }

    const gone = unwrap(await h.call(ADMIN, "collection.delete", { slug, deleteEntries: true }));
    expect(gone).toEqual({ ok: true, deletedEntries: 1 });
    expect((await h.call(ADMIN, "collection.get", { slug })).ok).toBe(false);
    expect((await h.call(ADMIN, "entry.list", { collection: slug })).ok).toBe(false);
  });
});

describe("collection.list / get outputs", () => {
  test("entryCount is accurate and entrySchema describes every field", async () => {
    const slug = `sch-${Math.random().toString(36).slice(2, 8)}`;
    unwrap(await h.call(ADMIN, "collection.create", { slug, name: "Sch", fields: ALL_FIELDS }));
    unwrap(await h.call(ADMIN, "entry.create", { collection: slug, data: { title: "a" } }));
    unwrap(await h.call(ADMIN, "entry.create", { collection: slug, data: { title: "b" } }));

    const got = unwrap(await h.call(ADMIN, "collection.get", { slug }));
    expect(got.entryCount).toBe(2);
    const schema = got.entrySchema as any;
    expect(Object.keys(schema.properties).sort()).toEqual(ALL_FIELDS.map((f) => f.key).sort());
    expect(schema.required).toEqual(["title"]);
    expect(schema.additionalProperties).toBe(false);
    expect(JSON.stringify(schema.properties.kind)).toContain('"enum":["a","b"]');
    expect(JSON.stringify(schema.properties.day)).toContain("\\\\d{4}");

    const listed = unwrap(await h.call(ADMIN, "collection.list", {}));
    const row = listed.find((c: any) => c.slug === slug);
    expect(row.entryCount).toBe(2);
    expect(row.entrySchema).toBeTruthy();

    // The cached schema follows a field change.
    unwrap(await h.call(ADMIN, "collection.update", { slug, fields: [{ key: "title", label: "Title", type: "text", required: true }] }));
    const after = unwrap(await h.call(ADMIN, "collection.get", { slug }));
    expect(Object.keys((after.entrySchema as any).properties)).toEqual(["title"]);
  });
});

describe("public collection endpoints", () => {
  test("only public collections, only published entries", async () => {
    unwrap(await h.call(ADMIN, "collection.create", {
      slug: "pub", name: "Pub", public: true, fields: [{ key: "name", label: "N", type: "text", required: true }],
    }));
    unwrap(await h.call(ADMIN, "collection.create", {
      slug: "priv", name: "Priv", fields: [{ key: "name", label: "N", type: "text", required: true }],
    }));
    unwrap(await h.call(ADMIN, "entry.create", { collection: "pub", data: { name: "Live" }, status: "published" }));
    unwrap(await h.call(ADMIN, "entry.create", { collection: "pub", data: { name: "Hidden" }, status: "draft" }));
    unwrap(await h.call(ADMIN, "entry.create", { collection: "priv", data: { name: "Secret" }, status: "published" }));

    const list = await (await req("/api/public/collections")).json();
    expect(list.map((c: any) => c.slug)).toContain("pub");
    expect(list.map((c: any) => c.slug)).not.toContain("priv");
    expect(list.find((c: any) => c.slug === "pub").entrySchema).toBeTruthy();

    const entries = await (await req("/api/public/collections/pub/entries")).json();
    expect(entries.items.map((e: any) => e.data.name)).toEqual(["Live"]);
    expect(entries.nextCursor).toBeNull();

    expect((await req("/api/public/collections/priv/entries")).status).toBe(404);
    expect((await req("/api/public/collections/nope/entries")).status).toBe(404);
  });
});
