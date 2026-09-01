import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { renderMarkdown } from "../markdown";
import { gridClass } from "../ui";

export function Columns({ props }: { props: BlockOf<"columns">["props"]; ctx: RenderContext }) {
  const columns = Math.min(4, Math.max(2, props.columns.length)) as 2 | 3 | 4;
  return (
    <div className="wv-in wv-columns">
      <div className={gridClass(columns)}>
        {props.columns.map((col, i) => (
          <div className="wv-prose" key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(col.markdown) }} />
        ))}
      </div>
    </div>
  );
}
