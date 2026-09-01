import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ImportJob, ImportOptions } from "@wove/sdk";
import { ArrowDownToLine, ChevronDown, Download, UploadCloud } from "lucide-react";
import { exportSiteUrl, importWordpress, useToolQuery } from "../api";
import { formatElapsed, summarizeWarnings } from "../lib/importReport";
import { useToast } from "../context/ToastContext";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Spinner,
  cx,
  errorMessage,
  type BadgeTone,
} from "../components/ui";

const DEFAULT_OPTIONS: ImportOptions = {
  downloadMedia: true,
  pagesAsBlocks: true,
  overwrite: false,
  dryRun: false,
};

const OPTION_FIELDS: Array<{
  key: keyof ImportOptions;
  label: string;
  description: string;
}> = [
  { key: "downloadMedia", label: "Download media", description: "Fetch attachments from the old site and store them in the media library." },
  { key: "pagesAsBlocks", label: "Import pages as block pages", description: "Pages open in the builder as a single Markdown block instead of the plain editor." },
  { key: "overwrite", label: "Overwrite existing items", description: "Re-import items that already exist (matched by WordPress id) instead of skipping them." },
  { key: "dryRun", label: "Dry run", description: "Parse and report without writing anything." },
];

const STATUS_TONES: Record<ImportJob["status"], BadgeTone> = {
  queued: "neutral",
  running: "blue",
  done: "green",
  failed: "red",
};

const COUNT_LABELS: Array<{ key: keyof ImportJob["counts"]; label: string }> = [
  { key: "posts", label: "Posts" },
  { key: "pages", label: "Pages" },
  { key: "media", label: "Media" },
  { key: "terms", label: "Terms" },
  { key: "menus", label: "Menus" },
  { key: "skipped", label: "Skipped" },
  { key: "failed", label: "Failed" },
];

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
    </div>
  );
}

function WarningsList({ warnings }: { warnings: ImportJob["warnings"] }) {
  const [open, setOpen] = useState(false);
  if (warnings.length === 0) return null;

  const grouped = warnings.length > 20 ? summarizeWarnings(warnings) : null;

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
        {warnings.length} warning{warnings.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="wv-scroll mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-zinc-600 dark:text-zinc-400">
          {grouped
            ? grouped.map((g) => (
                <li key={g.message} className="flex items-start gap-2">
                  <Badge tone="amber" className="shrink-0">
                    {g.count}
                  </Badge>
                  <span>{g.message}</span>
                </li>
              ))
            : warnings.map((w, i) => (
                <li key={i}>
                  {w.item && <span className="font-mono text-zinc-500 dark:text-zinc-500">{w.item}</span>}
                  {w.item && " — "}
                  {w.message}
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}

function ImportJobCard({ job, dryRun }: { job: ImportJob; dryRun?: boolean }) {
  const elapsed = formatElapsed((job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime());
  const pct = job.progress.total > 0 ? Math.min(100, Math.round((job.progress.done / job.progress.total) * 100)) : 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONES[job.status]}>{job.status}</Badge>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{job.phase}</span>
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{elapsed} elapsed</span>
      </div>

      {(job.status === "queued" || job.status === "running") && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {job.progress.done} / {job.progress.total || "?"}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {COUNT_LABELS.map(({ key, label }) => (
          <StatTile key={key} label={label} value={job.counts[key]} />
        ))}
      </div>

      {job.status === "done" && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-300">
          <span className="font-medium">{dryRun ? "Dry run — nothing was written." : "Import complete."}</span>{" "}
          <span className="ml-1">
            {job.counts.posts} posts, {job.counts.pages} pages, {job.counts.media} media, {job.counts.menus} menus.
          </span>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <Link to="/posts" className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">
              View posts
            </Link>
            <Link to="/pages" className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">
              View pages
            </Link>
            <Link to="/menus" className="font-medium text-emerald-800 hover:underline dark:text-emerald-300">
              View menus
            </Link>
          </div>
        </div>
      )}

      {job.status === "failed" && <ErrorBanner message={job.error ?? "Import failed."} />}

      <WarningsList warnings={job.warnings} />
    </Card>
  );
}

function ImportForm({ onStarted }: { onStarted: (job: ImportJob, dryRun: boolean) => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    if (f && !f.name.toLowerCase().endsWith(".xml")) {
      setError("Please choose a WordPress export .xml file.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function submit() {
    if (!file) {
      setError("Choose a WordPress export .xml file first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const job = await importWordpress(file, options);
      onStarted(job, options.dryRun);
      toast.success("Import started.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Import from WordPress" />
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        In WordPress go to <span className="font-medium">Tools → Export → All content</span>, then upload the .xml
        here.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
        )}
      >
        <UploadCloud className="h-6 w-6 text-zinc-400" aria-hidden="true" />
        {file ? (
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{file.name}</div>
        ) : (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Drop a WordPress export .xml here, or click to choose one</div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xml"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-4 space-y-3">
        {OPTION_FIELDS.map(({ key, label, description }) => (
          <label key={key} className="flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700 dark:bg-zinc-900"
              checked={options[key]}
              onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
            </span>
          </label>
        ))}
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-4">
        <Button onClick={submit} disabled={submitting || !file}>
          {submitting ? "Starting…" : "Start import"}
        </Button>
      </div>
    </Card>
  );
}

function PreviousImports({ onSelect }: { onSelect: (id: string) => void }) {
  const list = useToolQuery("import.list", {});

  if (list.isLoading) return <Spinner />;
  if (list.isError) return <ErrorBanner message={errorMessage(list.error)} />;
  if (!list.data || list.data.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState icon={<ArrowDownToLine className="h-5 w-5" />} title="No imports yet" />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {list.data.map((job) => (
        <button
          key={job.id}
          type="button"
          onClick={() => onSelect(job.id)}
          className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
        >
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONES[job.status]}>{job.status}</Badge>
            <span className="text-zinc-500 dark:text-zinc-400">{new Date(job.startedAt).toLocaleString()}</span>
          </div>
          <span className="text-zinc-600 dark:text-zinc-400">
            {job.counts.posts} posts · {job.counts.pages} pages · {job.counts.media} media
            {job.warnings.length > 0 && ` · ${job.warnings.length} warnings`}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ImportExport() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobDryRun, setActiveJobDryRun] = useState(false);

  const activeJob = useToolQuery(
    "import.status",
    { id: activeJobId ?? "" },
    {
      enabled: !!activeJobId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "queued" || status === "running" ? 1500 : false;
      },
    }
  );

  const exportHref = useMemo(() => exportSiteUrl(), []);

  return (
    <div>
      <PageHeader title="Import / Export" subtitle="Bring content in from WordPress, or download a full export" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <ImportForm
            onStarted={(job, dryRun) => {
              setActiveJobId(job.id);
              setActiveJobDryRun(dryRun);
            }}
          />

          <Card>
            <CardHeader title="Export" />
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Download a JSON export of the whole site (settings, design, menus, terms, media list, posts). Media
              files themselves aren't included — only their metadata.
            </p>
            <a href={exportHref} target="_blank" rel="noreferrer">
              <Button variant="secondary">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download site.json
              </Button>
            </a>
          </Card>
        </div>

        <div className="space-y-6">
          {activeJobId && (
            <div>
              <CardHeader title="Import progress" />
              {activeJob.isLoading && <Spinner />}
              {activeJob.isError && <ErrorBanner message={errorMessage(activeJob.error)} />}
              {activeJob.data && <ImportJobCard job={activeJob.data} dryRun={activeJobDryRun} />}
            </div>
          )}

          <div>
            <CardHeader title="Previous imports" />
            <PreviousImports
              onSelect={(id) => {
                setActiveJobId(id);
                setActiveJobDryRun(false);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
