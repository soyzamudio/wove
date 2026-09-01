import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Settings2, Sparkles } from "lucide-react";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { chipPrompt, chipsFor } from "../lib/generate";
import { useToast } from "../context/ToastContext";
import { Button, ErrorBanner, cx, errorMessage } from "./ui";

/**
 * Generation-first hero for the Posts/Pages list: a prompt box that drafts a
 * post (`ai.draftPost`) or builds and saves a draft page (`ai.generatePage`
 * with `save: true`), then navigates straight into the editor/builder.
 *
 * When no AI key is configured the hero still renders — muted, with a link to
 * Settings — because it advertises the feature rather than hiding it.
 */
export function GenerateHero({
  postType,
  autoFocus = false,
  onFocused,
}: {
  postType: "post" | "page";
  /** Deep-link (`?ai=1`) support: focus the prompt box on mount. */
  autoFocus?: boolean;
  onFocused?: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateTool();

  const aiConfig = useToolQuery("ai.config", {});
  const configured = !!aiConfig.data && aiConfig.data.keySource !== "none";

  const isPage = postType === "page";
  const basePath = isPage ? "/pages" : "/posts";
  const noun = isPage ? "Page" : "Post";
  const chips = chipsFor(postType);

  const draftPost = useToolMutation("ai.draftPost", {
    onSuccess: (created) => {
      toast.success(`${noun} drafted`);
      invalidate("post.list");
      setPrompt("");
      navigate(`${basePath}/${created.id}`);
    },
  });

  const generatePage = useToolMutation("ai.generatePage", {
    onSuccess: (result) => {
      if (!result.post) {
        toast.error("The page was generated but could not be saved as a draft.");
        return;
      }
      toast.success("Page drafted");
      invalidate("post.list");
      setPrompt("");
      navigate(`${basePath}/${result.post.id}`);
    },
  });

  const active = isPage ? generatePage : draftPost;
  const pending = active.isPending;
  const error = active.isError ? errorMessage(active.error) : null;

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
    onFocused?.();
    // Only react to the deep-link flag flipping on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  function focusPrompt() {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  function applyChip(template: string) {
    setPrompt((cur) => chipPrompt(cur, template));
    // Focus after React has flushed the new value so the caret lands at the end.
    requestAnimationFrame(focusPrompt);
  }

  function generate() {
    const text = prompt.trim();
    if (!text || pending || !configured) return;
    if (isPage) generatePage.mutate({ prompt: text, save: true });
    else draftPost.mutate({ prompt: text, type: postType });
  }

  return (
    <section
      className={cx(
        "relative mb-5 overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6",
        "dark:border-zinc-800 dark:bg-zinc-950"
      )}
    >
      {/* Soft brand wash, kept subtle so the prompt box stays the focus. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-blue-500/10 to-transparent dark:from-blue-500/10"
      />

      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-xl">
            {isPage ? "What page should we build?" : "What would you like to publish?"}
          </h2>
        </div>

        <div className="relative mt-3">
          <textarea
            ref={textareaRef}
            rows={2}
            value={prompt}
            disabled={!configured || pending}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                generate();
              }
            }}
            aria-label={isPage ? "Describe the page to generate" : "Describe the post to generate"}
            placeholder={
              isPage
                ? "Describe the page — its purpose, sections and tone…"
                : "Describe the post — its angle, audience and tone…"
            }
            className={cx(
              "w-full resize-y rounded-xl border border-zinc-300 bg-white px-4 py-3 pr-3 text-sm text-zinc-900 shadow-sm",
              "placeholder:text-zinc-400 transition-shadow focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            )}
          />

          {!configured && !aiConfig.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-[1px] dark:bg-zinc-950/70">
              <Link
                to="/settings/ai"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                Configure AI in Settings
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={!configured || pending}
              onClick={() => applyChip(chip.template)}
              className={cx(
                "rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors",
                "hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-50",
                "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
              )}
            >
              {chip.label}
            </button>
          ))}

          <div className="ml-auto">
            <Button
              variant="primary"
              onClick={generate}
              disabled={!configured || pending || prompt.trim().length === 0}
              title="Generate (⌘↵)"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {pending ? (isPage ? "Building…" : "Drafting…") : "Generate"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-3">
            <ErrorBanner message={error} />
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          {configured && aiConfig.data
            ? `Generates with ${aiConfig.data.provider}/${aiConfig.data.model || "default model"} · drafts are never auto-published`
            : "Connect a provider to generate drafts from a prompt. Drafts are never auto-published."}
          {configured && <span className="ml-1 hidden sm:inline">· ⌘↵ to generate</span>}
        </p>
      </div>
    </section>
  );
}
