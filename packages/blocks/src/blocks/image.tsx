import type { BlockOf } from "@agentpress/sdk";
import { resolveUrl, type RenderContext } from "../context";

export function ImageBlock({ props, ctx }: { props: BlockOf<"image">["props"]; ctx: RenderContext }) {
  const width = props.width ?? "wide";
  const cls = width === "content" ? "ap-in ap-in--content" : width === "full" ? "ap-in ap-in--full" : "ap-in";
  return (
    <figure className={`${cls} ap-figure`}>
      <img src={resolveUrl(props.image.url, ctx)} alt={props.image.alt ?? ""} loading="lazy" />
      {props.caption ? <figcaption>{props.caption}</figcaption> : null}
    </figure>
  );
}
