import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { SectionHead, gridClass } from "../ui";

export function Stats({ props }: { props: BlockOf<"stats">["props"]; ctx: RenderContext }) {
  const columns = Math.min(4, Math.max(2, props.items.length)) as 2 | 3 | 4;
  return (
    <div className="ap-in ap-stats">
      <SectionHead headline={props.headline} />
      <div className={gridClass(columns)}>
        {props.items.map((s, i) => (
          <div className="ap-stat" key={i}>
            <div className="ap-stat__value">{s.value}</div>
            <div className="ap-stat__label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
