import { useRef } from "react";
import { Copy, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import type { Media as MediaItem } from "@agentpress/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner, errorMessage } from "../components/ui";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function MediaCard({ item, onDelete, isDeleting }: { item: MediaItem; onDelete: () => void; isDeleting: boolean }) {
  const toast = useToast();

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(item.url);
      toast.success("URL copied to clipboard");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const filename = item.path.split("/").pop();

  return (
    <div className="group">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        <img
          src={item.url}
          alt={item.alt ?? ""}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            const fallback = e.currentTarget.parentElement?.querySelector("[data-fallback]") as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div
          data-fallback
          className="absolute inset-0 hidden flex-col items-center justify-center gap-1 p-2 text-center text-xs text-zinc-500 dark:text-zinc-400"
        >
          <ImageIcon className="h-5 w-5" aria-hidden="true" />
          <span className="w-full truncate">{filename}</span>
          <span>{item.mime}</span>
        </div>

        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-zinc-950/60 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={copyUrl}
            aria-label={`Copy URL for ${filename}`}
            title="Copy URL"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-zinc-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onDelete}
            aria-label={`Delete ${filename}`}
            title="Delete"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 min-w-0">
        <div className="truncate text-xs font-medium" title={item.path}>
          {filename}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {item.mime} · {formatSize(item.size)}
        </div>
      </div>
    </div>
  );
}

export function Media() {
  const list = useToolQuery("media.list", { limit: 100 });
  const invalidate = useInvalidateTool();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const upload = useToolMutation("media.upload", {
    onSuccess: () => {
      toast.success("Media uploaded");
      invalidate("media.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const del = useToolMutation("media.delete", {
    onSuccess: () => {
      toast.success("Media deleted");
      invalidate("media.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const base64 = await readAsBase64(file);
      upload.mutate({ filename: file.name, mime: file.type || "application/octet-stream", base64 });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Media"
        subtitle="Images and files available to your content"
        actions={
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
            <Button variant="primary" disabled={upload.isPending} onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
          </>
        }
      />

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <Card className={list.data.items.length === 0 ? "p-0" : ""}>
          {list.data.items.length === 0 ? (
            <EmptyState
              icon={<ImageIcon className="h-5 w-5" />}
              title="No media yet"
              description="Upload an image or file to use it in your posts and pages."
              action={
                <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                  Upload media
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {list.data.items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  isDeleting={del.isPending}
                  onDelete={() => {
                    if (window.confirm(`Delete "${item.path.split("/").pop()}"? This cannot be undone.`)) {
                      del.mutate({ id: item.id });
                    }
                  }}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
