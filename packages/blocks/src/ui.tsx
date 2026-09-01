import type { ButtonSpec } from "@wove/sdk";
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
    <div className={center ? "wv-actions wv-actions--center" : "wv-actions"}>
      {buttons.map((b, i) => (
        <a key={i} className={`wv-btn wv-btn--${b.variant ?? "primary"}`} href={resolveUrl(b.href, ctx)}>
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
    <div className={center ? "wv-head wv-head--center" : "wv-head"}>
      {headline ? <h2 className="wv-h2">{headline}</h2> : null}
      {intro ? <p className="wv-sub">{intro}</p> : null}
    </div>
  );
}

export const gridClass = (columns?: number) => `wv-grid wv-grid--${columns ?? 3}`;
