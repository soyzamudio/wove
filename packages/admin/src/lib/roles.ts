import type { Scope, UserRole } from "@wove/sdk";

/** Human labels for the four user roles. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  editor: "Editor",
  author: "Author",
  contributor: "Contributor",
};

/** One-liners shown next to the role select in the invite modal. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "everything",
  editor: "all content",
  author: "own posts, can publish",
  contributor: "own drafts, submits for review",
};

/**
 * What each role can do, mirroring core's role→scope table. The backend is the
 * authority; this copy only drives UX (nav visibility, button labels) and the
 * pure tests below.
 */
export const ROLE_SCOPES: Record<UserRole, Scope[]> = {
  admin: ["*"],
  editor: [
    "content:read", "content:write", "content:publish",
    "media:read", "media:write",
    "settings:read", "settings:write",
    "audit:read", "ai:use",
  ],
  author: ["content:read", "content:write", "content:publish", "media:read", "media:write", "ai:use"],
  contributor: ["content:read", "content:write", "media:read", "media:write", "ai:use"],
};

/** True when `actorScopes` covers every scope in `required` ("*" covers all). */
export function hasScopes(actorScopes: readonly Scope[] | null | undefined, required: readonly Scope[] | undefined): boolean {
  if (!required || required.length === 0) return true;
  if (!actorScopes) return false;
  if (actorScopes.includes("*")) return true;
  return required.every((s) => actorScopes.includes(s));
}

/** Status options offered by the editors' status select for a given role. */
export function editorStatusOptions(
  role: UserRole | null | undefined,
  current: string
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [{ value: "draft", label: "Draft" }];
  if (current === "pending") options.push({ value: "pending", label: "Pending review" });
  if (role !== "contributor") {
    options.push({ value: "published", label: "Published" });
    options.push({ value: "scheduled", label: "Scheduled" });
  }
  return options;
}

/** Can this role approve/reject something waiting for review? */
export function canReview(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "editor";
}
