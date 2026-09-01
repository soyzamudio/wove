import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { renderMarkdown } from "../markdown";
import { gridClass } from "../ui";

export function Columns({ props }: { props: BlockOf<"columns">["props"]; ctx: RenderContext }) {
  const columns = Math.min(4, Math.max(2, props.columns.length)) as 2 | 3 | 4;
  return (
    <div className="ap-in ap-columns">
      <div className={gridClass(columns)}>
        {props.columns.map((col, i) => (
          <div className="ap-prose" key={i} dangerouslySetInnerHTML={{ __html: renderMarkdown(col.markdown) }} />
        ))}
      </div>
    </div>
  );
}
