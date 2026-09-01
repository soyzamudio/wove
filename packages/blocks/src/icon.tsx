import type { ComponentType } from "react";
import * as icons from "lucide-react";

type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number | string; "aria-hidden"?: boolean }>;

const pascal = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

const registry = icons as unknown as Record<string, IconComponent | undefined>;

const FALLBACK = "Circle";

/** lucide exports icons as functions or forwardRef objects; other keys are helpers. */
const isComponent = (v: unknown): v is IconComponent =>
  typeof v === "function" || (typeof v === "object" && v !== null && "$$typeof" in (v as object));

/** Resolve a lucide icon component from a kebab/loose name, with a generic fallback. */
export function resolveIcon(name?: string): IconComponent {
  const key = name ? pascal(name) : "";
  if (key) {
    for (const candidate of [registry[key], registry[`${key}Icon`]]) {
      if (isComponent(candidate)) return candidate;
    }
  }
  return (isComponent(registry[FALLBACK]) ? registry[FALLBACK] : registry[`${FALLBACK}Icon`]) as IconComponent;
}

export function Icon({ name, size = 20 }: { name?: string; size?: number }) {
  const Cmp = resolveIcon(name);
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={1.75} aria-hidden={true} />;
}
