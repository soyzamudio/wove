import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { Icon } from "../icon";
import { SectionHead, gridClass } from "../ui";

export function Features({ props }: { props: BlockOf<"features">["props"]; ctx: RenderContext }) {
  return (
    <div className="wv-in wv-features">
      <SectionHead headline={props.headline} intro={props.intro} />
      <div className={gridClass(props.columns)}>
        {props.items.map((item, i) => (
          <div className="wv-feature" key={i}>
            {item.icon ? (
              <span className="wv-icon">
                <Icon name={item.icon} />
              </span>
            ) : null}
            <h3 className="wv-h3">{item.title}</h3>
            <p className="wv-feature__body">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
