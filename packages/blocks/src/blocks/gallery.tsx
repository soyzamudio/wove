import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { SIZES, imgAttrs } from "../image-attrs";
import { gridClass } from "../ui";

export function Gallery({ props, ctx }: { props: BlockOf<"gallery">["props"]; ctx: RenderContext }) {
  return (
    <div className="ap-in ap-gallery">
      <div className={gridClass(props.columns)}>
        {props.images.map((img, i) => (
          <img key={i} {...imgAttrs(img, ctx, SIZES.gallery)} alt={img.alt ?? ""} loading="lazy" />
        ))}
      </div>
    </div>
  );
}
