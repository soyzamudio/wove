import type { BlocksDoc } from "@agentpress/sdk";
import type { AnyBlock } from "./types";
import { BLOCK_TYPES, blockDefaults } from "./defaults";

/**
 * A document containing one of every block type, with real copy.
 * Used by tests, admin previews, and the site's mock mode.
 */
export function sampleDoc(): BlocksDoc {
  const blocks = BLOCK_TYPES.map((type) => ({ id: `sample-${type}`, type, props: blockDefaults(type) })) as AnyBlock[];

  for (const block of blocks) {
    if (block.type === "hero") {
      block.props.eyebrow = "AgentPress";
      block.props.headline = "A CMS your agents can actually use";
      block.props.subheadline =
        "Typed content, a real API, and static pages that ship no JavaScript. Write it yourself or let an agent do it.";
    }
    if (block.type === "markdown") {
      block.props.markdown =
        "## Built from blocks\n\nEvery page is a list of typed sections. The same renderer draws the live builder canvas in the admin and the static HTML on the public site, so what you edit is exactly what ships.\n\n1. Pick a block\n2. Fill in the props\n3. Publish\n";
    }
    if (block.type === "cta") {
      block.props.headline = "Publish your first page today";
      block.props.style = "dark";
    }
  }

  return { version: 1, blocks } as BlocksDoc;
}
