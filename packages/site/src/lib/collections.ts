import type { BlocksDoc } from "@wove/sdk";
import type { CollectionData } from "@wove/blocks";
import { getCollectionEntries, getPublicCollections } from "./api";

/**
 * The collection slugs a blocks document needs, in first-seen order, deduped.
 * Pure — the fetching half lives in `collectCollectionData`.
 */
export function collectionSlugsIn(doc: BlocksDoc | null | undefined): string[] {
  const slugs: string[] = [];
  for (const block of doc?.blocks ?? []) {
    if (block.type !== "collection") continue;
    const slug = block.props.collection?.trim();
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

/**
 * Fetch definitions + published entries for every collection a document references,
 * keyed by slug for `ctx.collections`. Anything missing, private or errored is simply
 * omitted, which makes the block render its placeholder instead of failing the page.
 */
export async function collectCollectionData(
  doc: BlocksDoc | null | undefined,
): Promise<Record<string, CollectionData> | undefined> {
  const slugs = collectionSlugsIn(doc);
  if (slugs.length === 0) return undefined;

  let defs: Awaited<ReturnType<typeof getPublicCollections>>;
  try {
    defs = await getPublicCollections();
  } catch {
    return undefined;
  }

  const pairs = await Promise.all(
    slugs.map(async (slug): Promise<[string, CollectionData] | null> => {
      const collection = defs.find((c) => c.slug === slug);
      if (!collection) return null;
      try {
        const entries = await getCollectionEntries(slug);
        return [slug, { collection, entries }];
      } catch {
        return null;
      }
    }),
  );

  const map = Object.fromEntries(pairs.filter((p): p is [string, CollectionData] => p !== null));
  return Object.keys(map).length ? map : undefined;
}

/** Same as {@link collectCollectionData}, merged across several documents. */
export async function collectCollectionDataForDocs(
  docs: (BlocksDoc | null | undefined)[],
): Promise<Record<string, CollectionData> | undefined> {
  const blocks = docs.flatMap((doc) => doc?.blocks ?? []);
  return collectCollectionData({ version: 1, blocks });
}
