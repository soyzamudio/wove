import type { BlockOf } from "@wove/sdk";
import type { RenderContext } from "../context";
import { renderMarkdown } from "../markdown";

export function MarkdownBlock({ props }: { props: BlockOf<"markdown">["props"]; ctx: RenderContext }) {
  const width = props.width ?? "content";
  return (
    <div
      className={`wv-in ${width === "content" ? "wv-in--content" : ""} wv-prose`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(props.markdown) }}
    />
  );
}
