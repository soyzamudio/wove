import type { BlockProps, BlockType } from "@agentpress/sdk";
import type { z } from "zod";

/** Props for one block type. */
export type PropsOf<T extends BlockType> = z.infer<(typeof BlockProps)[T]>;

/**
 * A true discriminated union over block types. The sdk's `Block` type widens
 * `props` to a union of every variant (a limitation of how the zod union is
 * built there), which defeats `switch (block.type)` narrowing — this restores it.
 */
export type AnyBlock = { [T in BlockType]: { id: string; type: T; props: PropsOf<T> } }[BlockType];
