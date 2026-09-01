import { useRef } from "react";
import type { Media as MediaItem } from "@agentpress/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Spinner, errorMessage } from "../components/ui";

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

  return (
    <Card className="flex flex-col gap-2 p-3">
      <button
        type="button"
        onClick={copyUrl}
        className="block aspect-square w-full overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800"
        title="Click to copy URL"
      >
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
          className="hidden h-full w-full flex-col items-center justify-center p-2 text-center text-xs text-zinc-500 dark:text-zinc-400"
        >
          <span className="truncate w-full">{item.path.split("/").pop()}</span>
          <span>{item.mime}</span>
        </div>
      </button>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium" title={item.path}>
          {item.path.split("/").pop()}
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {item.mime} · {formatSize(item.size)}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={copyUrl}>
          Copy URL
        </Button>
        <Button variant="danger" disabled={isDeleting} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Media</h1>
        <div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
          <Button variant="primary" disabled={upload.isPending} onClick={() => fileInputRef.current?.click()}>
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && list.data.items.length === 0 && (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">No media yet.</div>
      )}

      {list.data && list.data.items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
    </div>
  );
}
