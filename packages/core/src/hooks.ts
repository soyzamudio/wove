import type { Post } from "@agentpress/sdk";
import type { Actor, Channel, Media } from "@agentpress/sdk";

export interface HookContext {
  actor: Actor;
  channel: Channel;
}

/** Payload map — add an entry here and `on`/`emit` stay fully typed. */
export interface HookMap {
  /** Fired before a post row is written (create or update). Handlers may mutate `draft`. */
  "post.beforeSave": { draft: Record<string, unknown>; existing: Post | null; ctx: HookContext };
  /** Fired after a post row is written. */
  "post.afterSave": { post: Post; created: boolean; ctx: HookContext };
  /** Fired when a post transitions to published/scheduled. */
  "post.publish": { post: Post; ctx: HookContext };
  /** Fired after a media file has landed on disk. */
  "media.afterUpload": { media: Media; ctx: HookContext };
}

export type HookName = keyof HookMap;
export type HookHandler<N extends HookName> = (payload: HookMap[N]) => void | Promise<void>;

export class Hooks {
  #handlers = new Map<HookName, Set<HookHandler<never>>>();

  on<N extends HookName>(name: N, fn: HookHandler<N>): () => void {
    let set = this.#handlers.get(name);
    if (!set) this.#handlers.set(name, (set = new Set()));
    set.add(fn as HookHandler<never>);
    return () => set!.delete(fn as HookHandler<never>);
  }

  async emit<N extends HookName>(name: N, payload: HookMap[N]): Promise<void> {
    const set = this.#handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      await (fn as HookHandler<N>)(payload);
    }
  }

  count(): number {
    let n = 0;
    for (const set of this.#handlers.values()) n += set.size;
    return n;
  }
}

export const hooks = new Hooks();
