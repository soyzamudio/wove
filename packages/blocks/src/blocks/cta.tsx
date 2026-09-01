import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { Buttons } from "../ui";

export function Cta({ props, ctx }: { props: BlockOf<"cta">["props"]; ctx: RenderContext }) {
  return (
    <div className={`wv-in wv-cta wv-cta--${props.style ?? "card"}`}>
      <div className="wv-cta__inner">
        <h2 className="wv-h2">{props.headline}</h2>
        {props.body ? <p className="wv-cta__body">{props.body}</p> : null}
        <Buttons buttons={props.buttons} ctx={ctx} center />
      </div>
    </div>
  );
}
