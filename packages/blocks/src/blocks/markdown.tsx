import type { BlockOf } from "@agentpress/sdk";
import type { RenderContext } from "../context";
import { renderMarkdown } from "../markdown";

export function MarkdownBlock({ props }: { props: BlockOf<"markdown">["props"]; ctx: RenderContext }) {
  const width = props.width ?? "content";
  return (
    <div
      className={`ap-in ${width === "content" ? "ap-in--content" : ""} ap-prose`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(props.markdown) }}
    />
  );
}
