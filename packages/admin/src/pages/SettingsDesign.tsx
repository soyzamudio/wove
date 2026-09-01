import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BlockView, sampleDoc } from "@wove/blocks";
import { FontChoice, FontMeta, designToCssVars, type Design, type ImageRef } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { ImageRefField } from "../components/editor";
import { Button, Card, ErrorBanner, Input, Label, Select, Spinner, Textarea, errorMessage } from "../components/ui";

const PREVIEW_ID = "wv-design-preview";

const DEFAULT_DESIGN: Design = {
  logo: null,
  colors: {
    accent: "#2563eb",
    background: "#ffffff",
    foreground: "#18181b",
    darkBackground: "#0a0a0a",
    darkForeground: "#f4f4f5",
  },
  fonts: { heading: "system", body: "system" },
  radius: 12,
  customCss: "",
};

const COLOR_FIELDS: Array<{ key: keyof Design["colors"]; label: string }> = [
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "foreground", label: "Text" },
  { key: "darkBackground", label: "Background (dark)" },
  { key: "darkForeground", label: "Text (dark)" },
];

const FONT_OPTIONS = FontChoice.options;

/** "source-serif" → "Source Serif". */
function fontLabel(key: string): string {
  if (key === "system") return "System";
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Load Google Fonts for the selected non-system faces so the preview is truthful. */
function useGoogleFonts(fonts: Design["fonts"]) {
  const families = useMemo(() => {
    const set = new Set<string>();
    for (const choice of [fonts.heading, fonts.body]) {
      const google = FontMeta[choice]?.google;
      if (google) set.add(google);
    }
    return [...set];
  }, [fonts.heading, fonts.body]);

  useEffect(() => {
    if (families.length === 0) return;
    const links = families.map((family) => {
      const href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
      let link = document.head.querySelector<HTMLLinkElement>(`link[data-wv-font="${family}"]`);
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.apFont = family;
        document.head.appendChild(link);
      }
      return link;
    });
    return () => {
      // Leave them in place while the page lives; only clean up on unmount.
      for (const link of links) link.remove();
    };
  }, [families.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Only send what the user actually changed to `design.update`. */
export function designDiff(saved: Design, draft: Design): Partial<Design> {
  const out: Record<string, unknown> = {};
  if (JSON.stringify(saved.logo) !== JSON.stringify(draft.logo)) out.logo = draft.logo;
  if (JSON.stringify(saved.colors) !== JSON.stringify(draft.colors)) out.colors = draft.colors;
  if (JSON.stringify(saved.fonts) !== JSON.stringify(draft.fonts)) out.fonts = draft.fonts;
  if (saved.radius !== draft.radius) out.radius = draft.radius;
  if (saved.customCss !== draft.customCss) out.customCss = draft.customCss;
  return out as Partial<Design>;
}

export function SettingsDesign() {
  const design = useToolQuery("design.get", {});
  const invalidate = useInvalidateTool();
  const toast = useToast();

  const [draft, setDraft] = useState<Design>(DEFAULT_DESIGN);
  const saved = design.data ?? null;

  useEffect(() => {
    if (design.data) setDraft(design.data);
  }, [design.data]);

  useGoogleFonts(draft.fonts);

  const update = useToolMutation("design.update", {
    onSuccess: () => {
      toast.success("Design saved");
      invalidate("design.get");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const changed = saved ? Object.keys(designDiff(saved, draft)).length > 0 : false;
  const previewBlocks = useMemo(() => sampleDoc().blocks.slice(0, 3), []);
  const cssVars = designToCssVars(draft) as unknown as CSSProperties;

  function setColor(key: keyof Design["colors"], value: string) {
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-4">
        {design.isLoading && <Spinner />}
        {design.isError && <ErrorBanner message={errorMessage(design.error)} />}

        {design.data && (
          <>
            <Card className="space-y-4">
              <ImageRefField
                label="Logo"
                value={draft.logo as ImageRef | null}
                onChange={(logo) => setDraft((d) => ({ ...d, logo }))}
                hint="Shown in your site header."
              />
            </Card>

            <Card className="space-y-3">
              <div className="text-base font-semibold tracking-tight">Colors</div>
              {COLOR_FIELDS.map((field) => {
                const value = draft.colors[field.key];
                return (
                  <div key={field.key} className="flex items-center gap-2">
                    <label htmlFor={`color-${field.key}`} className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                      {field.label}
                    </label>
                    <input
                      id={`color-${field.key}`}
                      type="color"
                      value={isHex(value) ? value : "#000000"}
                      onChange={(e) => setColor(field.key, e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-zinc-300 bg-transparent p-0.5 dark:border-zinc-700"
                    />
                    <Input
                      aria-label={`${field.label} hex`}
                      value={value}
                      onChange={(e) => setColor(field.key, e.target.value)}
                      className="w-28 font-mono text-xs"
                    />
                  </div>
                );
              })}
            </Card>

            <Card className="space-y-3">
              <div className="text-base font-semibold tracking-tight">Typography</div>
              <div>
                <Label htmlFor="font-heading">Heading font</Label>
                <Select
                  id="font-heading"
                  value={draft.fonts.heading}
                  onChange={(e) => setDraft((d) => ({ ...d, fonts: { ...d.fonts, heading: e.target.value as Design["fonts"]["heading"] } }))}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {fontLabel(f)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="font-body">Body font</Label>
                <Select
                  id="font-body"
                  value={draft.fonts.body}
                  onChange={(e) => setDraft((d) => ({ ...d, fonts: { ...d.fonts, body: e.target.value as Design["fonts"]["body"] } }))}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {fontLabel(f)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="radius">Corner radius</Label>
                  <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">{draft.radius}px</span>
                </div>
                <input
                  id="radius"
                  type="range"
                  min={0}
                  max={32}
                  step={1}
                  value={draft.radius}
                  onChange={(e) => setDraft((d) => ({ ...d, radius: Number(e.target.value) }))}
                  className="w-full accent-blue-600"
                />
              </div>
            </Card>

            <Card className="space-y-2">
              <Label htmlFor="custom-css">Custom CSS</Label>
              <Textarea
                id="custom-css"
                rows={8}
                spellCheck={false}
                value={draft.customCss}
                placeholder={".site-header { letter-spacing: -0.01em; }"}
                onChange={(e) => setDraft((d) => ({ ...d, customCss: e.target.value }))}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Injected on every page of your site. The preview applies it too.
              </p>
            </Card>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                disabled={update.isPending || !changed}
                onClick={() => saved && update.mutate(designDiff(saved, draft))}
              >
                {update.isPending ? "Saving…" : "Save design"}
              </Button>
              <Button variant="secondary" disabled={!changed} onClick={() => saved && setDraft(saved)}>
                Reset
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Live preview</div>
        <div className="wv-scroll max-h-[calc(100vh-11rem)] overflow-y-auto rounded-xl bg-zinc-100 p-4 dark:bg-zinc-950/60">
          <div
            id={PREVIEW_ID}
            style={{ ...cssVars, background: "var(--wv-bg)", color: "var(--wv-fg)", fontFamily: "var(--wv-font)" }}
            className="mx-auto overflow-hidden shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800"
          >
            {/* Custom CSS is admin-authored and trusted; injected as-is so the preview matches the site. */}
            {draft.customCss.trim() && <style dangerouslySetInnerHTML={{ __html: draft.customCss }} />}
            {draft.logo && (
              <div className="border-b border-black/5 px-6 py-4">
                <img src={draft.logo.url} alt={draft.logo.alt || "Logo"} className="h-8 w-auto" />
              </div>
            )}
            {previewBlocks.map((block) => (
              <BlockView key={block.id} block={block} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
