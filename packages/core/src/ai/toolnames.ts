/**
 * Wire-safe tool names.
 *
 * Our tools are dotted (`post.create`); OpenAI and Google only accept
 * `[a-zA-Z0-9_-]{1,64}` in a function name, so the dot becomes an underscore on the way
 * out and is mapped back by lookup on the way in (never by naive replacement — a real
 * underscore in a tool name would otherwise round-trip wrong).
 */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** name -> wire name, and the reverse lookup, for one set of exposed tools. */
export class ToolNameMap {
  #toWire = new Map<string, string>();
  #fromWire = new Map<string, string>();

  constructor(names: readonly string[] = []) {
    for (const n of names) this.add(n);
  }

  add(name: string): string {
    const wire = sanitizeToolName(name);
    this.#toWire.set(name, wire);
    this.#fromWire.set(wire, name);
    return wire;
  }

  toWire(name: string): string {
    return this.#toWire.get(name) ?? sanitizeToolName(name);
  }

  /** Unknown wire names come back unchanged so the caller can reject them by name. */
  fromWire(wire: string): string {
    return this.#fromWire.get(wire) ?? wire;
  }
}
