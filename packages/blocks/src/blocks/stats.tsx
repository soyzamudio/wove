import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { SectionHead, gridClass } from "../ui";

export function Stats({ props }: { props: BlockOf<"stats">["props"]; ctx: RenderContext }) {
  const columns = Math.min(4, Math.max(2, props.items.length)) as 2 | 3 | 4;
  return (
    <div className="wv-in wv-stats">
      <SectionHead headline={props.headline} />
      <div className={gridClass(columns)}>
        {props.items.map((s, i) => (
          <div className="wv-stat" key={i}>
            <div className="wv-stat__value">{s.value}</div>
            <div className="wv-stat__label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
