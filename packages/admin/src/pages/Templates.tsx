import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { SiteTemplate, TemplateApplyReport, TemplateSummary } from "@wove/sdk";
import { AlertTriangle, Check, Download, ExternalLink, LayoutTemplate, UploadCloud } from "lucide-react";
import { client, useInvalidateTool, useToolMutation, useToolQuery, WoveError } from "../api";
import { useToast } from "../context/ToastContext";
import { summarizeReport, templateFileName, validateTemplateFile, type ReportLine } from "../lib/templates";
import { PreviewSkeleton, TemplatePreview } from "../components/TemplatePreview";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Modal,
  PageHeader,
  Spinner,
  Tabs,
  cx,
  errorMessage,
} from "../components/ui";

type ApplyMode = "merge" | "replace";

/** What the detail modal is working on: an installed template, or an uploaded file. */
type Selection = { kind: "installed"; slug: string; name: string } | { kind: "file"; template: SiteTemplate };

/** Full templates are fetched lazily and never change — cache them for the session. */
const TEMPLATE_QUERY_OPTIONS = { staleTime: Infinity, gcTime: Infinity } as const;

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

/** Fires once the element has been near the viewport, or on hover intent. */
function useVisible<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return { ref, visible, show: useCallback(() => setVisible(true), []) };
}

function TemplateCard({ summary, onOpen }: { summary: TemplateSummary; onOpen: () => void }) {
  const { ref, visible, show } = useVisible<HTMLButtonElement>();
  const full = useToolQuery("template.get", { slug: summary.slug }, { enabled: visible, ...TEMPLATE_QUERY_OPTIONS });

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      onMouseEnter={show}
      onFocus={show}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        {full.data ? (
          <TemplatePreview template={full.data} scale={0.28} maxBlocks={4} className="absolute left-0 top-0 max-h-full" />
        ) : full.isError ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Preview unavailable
          </div>
        ) : (
          <PreviewSkeleton />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{summary.name}</span>
          <Badge tone="neutral">{summary.pages} page{summary.pages === 1 ? "" : "s"}</Badge>
        </div>
        {summary.description && (
          <p className="line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{summary.description}</p>
        )}
        <div className="mt-auto pt-2 text-xs text-zinc-400 dark:text-zinc-500">
          {summary.author || "Unknown author"} · v{summary.templateVersion}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Detail modal — preview + apply flow
// ---------------------------------------------------------------------------

function ReportList({ lines }: { lines: ReportLine[] }) {
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li
          key={line.key}
          className={cx(
            "flex items-start gap-2 text-sm",
            line.tone === "amber" ? "text-amber-700 dark:text-amber-400" : "text-zinc-700 dark:text-zinc-300"
          )}
        >
          {line.tone === "amber" ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          )}
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

function TemplateDetail({
  selection,
  onClose,
  onApplied,
}: {
  selection: Selection;
  onClose: () => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const site = useToolQuery("site.info", {});

  const installed = useToolQuery(
    "template.get",
    { slug: selection.kind === "installed" ? selection.slug : "" },
    { enabled: selection.kind === "installed", ...TEMPLATE_QUERY_OPTIONS }
  );
  const template = selection.kind === "file" ? selection.template : installed.data ?? null;

  const [mode, setMode] = useState<ApplyMode>("merge");
  const [includeSamples, setIncludeSamples] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState<TemplateApplyReport | null>(null);
  const [applied, setApplied] = useState<TemplateApplyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Options change the report, so drop a stale preview when they do.
  useEffect(() => {
    setPreview(null);
  }, [mode, includeSamples]);

  /** `slug` for installed templates, the inline document for uploaded ones. */
  const target = useMemo(
    () => (selection.kind === "installed" ? { slug: selection.slug } : { template: selection.template }),
    [selection]
  );

  const previewMutation = useToolMutation("template.preview", {
    onSuccess: (report) => {
      setPreview(report);
      setError(null);
    },
    onError: (err) => {
      setError(errorMessage(err));
      toast.error(errorMessage(err));
    },
  });

  const applyMutation = useToolMutation("template.apply", {
    onSuccess: (report) => {
      setApplied(report);
      setError(null);
      toast.success("Template applied");
      onApplied();
    },
    onError: (err) => {
      setError(errorMessage(err));
      toast.error(errorMessage(err));
    },
  });

  const overwrites = preview?.overwrittenPages ?? [];
  const busy = previewMutation.isPending || applyMutation.isPending;
  const siteUrl = site.data?.settings.siteUrl || "";

  function runApply() {
    setConfirming(false);
    applyMutation.mutate({ ...target, mode, includeSampleContent: includeSamples });
  }

  const title = selection.kind === "installed" ? selection.name : selection.template.meta.name;

  return (
    <Modal open onClose={onClose} title={title} className="max-w-5xl">
      {selection.kind === "installed" && installed.isLoading && <Spinner />}
      {selection.kind === "installed" && installed.isError && <ErrorBanner message={errorMessage(installed.error)} />}

      {template && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          {/* Preview */}
          <div className="space-y-3">
            {template.pages.length > 1 && (
              <Tabs
                tabs={template.pages.map((p, i) => ({ label: p.title, value: String(i) }))}
                value={String(pageIndex)}
                onChange={(v) => setPageIndex(Number(v))}
              />
            )}
            <div className="wv-scroll h-[52vh] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              {/* 1200px canvas at 0.5 → 600px wide; the wrapper reserves the scaled height. */}
              <TemplatePreview template={template} pageIndex={pageIndex} scale={0.5} className="mx-auto max-w-full" />
            </div>
          </div>

          {/* Meta + apply flow */}
          <div className="space-y-4">
            <div className="space-y-1">
              {template.meta.description && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{template.meta.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge tone="neutral">{template.pages.length} pages</Badge>
                {template.samplePosts.length > 0 && <Badge tone="neutral">{template.samplePosts.length} sample posts</Badge>}
                {template.menus.length > 0 && <Badge tone="neutral">{template.menus.length} menus</Badge>}
                {template.media.length > 0 && <Badge tone="neutral">{template.media.length} media</Badge>}
                {selection.kind === "file" && <Badge tone="violet">uploaded</Badge>}
              </div>
              <div className="pt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {template.meta.author || "Unknown author"} · v{template.meta.templateVersion}
              </div>
            </div>

            {applied ? (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-900/70 dark:bg-emerald-950/60">
                <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Template applied</div>
                <ReportList lines={summarizeReport(applied)} />
                <div className="flex flex-wrap gap-3 text-sm font-medium">
                  {siteUrl && (
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-800 hover:underline dark:text-emerald-300"
                    >
                      View site
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                  <Link to="/pages" className="text-emerald-800 hover:underline dark:text-emerald-300">
                    Open pages
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    How should existing pages be handled?
                  </legend>
                  {(
                    [
                      { value: "merge", label: "Merge", hint: "Keep my existing pages — matching slugs are skipped." },
                      { value: "replace", label: "Replace", hint: "Overwrite pages with matching slugs." },
                    ] as const
                  ).map((opt) => (
                    <label key={opt.value} className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="template-mode"
                        className="mt-0.5 h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700 dark:bg-zinc-900"
                        checked={mode === opt.value}
                        onChange={() => setMode(opt.value)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{opt.label}</span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                {template.samplePosts.length > 0 && (
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700 dark:bg-zinc-900"
                      checked={includeSamples}
                      onChange={(e) => setIncludeSamples(e.target.checked)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        Include sample posts
                      </span>
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        Adds {template.samplePosts.length} example post
                        {template.samplePosts.length === 1 ? "" : "s"} you can edit or delete.
                      </span>
                    </span>
                  </label>
                )}

                {preview && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      What will change
                    </div>
                    <ReportList lines={summarizeReport(preview)} />
                  </div>
                )}

                {error && <ErrorBanner message={error} />}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => previewMutation.mutate({ ...target, mode })}
                  >
                    {previewMutation.isPending ? "Checking…" : "Preview changes"}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => (overwrites.length > 0 ? setConfirming(true) : runApply())}
                  >
                    {applyMutation.isPending ? "Applying…" : "Apply template"}
                  </Button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Applying replaces your site design and menus. Preview first to see exactly what changes.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Overwrite existing pages?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={runApply}>
              Overwrite and apply
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {overwrites.length} existing page{overwrites.length === 1 ? "" : "s"} will be replaced by this template:
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {overwrites.map((slug) => (
            <li key={slug}>
              <Badge tone="amber" mono>
                /{slug}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Your site design and menus will also be replaced. This can't be undone.
        </p>
      </Modal>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Upload + export
// ---------------------------------------------------------------------------

function UploadButton({ onLoaded }: { onLoaded: (template: SiteTemplate) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [issues, setIssues] = useState<string[] | null>(null);

  async function pick(file: File | null) {
    if (!file) return;
    setIssues(null);
    const result = validateTemplateFile(await file.text());
    if (result.ok) onLoaded(result.template);
    else setIssues(result.issues);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
        Upload template
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <Modal open={issues !== null} onClose={() => setIssues(null)} title="That file isn't a valid template">
        <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
          The file didn't match the template format. {issues?.length ?? 0} problem
          {issues?.length === 1 ? "" : "s"}:
        </p>
        <ul className="wv-scroll max-h-64 space-y-1 overflow-y-auto text-sm">
          {issues?.map((issue, i) => (
            <li key={i} className="font-mono text-xs text-red-700 dark:text-red-400">
              {issue}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

function ExportCard() {
  const toast = useToast();
  const site = useToolQuery("site.info", {});
  const [includeContent, setIncludeContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportTemplate() {
    setBusy(true);
    setError(null);
    try {
      const template = await client.call("template.export", { includeContent });
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = templateFileName(site.data?.settings.siteTitle ?? template.meta.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (err) {
      const message = err instanceof WoveError ? err.message : errorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Export my site as a template" />
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Package this site's design, menus and block pages as a reusable template file.
      </p>
      <label className="mb-3 flex items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700 dark:bg-zinc-900"
          checked={includeContent}
          onChange={(e) => setIncludeContent(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">Include content</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            Bundle published posts as sample content.
          </span>
        </span>
      </label>
      {error && <ErrorBanner message={error} />}
      <div className="mt-3">
        <Button variant="secondary" onClick={() => void exportTemplate()} disabled={busy}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "Exporting…" : "Export template"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Media referenced by your pages is bundled into the file, up to a 20 MB cap.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Templates() {
  const list = useToolQuery("template.list", {});
  const invalidate = useInvalidateTool();
  const [selection, setSelection] = useState<Selection | null>(null);

  /** After an apply, everything the template touched is stale. */
  function invalidateApplied() {
    for (const name of ["post.list", "menu.list", "design.get", "site.info"] as const) invalidate(name);
  }

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Start from a designed site, or package your own"
        actions={<UploadButton onLoaded={(template) => setSelection({ kind: "file", template })} />}
      />

      <div className="space-y-6">
        {list.isLoading && <Spinner />}
        {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

        {list.data && list.data.length === 0 && (
          <Card className="p-0">
            <EmptyState
              icon={<LayoutTemplate className="h-5 w-5" />}
              title="No templates installed"
              description="Upload a template file to preview and apply it to this site."
            />
          </Card>
        )}

        {list.data && list.data.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {list.data.map((summary) => (
              <TemplateCard
                key={summary.slug}
                summary={summary}
                onOpen={() => setSelection({ kind: "installed", slug: summary.slug, name: summary.name })}
              />
            ))}
          </div>
        )}

        <div className="max-w-xl">
          <ExportCard />
        </div>
      </div>

      {selection && (
        <TemplateDetail selection={selection} onClose={() => setSelection(null)} onApplied={invalidateApplied} />
      )}
    </div>
  );
}
