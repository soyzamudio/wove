import { Image as ImageIcon } from "lucide-react";
import type { Media } from "@agentpress/sdk";
import { useToolQuery } from "../api";
import { EmptyState, ErrorBanner, Modal, Spinner, errorMessage } from "./ui";

/** Grid of media library items; picking one hands the whole item back. */
export function MediaPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: Media) => void;
}) {
  const list = useToolQuery("media.list", { limit: 100 }, { enabled: open });

  return (
    <Modal open={open} onClose={onClose} title="Choose from media" className="max-w-3xl">
      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No media yet" description="Upload images from the Media page first." />
      )}
      {list.data && list.data.items.length > 0 && (
        <div className="ap-scroll grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {list.data.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onPick(item);
                onClose();
              }}
              title={item.path}
              className="group overflow-hidden rounded-lg border border-zinc-200 text-left transition-colors hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-zinc-800"
            >
              <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-900">
                <img src={item.url} alt={item.alt ?? ""} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="truncate px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {item.path.split("/").pop()}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
