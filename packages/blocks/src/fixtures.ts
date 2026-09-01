import type { BlocksDoc } from "@wove/sdk";
import type { AnyBlock } from "./types";
import type { CollectionData } from "./context";
import { BLOCK_TYPES, blockDefaults } from "./defaults";

/**
 * A document containing one of every block type, with real copy.
 * Used by tests, admin previews, and the site's mock mode.
 */
export function sampleDoc(): BlocksDoc {
  const blocks = BLOCK_TYPES.map((type) => ({ id: `sample-${type}`, type, props: blockDefaults(type) })) as AnyBlock[];

  for (const block of blocks) {
    if (block.type === "hero") {
      block.props.eyebrow = "Wove";
      block.props.headline = "A CMS your agents can actually use";
      block.props.subheadline =
        "Typed content, a real API, and static pages that ship no JavaScript. Write it yourself or let an agent do it.";
    }
    if (block.type === "markdown") {
      block.props.markdown =
        "## Built from blocks\n\nEvery page is a list of typed sections. The same renderer draws the live builder canvas in the admin and the static HTML on the public site, so what you edit is exactly what ships.\n\n1. Pick a block\n2. Fill in the props\n3. Publish\n";
    }
    if (block.type === "collection") {
      block.props.headline = "Meet the team";
      block.props.collection = "team";
      block.props.columns = 3;
    }
    if (block.type === "cta") {
      block.props.headline = "Publish your first page today";
      block.props.style = "dark";
    }
  }

  return { version: 1, blocks } as BlocksDoc;
}

const entryDate = "2026-01-01T00:00:00.000Z";

/**
 * Collection data matching the `collection` block in {@link sampleDoc}. Pass it as
 * `ctx.collections` so previews and mock mode render populated entries instead of
 * the "not prefetched" placeholder.
 */
export function sampleCollections(): Record<string, CollectionData> {
  return {
    team: {
      collection: {
        slug: "team",
        name: "Team member",
        namePlural: "Team",
        titleFieldKey: "name",
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          { key: "photo", label: "Photo", type: "image", required: false },
          { key: "role", label: "Role", type: "text", required: false },
          { key: "bio", label: "Bio", type: "markdown", required: false },
          { key: "started_at", label: "Started", type: "date", required: false },
        ],
      },
      entries: [
        {
          id: "ce-1",
          collection: "team",
          status: "published",
          data: {
            name: "Dana Whitfield",
            photo: { url: "/media/placeholder.svg", alt: "Dana Whitfield" },
            role: "Head of Product",
            bio: "Dana keeps the roadmap honest and the demos short.",
            started_at: entryDate,
          },
          authorId: "1",
          createdAt: entryDate,
          updatedAt: entryDate,
        },
        {
          id: "ce-2",
          collection: "team",
          status: "published",
          data: {
            name: "Marcus Lee",
            photo: { url: "/media/placeholder.svg", alt: "Marcus Lee" },
            role: "Editor",
            bio: "Marcus writes the words everyone else argues about.",
            started_at: entryDate,
          },
          authorId: "1",
          createdAt: entryDate,
          updatedAt: entryDate,
        },
        {
          id: "ce-3",
          collection: "team",
          status: "published",
          data: {
            name: "Priya Raman",
            photo: { url: "/media/placeholder.svg", alt: "Priya Raman" },
            role: "Engineering Lead",
            bio: "Priya makes the build fast and the pages faster.",
            started_at: entryDate,
          },
          authorId: "1",
          createdAt: entryDate,
          updatedAt: entryDate,
        },
      ],
    },
  };
}
