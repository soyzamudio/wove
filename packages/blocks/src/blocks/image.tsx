import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { SIZES, imgAttrs } from "../image-attrs";

export function ImageBlock({ props, ctx }: { props: BlockOf<"image">["props"]; ctx: RenderContext }) {
  const width = props.width ?? "wide";
  const cls = width === "content" ? "ap-in ap-in--content" : width === "full" ? "ap-in ap-in--full" : "ap-in";
  return (
    <figure className={`${cls} ap-figure`}>
      <img {...imgAttrs(props.image, ctx, SIZES.image)} alt={props.image.alt ?? ""} loading="lazy" />
      {props.caption ? <figcaption>{props.caption}</figcaption> : null}
    </figure>
  );
}
