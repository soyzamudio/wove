import { describe, expect, test } from "bun:test";
import { ROLE_DESCRIPTIONS, ROLE_SCOPES, canReview, editorStatusOptions, hasScopes } from "./roles";
import { visibleNavLabels } from "../components/nav";
import { validatePassword } from "./password";

describe("hasScopes", () => {
  test("no requirement is always allowed", () => {
    expect(hasScopes([], undefined)).toBe(true);
    expect(hasScopes(null, [])).toBe(true);
  });
  test("wildcard covers everything", () => {
    expect(hasScopes(["*"], ["users:manage", "audit:read"])).toBe(true);
  });
  test("requires every scope", () => {
    expect(hasScopes(["content:read"], ["content:read"])).toBe(true);
    expect(hasScopes(["content:read"], ["content:read", "content:write"])).toBe(false);
    expect(hasScopes(null, ["content:read"])).toBe(false);
  });
});

describe("visibleNavLabels", () => {
  test("admins see everything", () => {
    const labels = visibleNavLabels("admin");
    for (const l of ["Dashboard", "Posts", "Pages", "Media", "Menus", "Templates", "Agents", "Tools", "Audit log", "Settings", "Users", "Redirects", "Import / Export"]) {
      expect(labels).toContain(l);
    }
  });

  test("editors see everything but Agents and Users", () => {
    const labels = visibleNavLabels("editor");
    expect(labels).toContain("Settings");
    expect(labels).toContain("Audit log");
    expect(labels).toContain("Templates");
    expect(labels).not.toContain("Agents");
    expect(labels).not.toContain("Users");
  });

  for (const role of ["author", "contributor"] as const) {
    test(`${role}s only see content nav`, () => {
      const labels = visibleNavLabels(role);
      expect(labels).toEqual(["Dashboard", "Visit site", "Posts", "Pages", "Media", "Tools"]);
      for (const hidden of ["Agents", "Audit log", "Settings", "Users", "Templates", "Import / Export", "Menus", "Redirects"]) {
        expect(labels).not.toContain(hidden);
      }
    });
  }
});

describe("role descriptions", () => {
  test("every role has a one-liner", () => {
    expect(Object.keys(ROLE_DESCRIPTIONS).sort()).toEqual(["admin", "author", "contributor", "editor"]);
    for (const text of Object.values(ROLE_DESCRIPTIONS)) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain("\n");
    }
  });
  test("descriptions match the roles they describe", () => {
    expect(ROLE_DESCRIPTIONS.admin).toBe("everything");
    expect(ROLE_DESCRIPTIONS.editor).toBe("all content");
    expect(ROLE_DESCRIPTIONS.author).toBe("own posts, can publish");
    expect(ROLE_DESCRIPTIONS.contributor).toBe("own drafts, submits for review");
  });
  test("only admins hold the wildcard scope", () => {
    expect(ROLE_SCOPES.admin).toEqual(["*"]);
    for (const role of ["editor", "author", "contributor"] as const) {
      expect(ROLE_SCOPES[role]).not.toContain("*");
    }
    expect(ROLE_SCOPES.author).toContain("content:publish");
    expect(ROLE_SCOPES.contributor).not.toContain("content:publish");
  });
});

describe("editorStatusOptions", () => {
  test("contributors cannot pick published or scheduled", () => {
    expect(editorStatusOptions("contributor", "draft").map((o) => o.value)).toEqual(["draft"]);
  });
  test("a pending post keeps pending selectable", () => {
    expect(editorStatusOptions("contributor", "pending").map((o) => o.value)).toEqual(["draft", "pending"]);
    expect(editorStatusOptions("editor", "pending").map((o) => o.value)).toEqual(["draft", "pending", "published", "scheduled"]);
  });
  test("authors keep the full set", () => {
    expect(editorStatusOptions("author", "draft").map((o) => o.value)).toEqual(["draft", "published", "scheduled"]);
  });
});

describe("canReview", () => {
  test("only admins and editors review", () => {
    expect(canReview("admin")).toBe(true);
    expect(canReview("editor")).toBe(true);
    expect(canReview("author")).toBe(false);
    expect(canReview("contributor")).toBe(false);
    expect(canReview(null)).toBe(false);
  });
});

describe("validatePassword", () => {
  test("rejects short passwords", () => {
    expect(validatePassword("short", "short")).toBe("Password must be at least 8 characters.");
    expect(validatePassword("", "")).toBe("Password must be at least 8 characters.");
  });
  test("rejects mismatches", () => {
    expect(validatePassword("longenough1", "longenough2")).toBe("Passwords do not match.");
  });
  test("accepts a matching 8+ char pair", () => {
    expect(validatePassword("hunter22", "hunter22")).toBeNull();
  });
});
