import { useState } from "react";
import { Sparkles } from "lucide-react";
import { BLOCK_TYPES, BlockMeta, newBlock } from "@agentpress/blocks";
import type { BlockType } from "@agentpress/sdk";
import type { BuilderBlock } from "../lib/builderState";
import { useToolMutation } from "../api";
import { useToast } from "../context/ToastContext";
import { BlockThumb } from "./BlockThumb";
import { Button, Modal, Textarea, errorMessage } from "./ui";

/**
 * "Add block" modal: describe a section for the AI to build, or pick one of the
 * twelve block types. Either way the new block is handed to `onInsert`.
 */
export function AddBlockPicker({
  open,
  onClose,
  onInsert,
  postId,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (block: BuilderBlock) => void;
  postId?: string;
}) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");

  const generate = useToolMutation("ai.generateBlock", {
    onSuccess: (result) => {
      onInsert(result.block as BuilderBlock);
      toast.success(`Generated a ${BlockMeta[result.block.type].name} block (${result.usage.outputTokens} tokens)`);
      setPrompt("");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function pick(type: BlockType) {
    onInsert(newBlock(type) as BuilderBlock);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add block" className="max-w-2xl">
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-800 dark:text-blue-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Generate with AI
          </div>
          <Textarea
            rows={2}
            value={prompt}
            disabled={generate.isPending}
            placeholder="Describe the section you want…"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim()) {
                generate.mutate({ prompt, postId });
              }
            }}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={generate.isPending || !prompt.trim()}
            onClick={() => generate.mutate({ prompt, postId })}
          >
            {generate.isPending ? "Generating…" : "Generate"}
          </Button>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Or pick a block
          </div>
          <div className="ap-scroll grid max-h-[45vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {BLOCK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => pick(type)}
                className="rounded-lg border border-zinc-200 p-2 text-left transition-colors hover:border-blue-500 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-zinc-800 dark:hover:bg-blue-950/30"
              >
                <BlockThumb type={type} />
                <div className="mt-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {BlockMeta[type].name}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                  {BlockMeta[type].description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
