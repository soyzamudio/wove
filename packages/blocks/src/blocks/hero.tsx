import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { SIZES, imgAttrs } from "../image-attrs";
import { Buttons } from "../ui";

export function Hero({ props, ctx }: { props: BlockOf<"hero">["props"]; ctx: RenderContext }) {
  const layout = props.layout ?? "split";
  const img = props.image;
  const centered = layout !== "split";
  return (
    <div className={`wv-hero wv-hero--${layout}`}>
      {layout === "background" && img?.url ? (
        <img className="wv-hero__bg" {...imgAttrs(img, ctx, "100vw")} alt={img.alt ?? ""} loading="lazy" />
      ) : null}
      <div className="wv-in wv-hero__inner">
        <div className="wv-hero__text">
          {props.eyebrow ? <p className="wv-eyebrow">{props.eyebrow}</p> : null}
          <h1 className="wv-h1">{props.headline}</h1>
          {props.subheadline ? <p className="wv-lead">{props.subheadline}</p> : null}
          <Buttons buttons={props.buttons} ctx={ctx} center={centered} />
        </div>
        {layout !== "background" && img?.url ? (
          <div className="wv-hero__media">
            <img {...imgAttrs(img, ctx, SIZES.hero)} alt={img.alt ?? ""} loading="lazy" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
