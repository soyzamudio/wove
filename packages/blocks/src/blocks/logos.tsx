import type { BlockOf } from "@agentpress/sdk";
import { resolveUrl, type RenderContext } from "../context";
import { SectionHead } from "../ui";

export function Logos({ props, ctx }: { props: BlockOf<"logos">["props"]; ctx: RenderContext }) {
  return (
    <div className="ap-in ap-logos">
      <SectionHead headline={props.headline} />
      <div className="ap-logos__row">
        {props.logos.map((logo, i) => (
          <img key={i} src={resolveUrl(logo.url, ctx)} alt={logo.alt ?? ""} loading="lazy" />
        ))}
      </div>
    </div>
  );
}
