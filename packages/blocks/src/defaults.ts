import type { BlockType } from "@agentpress/sdk";
import type { AnyBlock, PropsOf } from "./types";

/** Ordered list of block types for pickers. */
export const BLOCK_TYPES: BlockType[] = [
  "hero",
  "features",
  "markdown",
  "image",
  "gallery",
  "cta",
  "testimonials",
  "logos",
  "faq",
  "stats",
  "columns",
  "html",
];

const PLACEHOLDER = "/media/placeholder.svg";

type DefaultsMap = { [T in BlockType]: PropsOf<T> };

const DEFAULTS: DefaultsMap = {
  hero: {
    eyebrow: "New",
    headline: "Headline that states the value",
    subheadline:
      "One or two sentences explaining what this is, who it is for, and why it beats the alternative.",
    buttons: [
      { label: "Get started", href: "/signup", variant: "primary" },
      { label: "Read the docs", href: "/docs", variant: "secondary" },
    ],
    image: { url: PLACEHOLDER, alt: "Product screenshot" },
    layout: "split",
  },
  features: {
    headline: "Everything you need, nothing you don't",
    intro: "Three reasons teams pick this over the alternative.",
    items: [
      { icon: "zap", title: "Fast by default", body: "Pages render server-side and ship no client JavaScript." },
      { icon: "shield-check", title: "Safe to edit", body: "Every change is validated against a typed schema before it saves." },
      { icon: "layers", title: "Composable", body: "Build a page from blocks, reorder them, and preview instantly." },
    ],
    columns: 3,
  },
  markdown: {
    markdown:
      "## A section heading\n\nWrite the story here. Markdown works: **bold**, _italic_, [links](https://example.com), lists and code.\n\n- A supporting point\n- Another supporting point\n",
    width: "content",
  },
  image: {
    image: { url: PLACEHOLDER, alt: "Describe the image" },
    caption: "A short caption that adds context.",
    width: "wide",
  },
  gallery: {
    images: [
      { url: PLACEHOLDER, alt: "Gallery image one" },
      { url: PLACEHOLDER, alt: "Gallery image two" },
      { url: PLACEHOLDER, alt: "Gallery image three" },
    ],
    columns: 3,
  },
  cta: {
    headline: "Ready to get started?",
    body: "Set it up in a few minutes. No credit card, no migration, no lock-in.",
    buttons: [
      { label: "Start free", href: "/signup", variant: "primary" },
      { label: "Talk to us", href: "/contact", variant: "secondary" },
    ],
    style: "card",
  },
  testimonials: {
    headline: "What people say",
    items: [
      { quote: "We replaced three tools with this in an afternoon and never looked back.", name: "Dana Whitfield", role: "Head of Product, Northwind" },
      { quote: "The editing experience is the first one my whole team actually enjoys using.", name: "Marcus Lee", role: "Editor, Fieldnotes" },
      { quote: "Pages load instantly and I stopped worrying about the build pipeline.", name: "Priya Raman", role: "Engineering Lead, Cadence" },
    ],
  },
  logos: {
    headline: "Trusted by teams building in the open",
    logos: [
      { url: PLACEHOLDER, alt: "Northwind" },
      { url: PLACEHOLDER, alt: "Fieldnotes" },
      { url: PLACEHOLDER, alt: "Cadence" },
      { url: PLACEHOLDER, alt: "Beacon" },
    ],
  },
  faq: {
    headline: "Frequently asked questions",
    items: [
      { question: "How long does setup take?", answer: "Under five minutes. Point it at your content and it renders." },
      { question: "Can I bring my own theme?", answer: "Yes. Every style hook is a CSS variable you can override." },
      { question: "Do I need JavaScript on the page?", answer: "No. Blocks render to static HTML, including the FAQ accordion." },
    ],
  },
  stats: {
    headline: "By the numbers",
    items: [
      { value: "12k+", label: "Pages published" },
      { value: "99.9%", label: "Uptime last year" },
      { value: "40ms", label: "Median response time" },
    ],
  },
  columns: {
    columns: [
      { markdown: "### For writers\n\nA calm editor, no plugin sprawl, and drafts that never get lost." },
      { markdown: "### For developers\n\nTyped content, a real API, and static output you can host anywhere." },
    ],
  },
  html: {
    html: '<div style="padding:2rem;text-align:center;border:1px dashed currentColor;border-radius:12px;opacity:.7">Paste your embed code here</div>',
  },
};

/** Sensible sample props for a freshly inserted block. */
export function blockDefaults<T extends BlockType>(type: T): PropsOf<T> {
  return structuredClone(DEFAULTS[type]);
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Short, URL-safe random id (nanoid-ish, no dependency). */
export function newId(size = 12): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** A new block of `type`, ready to insert into a doc. */
export function newBlock<T extends BlockType>(type: T): Extract<AnyBlock, { type: T }> {
  return { id: newId(), type, props: blockDefaults(type) } as Extract<AnyBlock, { type: T }>;
}
