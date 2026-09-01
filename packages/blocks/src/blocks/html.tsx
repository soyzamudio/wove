import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";

/** Raw, admin-authored HTML. Trusted by contract — not sanitized. */
export function HtmlBlock({ props }: { props: BlockOf<"html">["props"]; ctx: RenderContext }) {
  return <div className="ap-in ap-html" dangerouslySetInnerHTML={{ __html: props.html }} />;
}
