import type { Block, BlocksDoc, ButtonSpec, ImageRef } from "@wove/sdk";

function buttonsToMarkdown(buttons: ButtonSpec[]): string {
  if (!buttons.length) return "";
  return buttons.map((b) => `[${b.label}](${b.href})`).join(" · ");
}

function imageToMarkdown(image: ImageRef): string {
  return `![${image.alt ?? ""}](${image.url})`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/** Render a single block as readable Markdown. Pure, no I/O. */
export function blockToMarkdown(block: Block): string {
  switch (block.type) {
    case "hero": {
      const parts = [`# ${block.props.headline}`];
      if (block.props.eyebrow) parts.unshift(block.props.eyebrow);
      if (block.props.subheadline) parts.push(block.props.subheadline);
      const buttons = buttonsToMarkdown(block.props.buttons);
      if (buttons) parts.push(buttons);
      return parts.join("\n\n");
    }
    case "features": {
      const parts: string[] = [];
      if (block.props.headline) parts.push(`## ${block.props.headline}`);
      if (block.props.intro) parts.push(block.props.intro);
      const items = block.props.items.map((item) => `- **${item.title}** — ${item.body}`).join("\n");
      parts.push(items);
      return parts.join("\n\n");
    }
    case "markdown":
      return block.props.markdown.trim();
    case "faq": {
      const parts: string[] = [];
      if (block.props.headline) parts.push(`## ${block.props.headline}`);
      const items = block.props.items.map((item) => `**${item.question}**\n\n${item.answer.trim()}`).join("\n\n");
      parts.push(items);
      return parts.join("\n\n");
    }
    case "stats": {
      const parts: string[] = [];
      if (block.props.headline) parts.push(`## ${block.props.headline}`);
      const items = block.props.items.map((item) => `- ${item.value} ${item.label}`).join("\n");
      parts.push(items);
      return parts.join("\n\n");
    }
    case "testimonials": {
      const parts: string[] = [];
      if (block.props.headline) parts.push(`## ${block.props.headline}`);
      const items = block.props.items
        .map((item) => {
          const attribution = [item.name, item.role].filter(Boolean).join(", ");
          return `> ${item.quote}\n>\n> — ${attribution}`;
        })
        .join("\n\n");
      parts.push(items);
      return parts.join("\n\n");
    }
    case "cta": {
      const parts = [`## ${block.props.headline}`];
      if (block.props.body) parts.push(block.props.body);
      const buttons = buttonsToMarkdown(block.props.buttons);
      if (buttons) parts.push(buttons);
      return parts.join("\n\n");
    }
    case "image": {
      const parts = [imageToMarkdown(block.props.image)];
      if (block.props.caption) parts.push(block.props.caption);
      return parts.join("\n\n");
    }
    case "gallery":
      return block.props.images.map(imageToMarkdown).join("\n\n");
    case "logos": {
      const parts: string[] = [];
      if (block.props.headline) parts.push(`## ${block.props.headline}`);
      parts.push(block.props.logos.map((logo) => logo.alt || logo.url).join(", "));
      return parts.join("\n\n");
    }
    case "columns":
      return block.props.columns.map((col) => col.markdown.trim()).join("\n\n");
    case "html": {
      const text = stripHtml(block.props.html);
      return text;
    }
    default:
      return "";
  }
}

/** Turn a whole blocks document into readable Markdown. Pure, no I/O. */
export function blocksToMarkdown(doc: BlocksDoc): string {
  return doc.blocks
    .map((block) => blockToMarkdown(block))
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}
