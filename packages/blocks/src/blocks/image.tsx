import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { SIZES, imgAttrs } from "../image-attrs";

export function ImageBlock({ props, ctx }: { props: BlockOf<"image">["props"]; ctx: RenderContext }) {
  const width = props.width ?? "wide";
  const cls = width === "content" ? "wv-in wv-in--content" : width === "full" ? "wv-in wv-in--full" : "wv-in";
  return (
    <figure className={`${cls} wv-figure`}>
      <img {...imgAttrs(props.image, ctx, SIZES.image)} alt={props.image.alt ?? ""} loading="lazy" />
      {props.caption ? <figcaption>{props.caption}</figcaption> : null}
    </figure>
  );
}
