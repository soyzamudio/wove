import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { renderMarkdown } from "../markdown";
import { SectionHead } from "../ui";

export function Faq({ props }: { props: BlockOf<"faq">["props"]; ctx: RenderContext }) {
  return (
    <div className="ap-in ap-faq">
      <SectionHead headline={props.headline} />
      <div className="ap-faq__list">
        {props.items.map((item, i) => (
          <details className="ap-faq__item" key={i}>
            <summary>{item.question}</summary>
            <div
              className="ap-faq__answer ap-prose"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(item.answer) }}
            />
          </details>
        ))}
      </div>
    </div>
  );
}
