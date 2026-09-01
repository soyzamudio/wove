import { describe, expect, test } from "bun:test";
import { BlockProps } from "@agentpress/sdk";
import { describeKind, describeSchema, emptyValue, type FieldDesc } from "./schemaIntrospect";

const kinds = (fields: FieldDesc[]) => Object.fromEntries(fields.map((f) => [f.name, f.kind.kind]));
const field = (fields: FieldDesc[], name: string) => fields.find((f) => f.name === name)!;

describe("describeSchema", () => {
  test("hero", () => {
    const fields = describeSchema(BlockProps.hero);
    expect(kinds(fields)).toEqual({
      eyebrow: "string",
      headline: "string",
      subheadline: "string",
      buttons: "array",
      image: "image",
      layout: "enum",
    });

    // optionality comes from ZodOptional *and* ZodDefault
    expect(field(fields, "headline").optional).toBe(false);
    expect(field(fields, "eyebrow").optional).toBe(true);
    expect(field(fields, "buttons").optional).toBe(true);
    expect(field(fields, "layout").optional).toBe(true);

    // long-form prose gets a textarea, short strings do not
    expect(field(fields, "subheadline").kind).toEqual({ kind: "string", multiline: true });
    expect(field(fields, "headline").kind).toEqual({ kind: "string", multiline: false });

    expect(field(fields, "layout").kind).toEqual({ kind: "enum", options: ["split", "centered", "background"] });
    expect(field(fields, "buttons").kind).toEqual({ kind: "array", item: { kind: "button" }, max: 3 } as any);
    expect(field(fields, "buttons").label).toBe("Buttons");
  });

  test("features: number-literal union and array of objects", () => {
    const fields = describeSchema(BlockProps.features);
    expect(kinds(fields)).toEqual({ headline: "string", intro: "string", items: "array", columns: "numberEnum" });
    expect(field(fields, "columns").kind).toEqual({ kind: "numberEnum", options: [2, 3, 4] });

    const items = field(fields, "items").kind as any;
    expect(items.kind).toBe("array");
    expect(items.min).toBe(1);
    expect(items.max).toBe(12);
    expect(items.item.kind).toBe("object");
    expect(kinds(items.item.fields)).toEqual({ icon: "string", title: "string", body: "string" });
    expect(items.item.fields.find((f: FieldDesc) => f.name === "body").kind.multiline).toBe(true);
  });

  test("markdown: a z.string().describe('Markdown') is multiline", () => {
    const fields = describeSchema(BlockProps.markdown);
    expect(field(fields, "markdown").kind).toEqual({ kind: "string", multiline: true });
    expect(field(fields, "width").kind).toEqual({ kind: "enum", options: ["content", "wide"] });
  });

  test("image + gallery: ImageRef is detected, including inside arrays", () => {
    expect(kinds(describeSchema(BlockProps.image))).toEqual({ image: "image", caption: "string", width: "enum" });
    const gallery = describeSchema(BlockProps.gallery);
    expect(field(gallery, "images").kind).toEqual({ kind: "array", item: { kind: "image" }, min: 1 } as any);
  });

  test("faq: markdown answers and nested object rows", () => {
    const items = field(describeSchema(BlockProps.faq), "items").kind as any;
    expect(kinds(items.item.fields)).toEqual({ question: "string", answer: "string" });
    expect(items.item.fields.find((f: FieldDesc) => f.name === "answer").kind.multiline).toBe(true);
  });

  test("every block type describes without unknown fields", () => {
    for (const [type, schema] of Object.entries(BlockProps)) {
      const fields = describeSchema(schema as any);
      expect(fields.length, type).toBeGreaterThan(0);
      for (const f of fields) expect(f.kind.kind, `${type}.${f.name}`).not.toBe("unknown");
    }
  });
});

describe("describeKind", () => {
  test("classifies a ButtonSpec object", () => {
    const buttons = describeKind(BlockProps.cta.shape.buttons) as any;
    expect(buttons).toEqual({ kind: "array", item: { kind: "button" }, min: 1, max: 2 });
  });
});

describe("emptyValue", () => {
  test("produces blank rows for each kind", () => {
    expect(emptyValue({ kind: "string", multiline: false })).toBe("");
    expect(emptyValue({ kind: "enum", options: ["a", "b"] })).toBe("a");
    expect(emptyValue({ kind: "numberEnum", options: [2, 3] })).toBe(2);
    expect(emptyValue({ kind: "image" })).toEqual({ url: "", alt: "" });
    expect(emptyValue({ kind: "button" })).toEqual({ label: "Button", href: "/", variant: "primary" });
  });

  test("fills required fields of an object row only", () => {
    const items = describeKind(BlockProps.features.shape.items) as any;
    expect(emptyValue(items.item)).toEqual({ title: "", body: "" });
  });
});
