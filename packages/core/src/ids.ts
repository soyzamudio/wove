const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** nanoid-style short random id built on crypto.getRandomValues. */
export function newId(size = 16): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** Opaque-ish API key: `wove_` + 40 random chars. */
export function newApiKey(): string {
  return `wove_${newId(40)}`;
}

export function sha256(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || `item-${newId(6).toLowerCase().replace(/[^a-z0-9]/g, "")}` || "item";
}
