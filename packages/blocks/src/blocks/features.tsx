import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { Icon } from "../icon";
import { SectionHead, gridClass } from "../ui";

export function Features({ props }: { props: BlockOf<"features">["props"]; ctx: RenderContext }) {
  return (
    <div className="ap-in ap-features">
      <SectionHead headline={props.headline} intro={props.intro} />
      <div className={gridClass(props.columns)}>
        {props.items.map((item, i) => (
          <div className="ap-feature" key={i}>
            {item.icon ? (
              <span className="ap-icon">
                <Icon name={item.icon} />
              </span>
            ) : null}
            <h3 className="ap-h3">{item.title}</h3>
            <p className="ap-feature__body">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
