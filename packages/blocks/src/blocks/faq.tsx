import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { renderMarkdown } from "../markdown";
import { SectionHead } from "../ui";

export function Faq({ props }: { props: BlockOf<"faq">["props"]; ctx: RenderContext }) {
  return (
    <div className="wv-in wv-faq">
      <SectionHead headline={props.headline} />
      <div className="wv-faq__list">
        {props.items.map((item, i) => (
          <details className="wv-faq__item" key={i}>
            <summary>{item.question}</summary>
            <div
              className="wv-faq__answer wv-prose"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(item.answer) }}
            />
          </details>
        ))}
      </div>
    </div>
  );
}
