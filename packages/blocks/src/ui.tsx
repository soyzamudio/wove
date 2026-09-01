import type { ButtonSpec } from "@agentpress/sdk";
import { resolveUrl, type RenderContext } from "./context";

export function Buttons({
  buttons,
  ctx,
  center,
}: {
  buttons?: ButtonSpec[];
  ctx: RenderContext;
  center?: boolean;
}) {
  if (!buttons?.length) return null;
  return (
    <div className={center ? "ap-actions ap-actions--center" : "ap-actions"}>
      {buttons.map((b, i) => (
        <a key={i} className={`ap-btn ap-btn--${b.variant ?? "primary"}`} href={resolveUrl(b.href, ctx)}>
          {b.label}
        </a>
      ))}
    </div>
  );
}

export function SectionHead({
  headline,
  intro,
  center = true,
}: {
  headline?: string;
  intro?: string;
  center?: boolean;
}) {
  if (!headline && !intro) return null;
  return (
    <div className={center ? "ap-head ap-head--center" : "ap-head"}>
      {headline ? <h2 className="ap-h2">{headline}</h2> : null}
      {intro ? <p className="ap-sub">{intro}</p> : null}
    </div>
  );
}

export const gridClass = (columns?: number) => `ap-grid ap-grid--${columns ?? 3}`;
