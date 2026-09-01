import type { BlockOf } from "@agentpress/sdk";
import { resolveUrl, type RenderContext } from "../context";
import { gridClass } from "../ui";

export function Gallery({ props, ctx }: { props: BlockOf<"gallery">["props"]; ctx: RenderContext }) {
  return (
    <div className="ap-in ap-gallery">
      <div className={gridClass(props.columns)}>
        {props.images.map((img, i) => (
          <img key={i} src={resolveUrl(img.url, ctx)} alt={img.alt ?? ""} loading="lazy" />
        ))}
      </div>
    </div>
  );
}
