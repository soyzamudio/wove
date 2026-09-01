/**
 * Turns a block's zod props schema into a flat description the builder's props
 * form can render. Pure and DOM-free so it can be unit tested.
 *
 * We introspect the sdk schemas rather than hand-writing a form per block type:
 * add a prop in `@agentpress/sdk` and the builder grows an editor for it.
 */
import { z } from "zod";

export type FieldKind =
  | { kind: "string"; multiline: boolean }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "enum"; options: string[] }
  /** A union of number literals, e.g. `2 | 3 | 4` for column counts. */
  | { kind: "numberEnum"; options: number[] }
  /** `ImageRef` — url + alt (+ mediaId), edited with the media picker. */
  | { kind: "image" }
  /** `ButtonSpec` — label + href + variant, edited inline. */
  | { kind: "button" }
  | { kind: "object"; fields: FieldDesc[] }
  | { kind: "array"; item: FieldKind; min?: number; max?: number }
  | { kind: "unknown" };

export interface FieldDesc {
  name: string;
  label: string;
  optional: boolean;
  description?: string;
  kind: FieldKind;
}

/** Prop names that hold long-form text and deserve a textarea. */
const MULTILINE = new Set(["markdown", "body", "quote", "answer", "html", "subheadline", "intro", "caption"]);

function typeName(schema: unknown): string {
  return (schema as any)?._def?.typeName ?? "";
}

/** Strip Optional/Default/Nullable/Effects wrappers, reporting what was found. */
export function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean; description?: string } {
  let inner: any = schema;
  let optional = false;
  let description: string | undefined = (schema as any).description;
  for (let i = 0; i < 10; i++) {
    const t = typeName(inner);
    description ??= inner.description;
    if (t === "ZodOptional" || t === "ZodNullable") {
      optional = true;
      inner = inner._def.innerType;
    } else if (t === "ZodDefault") {
      optional = true;
      inner = inner._def.innerType;
    } else if (t === "ZodEffects") {
      inner = inner._def.schema;
    } else if (t === "ZodBranded" || t === "ZodReadonly") {
      inner = inner._def.type ?? inner._def.innerType;
    } else {
      break;
    }
  }
  return { inner: inner as z.ZodTypeAny, optional, description: description ?? undefined };
}

function isShapeOf(shape: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => k in shape);
}

function literalValues(schema: any): unknown[] | null {
  const options: any[] = schema?._def?.options ?? [];
  if (!Array.isArray(options) || options.length === 0) return null;
  const values: unknown[] = [];
  for (const opt of options) {
    if (typeName(opt) !== "ZodLiteral") return null;
    values.push(opt._def.value);
  }
  return values;
}

/** Classify one (already unwrapped) schema into a field kind. */
export function describeKind(schema: z.ZodTypeAny, name = ""): FieldKind {
  const { inner, description } = unwrap(schema);
  const t = typeName(inner);

  switch (t) {
    case "ZodString":
      return { kind: "string", multiline: MULTILINE.has(name) || description === "Markdown" };
    case "ZodNumber":
      return { kind: "number" };
    case "ZodBoolean":
      return { kind: "boolean" };
    case "ZodEnum":
      return { kind: "enum", options: [...((inner as any)._def.values as string[])] };
    case "ZodNativeEnum":
      return { kind: "enum", options: Object.values((inner as any)._def.values).map(String) };
    case "ZodLiteral": {
      const value = (inner as any)._def.value;
      return typeof value === "number" ? { kind: "numberEnum", options: [value] } : { kind: "enum", options: [String(value)] };
    }
    case "ZodUnion": {
      const values = literalValues(inner);
      if (!values) return { kind: "unknown" };
      if (values.every((v) => typeof v === "number")) return { kind: "numberEnum", options: values as number[] };
      return { kind: "enum", options: values.map(String) };
    }
    case "ZodObject": {
      const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
      if (isShapeOf(shape, ["url", "alt"])) return { kind: "image" };
      if (isShapeOf(shape, ["label", "href"])) return { kind: "button" };
      return { kind: "object", fields: describeSchema(inner as z.ZodObject<z.ZodRawShape>) };
    }
    case "ZodArray": {
      const def = (inner as any)._def;
      const item = describeKind(def.type, name);
      const out: FieldKind = { kind: "array", item };
      if (typeof def.minLength?.value === "number") (out as any).min = def.minLength.value;
      if (typeof def.maxLength?.value === "number") (out as any).max = def.maxLength.value;
      return out;
    }
    default:
      return { kind: "unknown" };
  }
}

function labelFor(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Describe every prop of a zod object schema, e.g. `describeSchema(BlockProps.hero)`.
 * Field order follows the schema's declaration order.
 */
export function describeSchema(schema: z.ZodObject<z.ZodRawShape>): FieldDesc[] {
  const shape = schema.shape;
  return Object.entries(shape).map(([name, prop]) => {
    const { optional, description } = unwrap(prop as z.ZodTypeAny);
    return {
      name,
      label: labelFor(name),
      optional,
      description,
      kind: describeKind(prop as z.ZodTypeAny, name),
    };
  });
}

/** A sensible blank value for a field kind — used when adding an array row. */
export function emptyValue(kind: FieldKind): unknown {
  switch (kind.kind) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "enum":
      return kind.options[0] ?? "";
    case "numberEnum":
      return kind.options[0] ?? 0;
    case "image":
      return { url: "", alt: "" };
    case "button":
      return { label: "Button", href: "/", variant: "primary" };
    case "object": {
      const out: Record<string, unknown> = {};
      for (const field of kind.fields) {
        if (!field.optional) out[field.name] = emptyValue(field.kind);
      }
      return out;
    }
    case "array":
      return [];
    default:
      return null;
  }
}
