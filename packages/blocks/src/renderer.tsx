import type { Block as SdkBlock, BlocksDoc } from "@wove/sdk";
import type { AnyBlock } from "./types";
import type { RenderContext } from "./context";
import { Hero } from "./blocks/hero";
import { Features } from "./blocks/features";
import { MarkdownBlock } from "./blocks/markdown";
import { ImageBlock } from "./blocks/image";
import { Gallery } from "./blocks/gallery";
import { Cta } from "./blocks/cta";
import { Testimonials } from "./blocks/testimonials";
import { Logos } from "./blocks/logos";
import { Faq } from "./blocks/faq";
import { Stats } from "./blocks/stats";
import { Columns } from "./blocks/columns";
import { HtmlBlock } from "./blocks/html";

/** Render a single block's inner content (no <section> wrapper). */
export function BlockView({ block: input, ctx = {} }: { block: SdkBlock | AnyBlock; ctx?: RenderContext }) {
  const block = input as AnyBlock;
  switch (block.type) {
    case "hero":
      return <Hero props={block.props} ctx={ctx} />;
    case "features":
      return <Features props={block.props} ctx={ctx} />;
    case "markdown":
      return <MarkdownBlock props={block.props} ctx={ctx} />;
    case "image":
      return <ImageBlock props={block.props} ctx={ctx} />;
    case "gallery":
      return <Gallery props={block.props} ctx={ctx} />;
    case "cta":
      return <Cta props={block.props} ctx={ctx} />;
    case "testimonials":
      return <Testimonials props={block.props} ctx={ctx} />;
    case "logos":
      return <Logos props={block.props} ctx={ctx} />;
    case "faq":
      return <Faq props={block.props} ctx={ctx} />;
    case "stats":
      return <Stats props={block.props} ctx={ctx} />;
    case "columns":
      return <Columns props={block.props} ctx={ctx} />;
    case "html":
      return <HtmlBlock props={block.props} ctx={ctx} />;
    default:
      return null;
  }
}

/** Render a whole blocks document, each block wrapped in its own <section>. */
export function BlockRenderer({ doc, ctx = {} }: { doc: BlocksDoc; ctx?: RenderContext }) {
  return (
    <div className="wv-blocks">
      {doc.blocks.map((block) => (
        <section key={block.id} className={`wv-block wv-block--${block.type}`} data-block-id={block.id}>
          <BlockView block={block} ctx={ctx} />
        </section>
      ))}
    </div>
  );
}
