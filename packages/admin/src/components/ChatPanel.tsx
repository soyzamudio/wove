import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { marked } from "marked";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquarePlus,
  Send,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ChatMessage, ChatToolCall } from "@wove/sdk";
import { useToolQuery } from "../api";
import { useChat } from "../context/ChatContext";
import { splitUnifiedDiff, diffStats } from "../lib/diff";
import { isReadCall, openInEditorTarget } from "../lib/chat";
import { relativeTime } from "../lib/time";
import { Button, Spinner, cx } from "./ui";

const PANEL_WIDTH = 480;
const JSON_PREVIEW_LIMIT = 800;

function pretty(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function renderMarkdown(md: string): string {
  try {
    const out = marked.parse(md, { async: false } as any);
    return typeof out === "string" ? out : "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Collapsible pretty-printed JSON with a "show more" for huge payloads
// ---------------------------------------------------------------------------

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text = useMemo(() => pretty(value), [value]);
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const truncated = text.length > JSON_PREVIEW_LIMIT && !expanded;
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</div>
      <pre className="wv-scroll max-h-64 overflow-auto rounded-md bg-zinc-100 p-2 font-mono text-[11px] leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        {truncated ? text.slice(0, JSON_PREVIEW_LIMIT) + "\n…" : text}
      </pre>
      {text.length > JSON_PREVIEW_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          {expanded ? "Show less" : `Show more (${text.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}

function DiffBlock({ diff }: { diff: string }) {
  const rows = useMemo(() => splitUnifiedDiff(diff), [diff]);
  const stats = useMemo(() => diffStats(rows), [rows]);
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <span>Diff</span>
        <span className="text-emerald-600 dark:text-emerald-400">+{stats.added}</span>
        <span className="text-red-600 dark:text-red-400">−{stats.removed}</span>
      </div>
      <div className="wv-scroll max-h-64 overflow-auto bg-white font-mono text-[11px] leading-[1.45] dark:bg-zinc-950">
        {rows.map((row, i) => (
          <div
            key={i}
            className={cx(
              "whitespace-pre px-2",
              row.kind === "add" && "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
              row.kind === "del" && "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
              row.kind === "hunk" && "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
              row.kind === "ctx" && "text-zinc-600 dark:text-zinc-400"
            )}
          >
            {row.kind === "add" ? "+" : row.kind === "del" ? "−" : row.kind === "hunk" ? "" : " "}
            {row.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call rendering
// ---------------------------------------------------------------------------

/** A read that already executed: one collapsed row, expandable to input/result. */
function ReadRow({ call }: { call: ChatToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{call.tool}</span>
        {call.preview?.title && <span className="truncate text-zinc-400">{call.preview.title}</span>}
      </button>
      {open && (
        <div className="border-t border-zinc-200 px-2 pb-2 dark:border-zinc-800">
          <JsonBlock label="Input" value={call.input} />
          <JsonBlock label="Result" value={call.result} />
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  proposed: "border-amber-400 bg-amber-50/60 dark:border-amber-500/60 dark:bg-amber-950/20",
  applied: "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20",
  failed: "border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
  rejected: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
};

/** A mutation card: proposed (approvable) or a terminal applied/failed/rejected state. */
function MutationCard({
  call,
  checked,
  onToggle,
  disabled,
}: {
  call: ChatToolCall;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const [showInput, setShowInput] = useState(false);
  const editorLink = openInEditorTarget(call);
  const isProposed = call.status === "proposed";
  const title = call.preview?.title || call.tool;

  return (
    <div className={cx("rounded-lg border p-2", STATUS_STYLE[call.status] ?? STATUS_STYLE.rejected)}>
      <div className="flex items-start gap-2">
        {isProposed && (
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onToggle}
            aria-label={`Approve ${title}`}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-600"
          />
        )}
        {call.status === "applied" && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
        {call.status === "failed" && <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <div
            className={cx(
              "text-xs font-semibold",
              call.status === "rejected"
                ? "text-zinc-400 line-through dark:text-zinc-500"
                : "text-zinc-900 dark:text-zinc-100"
            )}
          >
            {title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-mono text-zinc-500 dark:text-zinc-400">{call.tool}</span>
            {call.status === "applied" && <span className="font-medium text-emerald-700 dark:text-emerald-400">Applied</span>}
            {call.status === "rejected" && <span className="text-zinc-400 dark:text-zinc-500">Discarded</span>}
            <button
              type="button"
              onClick={() => setShowInput((v) => !v)}
              aria-expanded={showInput}
              className="text-zinc-500 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {showInput ? "Hide input" : "Show input"}
            </button>
            {editorLink && (
              <Link to={editorLink} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                Open in editor
              </Link>
            )}
          </div>
          {call.status === "failed" && (
            <div className="mt-1 rounded bg-red-100 px-2 py-1 text-[11px] text-red-800 dark:bg-red-950/60 dark:text-red-300">
              {typeof call.result === "string" ? call.result : pretty(call.result) || "Failed"}
            </div>
          )}
          {showInput && <JsonBlock label="Input" value={call.input} />}
          {call.preview?.diff && <DiffBlock diff={call.preview.diff} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function AssistantBody({
  content,
  calls,
  streaming,
}: {
  content: string;
  calls: ChatToolCall[];
  streaming?: boolean;
}) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  const reads = calls.filter((c) => isReadCall(c));
  const mutations = calls.filter((c) => !isReadCall(c));
  return (
    <>
      {reads.length > 0 && (
        <div className="mb-2 space-y-1">
          {reads.map((c) => (
            <ReadRow key={c.id} call={c} />
          ))}
        </div>
      )}
      {(content || streaming) && (
        <div className="wv-prose text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
          <span dangerouslySetInnerHTML={{ __html: html }} />
          {streaming && (
            <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-zinc-500 align-[-2px] dark:bg-zinc-300" aria-hidden="true" />
          )}
        </div>
      )}
      {mutations.length > 0 && <div className="mt-2 space-y-1.5">{mutations.map((c) => <MutationCardSlot key={c.id} call={c} />)}</div>}
    </>
  );
}

/** Mutation shown while streaming (before a plan footer exists): read-only. */
function MutationCardSlot({ call }: { call: ChatToolCall }) {
  return <MutationCard call={call} checked disabled onToggle={() => {}} />;
}

function AssistantMessageView({ message }: { message: ChatMessage }) {
  const { applyPlan, discardPlan, applyingMessageId } = useChat();
  const proposed = message.toolCalls.filter((c) => c.status === "proposed");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const busy = applyingMessageId === message.id;

  // Default every proposal to checked; re-sync when the plan changes underneath.
  useEffect(() => {
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      for (const c of proposed) next[c.id] = prev[c.id] ?? true;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.toolCalls]);

  const reads = message.toolCalls.filter((c) => isReadCall(c));
  const mutations = message.toolCalls.filter((c) => !isReadCall(c));
  const html = useMemo(() => renderMarkdown(message.content), [message.content]);
  const selectedIds = proposed.filter((c) => selected[c.id]).map((c) => c.id);

  return (
    <div className="max-w-full">
      {reads.length > 0 && (
        <div className="mb-2 space-y-1">
          {reads.map((c) => (
            <ReadRow key={c.id} call={c} />
          ))}
        </div>
      )}
      {message.content && (
        <div
          className="wv-prose text-sm leading-relaxed text-zinc-800 dark:text-zinc-200"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {mutations.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {mutations.map((c) => (
            <MutationCard
              key={c.id}
              call={c}
              checked={!!selected[c.id]}
              disabled={busy || c.status !== "proposed"}
              onToggle={() => setSelected((s) => ({ ...s, [c.id]: !s[c.id] }))}
            />
          ))}
        </div>
      )}
      {message.planPending && proposed.length > 0 && (
        <div className="sticky bottom-0 mt-2 flex items-center gap-2 border-t border-zinc-200 bg-white/95 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <Button
            size="sm"
            variant="primary"
            disabled={busy || selectedIds.length === 0}
            onClick={() => applyPlan(message.id, selectedIds)}
          >
            {busy ? <Spinner /> : null}
            Apply {selectedIds.length} selected
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => discardPlan(message.id)}>
            Discard all
          </Button>
        </div>
      )}
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="w-full min-w-0">
        <AssistantMessageView message={message} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Threads dropdown
// ---------------------------------------------------------------------------

function ThreadMenu({ onClose }: { onClose: () => void }) {
  const { openThread, deleteThread, newThread, threadId } = useChat();
  const threads = useToolQuery("chat.threads", {});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...(threads.data ?? [])].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [threads.data]
  );

  return (
    <div
      role="menu"
      className="absolute left-0 top-full z-10 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          newThread();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
        New chat
      </button>
      <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
      {threads.isLoading && <div className="px-3 py-2 text-xs text-zinc-500">Loading…</div>}
      {!threads.isLoading && sorted.length === 0 && (
        <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">No threads yet.</div>
      )}
      {sorted.map((t) => (
        <div
          key={t.id}
          className={cx(
            "group flex items-center gap-1 px-1.5",
            t.id === threadId && "bg-blue-50 dark:bg-blue-950/40"
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openThread(t.id);
              onClose();
            }}
            className="min-w-0 flex-1 rounded px-1.5 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <div className="truncate text-sm text-zinc-700 dark:text-zinc-200">{t.title || "Untitled"}</div>
            <div className="text-[11px] text-zinc-400">{relativeTime(t.updatedAt)}</div>
          </button>
          {confirmId === t.id ? (
            <button
              type="button"
              onClick={() => {
                deleteThread(t.id);
                setConfirmId(null);
              }}
              className="shrink-0 rounded px-1.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              Confirm
            </button>
          ) : (
            <button
              type="button"
              aria-label={`Delete thread ${t.title}`}
              onClick={() => setConfirmId(t.id)}
              className="shrink-0 rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-900"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function ChatPanel() {
  const chat = useChat();
  const { open, setOpen, messages, streamText, streamCalls, streaming, error } = chat;
  const aiConfig = useToolQuery("ai.config", {}, { enabled: open });
  const aiConfigured = !!aiConfig.data && aiConfig.data.keySource !== "none";

  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll only while the user is parked at the bottom.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages, streamText, streamCalls]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !menuOpen) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, menuOpen, setOpen]);

  if (!open) return null;

  function submit() {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");
    pinnedRef.current = true;
    chat.send(text);
  }

  const empty = messages.length === 0 && !streaming;

  return createPortal(
    <aside
      role="dialog"
      aria-label="Site chat"
      style={{ width: PANEL_WIDTH }}
      className="fixed inset-y-0 right-0 z-40 flex max-w-full flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
    >
      {/* header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <Sparkles className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        <div className="relative min-w-0 flex-1" ref={menuRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{chat.title}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
          </button>
          {menuOpen && <ThreadMenu onClose={() => setMenuOpen(false)} />}
        </div>
        <button
          type="button"
          aria-label="New chat"
          title="New chat"
          onClick={chat.newThread}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Close site chat"
          title="Close (⌘J)"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!aiConfigured && !aiConfig.isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Sparkles className="h-6 w-6 text-zinc-400" aria-hidden="true" />
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI is not configured</div>
          <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            Site chat runs on the same provider as the editor's AI tools.
          </p>
          <Link to="/settings" onClick={() => setOpen(false)} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
            Configure AI in Settings →
          </Link>
        </div>
      ) : (
        <>
          {/* transcript */}
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            }}
            className="wv-scroll flex-1 space-y-3 overflow-y-auto px-3 py-3"
          >
            {chat.loadingThread && <div className="py-6 text-center text-sm text-zinc-500">Loading thread…</div>}
            {empty && !chat.loadingThread && (
              <div className="px-2 py-10 text-center">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ask the site anything</div>
                <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
                  “Create a pricing page, link it in the main nav, and publish it Monday.” Changes are always proposed for your
                  approval first.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {streaming && (streamText || streamCalls.length > 0 || messages.length > 0) && (
              <div className="flex justify-start">
                <div className="w-full min-w-0">
                  <AssistantBody content={streamText} calls={streamCalls} streaming />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{error}</span>
              <button type="button" aria-label="Dismiss error" onClick={chat.dismissError} className="shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* composer */}
          <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={2}
                value={draft}
                placeholder="Ask or instruct… (Enter to send)"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="wv-scroll max-h-40 min-h-[38px] flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              />
              {streaming ? (
                <Button variant="danger" onClick={chat.stop} aria-label="Stop generating">
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  Stop
                </Button>
              ) : (
                <Button variant="primary" disabled={!draft.trim()} onClick={submit} aria-label="Send message">
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>,
    document.body
  );
}

/** Floating launcher — bottom-right on every admin page. */
export function ChatLauncher() {
  const { open, toggle } = useChat();
  if (open) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open site chat"
      title="Site chat (⌘J)"
      className="fixed bottom-5 right-5 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <Sparkles className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
