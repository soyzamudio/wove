import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BlockRenderer } from "@wove/blocks";
import { designToCssVars, type SiteTemplate } from "@wove/sdk";
import { API_URL } from "../api";
import { inlineTemplateMedia, templateFontLinks } from "../lib/templates";
import { cx } from "./ui";

/** The width the scaled-down preview pretends to be — a desktop viewport. */
const CANVAS_WIDTH = 1200;

/**
 * Load a template's Google Fonts into the document head so the preview is
 * truthful. Links are shared by href and reference-counted, since several
 * previews (gallery cards + the open modal) usually want the same faces.
 */
const fontRefs = new Map<string, number>();

function useTemplateFonts(design: SiteTemplate["design"]) {
  const hrefs = useMemo(() => templateFontLinks(design), [design.fonts.heading, design.fonts.body]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const href of hrefs) {
      const count = fontRefs.get(href) ?? 0;
      fontRefs.set(href, count + 1);
      if (count === 0) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.wvTemplateFont = href;
        document.head.appendChild(link);
      }
    }
    return () => {
      for (const href of hrefs) {
        const count = (fontRefs.get(href) ?? 1) - 1;
        if (count <= 0) {
          fontRefs.delete(href);
          document.head.querySelector(`link[data-wv-template-font="${CSS.escape(href)}"]`)?.remove();
        } else {
          fontRefs.set(href, count);
        }
      }
    };
  }, [hrefs.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * A scaled-down, non-interactive render of one template page using the
 * template's own design tokens — the same technique as the design settings
 * live preview, shrunk with a CSS transform so a full-width page fits in a
 * card.
 */
export function TemplatePreview({
  template,
  pageIndex = 0,
  scale = 0.28,
  maxBlocks,
  className = "",
}: {
  template: SiteTemplate;
  pageIndex?: number;
  /** 1200px canvas × scale = rendered width. */
  scale?: number;
  /** Render only the first N blocks (gallery thumbnails). */
  maxBlocks?: number;
  className?: string;
}) {
  useTemplateFonts(template.design);

  const page = template.pages[pageIndex] ?? template.pages[0]!;
  const doc = useMemo(() => {
    const blocks = maxBlocks ? page.blocks.blocks.slice(0, maxBlocks) : page.blocks.blocks;
    return inlineTemplateMedia({ version: 1, blocks }, template.media);
  }, [page, maxBlocks, template.media]);

  const cssVars = designToCssVars(template.design) as unknown as CSSProperties;

  // A CSS transform doesn't shrink the box the browser lays out, so measure the
  // full-size render and give the wrapper the scaled height — otherwise the
  // scroll container gets a page-height of empty space below the preview.
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [innerHeight, setInnerHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setInnerHeight(el.scrollHeight));
    observer.observe(el);
    setInnerHeight(el.scrollHeight);
    return () => observer.disconnect();
  }, [doc]);

  return (
    <div
      aria-hidden="true"
      className={cx("overflow-hidden", className)}
      style={{
        width: CANVAS_WIDTH * scale,
        height: innerHeight === null ? undefined : innerHeight * scale,
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: CANVAS_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
          ...cssVars,
          background: "var(--wv-bg)",
          color: "var(--wv-fg)",
          fontFamily: "var(--wv-font)",
        }}
      >
        {template.design.customCss.trim() && (
          /* Template CSS is authored alongside the template and rendered inert (pointer-events: none). */
          <style dangerouslySetInnerHTML={{ __html: template.design.customCss }} />
        )}
        <BlockRenderer doc={doc} ctx={{ mediaBase: API_URL }} />
      </div>
    </div>
  );
}

/** Grey placeholder bars shown while `template.get` is in flight. */
export function PreviewSkeleton() {
  return (
    <div className="flex h-full w-full animate-pulse flex-col gap-3 bg-zinc-50 p-6 dark:bg-zinc-900">
      <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-8 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-3 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-2 flex-1 rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
