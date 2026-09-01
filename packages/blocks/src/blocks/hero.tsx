import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { SIZES, imgAttrs } from "../image-attrs";
import { Buttons } from "../ui";

export function Hero({ props, ctx }: { props: BlockOf<"hero">["props"]; ctx: RenderContext }) {
  const layout = props.layout ?? "split";
  const img = props.image;
  const centered = layout !== "split";
  return (
    <div className={`ap-hero ap-hero--${layout}`}>
      {layout === "background" && img?.url ? (
        <img className="ap-hero__bg" {...imgAttrs(img, ctx, "100vw")} alt={img.alt ?? ""} loading="lazy" />
      ) : null}
      <div className="ap-in ap-hero__inner">
        <div className="ap-hero__text">
          {props.eyebrow ? <p className="ap-eyebrow">{props.eyebrow}</p> : null}
          <h1 className="ap-h1">{props.headline}</h1>
          {props.subheadline ? <p className="ap-lead">{props.subheadline}</p> : null}
          <Buttons buttons={props.buttons} ctx={ctx} center={centered} />
        </div>
        {layout !== "background" && img?.url ? (
          <div className="ap-hero__media">
            <img {...imgAttrs(img, ctx, SIZES.hero)} alt={img.alt ?? ""} loading="lazy" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
