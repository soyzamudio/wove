/**
 * Pure helpers for the collections admin UI: field-key slugification, the
 * client-side validation the definition editor runs before saving, the column
 * pick for an entry list, and mapping a server zod issue path back to a field.
 *
 * Everything here is deliberately free of React/DOM so it unit-tests directly.
 */
import type { Collection, CollectionEntry, CollectionField, CollectionFieldType } from "@wove/sdk";

/** The nine field types, with the one-word hint shown next to the type select. */
export const FIELD_TYPES: ReadonlyArray<{ value: CollectionFieldType; label: string; hint: string }> = [
  { value: "text", label: "Text", hint: "line" },
  { value: "textarea", label: "Long text", hint: "paragraph" },
  { value: "markdown", label: "Markdown", hint: "rich" },
  { value: "number", label: "Number", hint: "numeric" },
  { value: "boolean", label: "Yes / no", hint: "toggle" },
  { value: "date", label: "Date", hint: "calendar" },
  { value: "select", label: "Select", hint: "choices" },
  { value: "image", label: "Image", hint: "media" },
  { value: "url", label: "URL", hint: "link" },
];

/** Types allowed as a collection's title field — the display name has to be a line of text. */
export const TITLE_FIELD_TYPES: ReadonlyArray<CollectionFieldType> = ["text"];

/** Types that make sense as an extra column in the entry list table. */
const COLUMN_TYPES: ReadonlyArray<CollectionFieldType> = ["text", "select", "date", "number"];

/**
 * Turn a human label into a `CollectionField.key`: lowercase snake_case matching
 * the sdk's `^[a-z][a-z0-9_]*$`. Keys that would start with a digit get a `f_`
 * prefix; an unusable label yields "" so the caller can keep the field invalid.
 */
export function slugifyKey(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return "";
  return /^[a-z]/.test(base) ? base : `f_${base}`;
}

export interface FieldIssue {
  /** Index into the fields array, or -1 for a collection-level problem. */
  index: number;
  /** Which control the issue belongs to. */
  field: "key" | "label" | "type" | "options" | "titleFieldKey";
  message: string;
}

/**
 * Client-side checks the definition editor runs before hitting `collection.create` / `collection.update`.
 * Core re-validates; this just gives an instant, per-row message.
 */
export function validateFields(fields: readonly CollectionField[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (fields.length === 0) {
    issues.push({ index: -1, field: "key", message: "Add at least one field." });
    return issues;
  }

  const seen = new Map<string, number>();
  fields.forEach((field, index) => {
    const key = field.key.trim();
    if (!key) {
      issues.push({ index, field: "key", message: "A field key is required." });
    } else if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      issues.push({ index, field: "key", message: "Keys are lowercase letters, digits and underscores, starting with a letter." });
    } else if (seen.has(key)) {
      issues.push({ index, field: "key", message: `Duplicate key — "${key}" is already used by field ${seen.get(key)! + 1}.` });
    } else {
      seen.set(key, index);
    }

    if (!field.label.trim()) issues.push({ index, field: "label", message: "A label is required." });

    if (field.type === "select" && (field.options ?? []).filter((o) => o.trim()).length === 0) {
      issues.push({ index, field: "options", message: "A select field needs at least one option." });
    }
  });

  return issues;
}

/** The title-field select's choices: text fields only. */
export function titleFieldOptions(fields: readonly CollectionField[]): CollectionField[] {
  return fields.filter((f) => TITLE_FIELD_TYPES.includes(f.type) && f.key.trim() !== "");
}

/**
 * Extra columns for the entry list table: the first two scalar fields that are
 * not the title field. Keeps the table readable regardless of schema size.
 */
export function columnFields(
  collection: Pick<Collection, "fields" | "titleFieldKey">,
  max = 2
): CollectionField[] {
  return collection.fields
    .filter((f) => f.key !== collection.titleFieldKey && COLUMN_TYPES.includes(f.type))
    .slice(0, max);
}

/**
 * Map a zod issue path from a 400 back to the field it belongs to. Core validates
 * entry payloads as `{ collection, data: {...} }`, so paths arrive as
 * `["data", "title"]` — but a bare `["title"]` is accepted too. Returns null when
 * the issue is not about a single field (e.g. `["status"]` handled separately, or
 * an empty root path).
 */
export function issuePathToField(path: ReadonlyArray<string | number> | undefined | null): string | null {
  if (!path || path.length === 0) return null;
  const parts = path[0] === "data" ? path.slice(1) : path.slice();
  const head = parts[0];
  if (typeof head !== "string" || head === "") return null;
  return head;
}

/**
 * Pull per-field messages out of a WoveError's `details`. Handles both shapes
 * core can produce: a zod `flatten()` (`{ fieldErrors }`) and a raw issue list
 * (`{ issues: [{ path, message }] }`).
 */
export function fieldErrorsFromDetails(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!details || typeof details !== "object") return out;

  const d = details as { fieldErrors?: Record<string, string[]>; issues?: Array<{ path?: unknown; message?: unknown }> };

  for (const issue of d.issues ?? []) {
    const key = issuePathToField(Array.isArray(issue.path) ? (issue.path as string[]) : null);
    if (key && typeof issue.message === "string" && !out[key]) out[key] = issue.message;
  }

  for (const [key, messages] of Object.entries(d.fieldErrors ?? {})) {
    // A flattened top-level `data` error carries no field path — skip it.
    if (key === "data" || key === "") continue;
    const message = Array.isArray(messages) ? messages[0] : undefined;
    if (typeof message === "string" && !out[key]) out[key] = message;
  }

  return out;
}

/** The blank value a freshly created entry starts each field at. */
export function emptyFieldValue(type: CollectionFieldType): unknown {
  switch (type) {
    case "boolean":
      return false;
    case "number":
      return null;
    case "image":
      return null;
    default:
      return "";
  }
}

/** Every field blank — the starting `data` for a new entry. */
export function emptyEntryData(fields: readonly CollectionField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field.key] = emptyFieldValue(field.type);
  return out;
}

/**
 * Normalise the form state into the `data` payload for entry.create/update:
 * blank strings and undefined become null (which clears the key on update).
 */
export function entryDataForSave(
  fields: readonly CollectionField[],
  data: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = data[field.key];
    if (field.type === "boolean") out[field.key] = Boolean(value);
    else if (value === undefined || value === "" || value === null) out[field.key] = null;
    else out[field.key] = value;
  }
  return out;
}

/** The entry's display title, falling back to something never blank. */
export function entryTitle(
  collection: Pick<Collection, "titleFieldKey">,
  entry: Pick<CollectionEntry, "data" | "id">
): string {
  const raw = entry.data?.[collection.titleFieldKey];
  const title = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
  return title || "(untitled)";
}

/** Render one field value for the list table. */
export function displayValue(field: CollectionField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "date") {
    // Date fields are plain `YYYY-MM-DD`; parse the parts so a UTC-midnight
    // Date doesn't shift the day backwards in western timezones.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!m) return String(value);
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { dateStyle: "medium" });
  }
  return String(value);
}
