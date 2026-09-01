import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { Buttons } from "../ui";

export function Cta({ props, ctx }: { props: BlockOf<"cta">["props"]; ctx: RenderContext }) {
  return (
    <div className={`ap-in ap-cta ap-cta--${props.style ?? "card"}`}>
      <div className="ap-cta__inner">
        <h2 className="ap-h2">{props.headline}</h2>
        {props.body ? <p className="ap-cta__body">{props.body}</p> : null}
        <Buttons buttons={props.buttons} ctx={ctx} center />
      </div>
    </div>
  );
}
