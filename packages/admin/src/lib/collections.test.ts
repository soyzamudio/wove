import { describe, expect, test } from "bun:test";
import type { CollectionField } from "@wove/sdk";
import {
  columnFields,
  displayValue,
  emptyEntryData,
  entryDataForSave,
  entryTitle,
  fieldErrorsFromDetails,
  issuePathToField,
  slugifyKey,
  titleFieldOptions,
  validateFields,
} from "./collections";

const field = (patch: Partial<CollectionField> & Pick<CollectionField, "key" | "type">): CollectionField => ({
  label: patch.key,
  required: false,
  ...patch,
});

describe("slugifyKey", () => {
  test("snake_cases a label", () => {
    expect(slugifyKey("Job Title")).toBe("job_title");
  });

  test("strips accents and punctuation", () => {
    expect(slugifyKey("Café — Rôle!")).toBe("cafe_role");
  });

  test("prefixes keys that would start with a digit", () => {
    expect(slugifyKey("2024 budget")).toBe("f_2024_budget");
  });

  test("returns empty for an unusable label", () => {
    expect(slugifyKey("!!!")).toBe("");
    expect(slugifyKey("   ")).toBe("");
  });
});

describe("validateFields", () => {
  test("accepts a healthy field list", () => {
    expect(validateFields([field({ key: "name", type: "text" }), field({ key: "bio", type: "markdown" })])).toEqual([]);
  });

  test("flags duplicate keys on the later field", () => {
    const issues = validateFields([field({ key: "name", type: "text" }), field({ key: "name", type: "text" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ index: 1, field: "key" });
    expect(issues[0]!.message).toContain("Duplicate key");
  });

  test("flags a select with no options", () => {
    const issues = validateFields([field({ key: "status", type: "select", options: [] })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ index: 0, field: "options" });
  });

  test("accepts a select once it has an option", () => {
    expect(validateFields([field({ key: "status", type: "select", options: ["open"] })])).toEqual([]);
  });

  test("flags malformed and missing keys, and blank labels", () => {
    const issues = validateFields([field({ key: "Bad Key", type: "text", label: "" })]);
    expect(issues.map((i) => i.field).sort()).toEqual(["key", "label"]);
  });

  test("requires at least one field", () => {
    expect(validateFields([])).toEqual([{ index: -1, field: "key", message: "Add at least one field." }]);
  });
});

describe("titleFieldOptions", () => {
  test("offers text fields only", () => {
    const fields = [field({ key: "name", type: "text" }), field({ key: "bio", type: "markdown" }), field({ key: "role", type: "text" })];
    expect(titleFieldOptions(fields).map((f) => f.key)).toEqual(["name", "role"]);
  });
});

describe("columnFields", () => {
  const fields = [
    field({ key: "name", type: "text" }),
    field({ key: "bio", type: "markdown" }),
    field({ key: "role", type: "select", options: ["a"] }),
    field({ key: "photo", type: "image" }),
    field({ key: "starts", type: "date" }),
  ];

  test("picks the first two scalar non-title fields", () => {
    expect(columnFields({ fields, titleFieldKey: "name" }).map((f) => f.key)).toEqual(["role", "starts"]);
  });

  test("skips the title field and non-scalar types", () => {
    const keys = columnFields({ fields, titleFieldKey: "role" }).map((f) => f.key);
    expect(keys).toEqual(["name", "starts"]);
  });

  test("honours the max", () => {
    expect(columnFields({ fields, titleFieldKey: "name" }, 1)).toHaveLength(1);
  });
});

describe("issuePathToField", () => {
  test("strips the leading data segment", () => {
    expect(issuePathToField(["data", "title"])).toBe("title");
  });

  test("accepts a bare field path", () => {
    expect(issuePathToField(["title"])).toBe("title");
  });

  test("returns the field for a nested path", () => {
    expect(issuePathToField(["data", "photo", "url"])).toBe("photo");
  });

  test("returns null for empty or numeric roots", () => {
    expect(issuePathToField([])).toBeNull();
    expect(issuePathToField(null)).toBeNull();
    expect(issuePathToField(["data"])).toBeNull();
    expect(issuePathToField([0])).toBeNull();
  });
});

describe("fieldErrorsFromDetails", () => {
  test("reads a raw zod issue list", () => {
    const errors = fieldErrorsFromDetails({ issues: [{ path: ["data", "name"], message: "Required" }] });
    expect(errors).toEqual({ name: "Required" });
  });

  test("reads a flattened fieldErrors map, ignoring the data root", () => {
    const errors = fieldErrorsFromDetails({ fieldErrors: { name: ["Required"], data: ["Invalid"] } });
    expect(errors).toEqual({ name: "Required" });
  });

  test("tolerates junk", () => {
    expect(fieldErrorsFromDetails(undefined)).toEqual({});
    expect(fieldErrorsFromDetails("nope")).toEqual({});
  });
});

describe("entry data helpers", () => {
  const fields = [
    field({ key: "name", type: "text" }),
    field({ key: "count", type: "number" }),
    field({ key: "active", type: "boolean" }),
    field({ key: "photo", type: "image" }),
  ];

  test("emptyEntryData blanks every field by type", () => {
    expect(emptyEntryData(fields)).toEqual({ name: "", count: null, active: false, photo: null });
  });

  test("entryDataForSave nulls blanks and always sends every key", () => {
    expect(entryDataForSave(fields, { name: "  Ada  ", count: 3 })).toEqual({
      name: "  Ada  ",
      count: 3,
      active: false,
      photo: null,
    });
  });

  test("entryTitle falls back when the title field is blank", () => {
    expect(entryTitle({ titleFieldKey: "name" }, { id: "1", data: { name: "Ada" } })).toBe("Ada");
    expect(entryTitle({ titleFieldKey: "name" }, { id: "1", data: { name: "  " } })).toBe("(untitled)");
    expect(entryTitle({ titleFieldKey: "name" }, { id: "1", data: {} })).toBe("(untitled)");
  });

  test("displayValue renders per type", () => {
    expect(displayValue(field({ key: "active", type: "boolean" }), true)).toBe("Yes");
    expect(displayValue(field({ key: "name", type: "text" }), "")).toBe("—");
    expect(displayValue(field({ key: "count", type: "number" }), 0)).toBe("0");
    // Formatted in local time — a UTC-midnight parse would slip to the 28th.
    expect(displayValue(field({ key: "started", type: "date" }), "2021-03-01")).toContain("2021");
    expect(displayValue(field({ key: "started", type: "date" }), "2021-03-01")).toContain("Mar");
    expect(displayValue(field({ key: "started", type: "date" }), "nope")).toBe("nope");
  });
});
