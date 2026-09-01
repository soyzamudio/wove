import { useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, GripVertical, Pencil, Sparkles, Trash2 } from "lucide-react";
import { BlockView } from "@agentpress/blocks";
import { BlockMeta } from "@agentpress/sdk";
import type { BuilderBlock } from "../lib/builderState";
import { useToolMutation } from "../api";
import { useToast } from "../context/ToastContext";
import { Button, Input, cx, errorMessage } from "./ui";

const TOOL_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

/**
 * One block on the canvas: hover outline, click to select, corner handles and a
 * floating toolbar (move / edit / duplicate / AI / delete) plus a drag handle.
 */
export function BlockFrame({
  block,
  index,
  count,
  selected,
  postId,
  onSelect,
  onMove,
  onEdit,
  onDuplicate,
  onRemove,
  onReplace,
}: {
  block: BuilderBlock;
  index: number;
  count: number;
  selected: boolean;
  postId?: string;
  onSelect: () => void;
  onMove: (delta: number) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onReplace: (block: BuilderBlock) => void;
}) {
  const toast = useToast();
  const [aiOpen, setAiOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const editBlock = useToolMutation("ai.editBlock", {
    onSuccess: (result) => {
      onReplace(result.block as BuilderBlock);
      toast.success(`Block updated (${result.usage.outputTokens} tokens)`);
      setInstruction("");
      setAiOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx("relative", isDragging && "z-20 opacity-60")}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`${BlockMeta[block.type].name} block`}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cx(
          "group relative cursor-pointer outline-none ring-inset transition-shadow",
          selected ? "ring-2 ring-blue-600" : "ring-1 ring-transparent hover:ring-blue-400/70"
        )}
      >
        <div className="ap-blocks pointer-events-none">
          <section className={`ap-block ap-block--${block.type}`}>
            <BlockView block={block} />
          </section>
        </div>

        {/* Corner handles, design-tool style */}
        {selected &&
          ["-left-1 -top-1", "-right-1 -top-1", "-bottom-1 -left-1", "-bottom-1 -right-1"].map((pos) => (
            <span
              key={pos}
              aria-hidden="true"
              className={cx("absolute h-2 w-2 rounded-[2px] border border-blue-600 bg-white", pos)}
            />
          ))}

        {/* Type label on hover */}
        {!selected && (
          <span className="pointer-events-none absolute left-0 top-0 hidden rounded-br-md bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white group-hover:block">
            {BlockMeta[block.type].name}
          </span>
        )}
      </div>

      {/* Floating toolbar, top-left of the selected block */}
      {selected && (
        <div
          className="absolute -top-9 left-0 z-30 flex items-center gap-0.5 rounded-lg bg-zinc-900 px-1 py-1 shadow-lg ring-1 ring-black/20"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {BlockMeta[block.type].name}
          </span>
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            className={cx(TOOL_BTN, "cursor-grab active:cursor-grabbing")}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Move up" title="Move up" className={TOOL_BTN} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            title="Move down"
            className={TOOL_BTN}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Edit block" title="Edit block" className={TOOL_BTN} onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Duplicate block" title="Duplicate" className={TOOL_BTN} onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Edit with AI"
            title="Edit with AI"
            className={cx(TOOL_BTN, aiOpen && "bg-white/15 text-white")}
            onClick={() => setAiOpen((v) => !v)}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Delete block"
            title="Delete"
            className={cx(TOOL_BTN, "hover:bg-red-600/80")}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Inline AI instruction bar */}
      {selected && aiOpen && (
        <div
          className="absolute left-0 right-0 top-0 z-20 flex gap-2 rounded-lg border border-blue-300 bg-white p-2 shadow-xl dark:border-blue-800 dark:bg-zinc-950"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            autoFocus
            value={instruction}
            placeholder="Tell the AI how to change this block…"
            disabled={editBlock.isPending}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && instruction.trim()) editBlock.mutate({ block: block as any, instruction, postId });
              if (e.key === "Escape") setAiOpen(false);
            }}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={editBlock.isPending || !instruction.trim()}
            onClick={() => editBlock.mutate({ block: block as any, instruction, postId })}
          >
            {editBlock.isPending ? "Working…" : "Apply"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The subtle "+ Add block" affordance shown between blocks and at the end. */
export function AddBlockGap({ onClick, always = false }: { onClick: () => void; always?: boolean }) {
  return (
    <div className={cx("group relative flex items-center justify-center", always ? "py-4" : "h-4")}>
      <div
        className={cx(
          "flex w-full items-center gap-2 transition-opacity",
          always ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
        )}
      >
        <span className="h-px flex-1 bg-blue-300 dark:bg-blue-800" />
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-white px-2.5 py-0.5 text-xs font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-blue-800 dark:bg-zinc-950 dark:text-blue-300"
        >
          + Add block
        </button>
        <span className="h-px flex-1 bg-blue-300 dark:bg-blue-800" />
      </div>
    </div>
  );
}

/** Slot used by the builder to render arbitrary canvas chrome. */
export function CanvasSheet({ children, width }: { children: ReactNode; width: number | null }) {
  return (
    <div
      className="mx-auto bg-white shadow-sm ring-1 ring-zinc-200 transition-[max-width] dark:bg-zinc-950 dark:ring-zinc-800"
      style={width ? { maxWidth: width } : undefined}
    >
      {children}
    </div>
  );
}
