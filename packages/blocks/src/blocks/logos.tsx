import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { imgAttrs } from "../image-attrs";
import { SectionHead } from "../ui";

export function Logos({ props, ctx }: { props: BlockOf<"logos">["props"]; ctx: RenderContext }) {
  return (
    <div className="ap-in ap-logos">
      <SectionHead headline={props.headline} />
      <div className="ap-logos__row">
        {/* Logos render small: intrinsic sizing only, no srcset. */}
        {props.logos.map((logo, i) => (
          <img key={i} {...imgAttrs(logo, ctx)} alt={logo.alt ?? ""} loading="lazy" />
        ))}
      </div>
    </div>
  );
}
