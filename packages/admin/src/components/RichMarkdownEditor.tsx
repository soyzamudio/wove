import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Code,
  Code2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Unlink,
} from "lucide-react";
import type { Media } from "@wove/sdk";
import { MediaPicker } from "./MediaPicker";
import { Input, cx } from "./ui";
import {
  imageMarkdown,
  readEditorMode,
  writeEditorMode,
  type EditorMode,
} from "../lib/editorMode";

export type RichMarkdownVariant = "full" | "compact";

export interface RichSelection {
  from: number;
  to: number;
  text: string;
}

export interface RichMarkdownEditorHandle {
  /** Current markdown, flushed immediately (bypasses the onChange debounce). */
  getMarkdown(): string;
  /** Replace the live selection (or insert at the caret when collapsed) with markdown. */
  replaceSelection(md: string): void;
  insertAtCursor(md: string): void;
  /** Blow away the document and re-parse `md`. Used by AI streaming. */
  setMarkdown(md: string): void;
}

export interface RichMarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  variant?: RichMarkdownVariant;
  autofocusEnd?: boolean;
  onSelectionChange?: (sel: RichSelection | null) => void;
  /** localStorage bucket for the Write/MD preference, e.g. "post-content". */
  surfaceId?: string;
  className?: string;
  ariaLabel?: string;
}

const DEBOUNCE_MS = 150;

const MIN_HEIGHT: Record<RichMarkdownVariant, string> = {
  full: "min-h-[24rem]",
  compact: "min-h-[9rem]",
};

// ---------------------------------------------------------------------------
// Toolbar primitives
// ---------------------------------------------------------------------------

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 transition-colors",
        "hover:bg-zinc-200/70 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40",
        "dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        active && "bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />;
}

type BlockChoice = "paragraph" | "h1" | "h2" | "h3" | "h4";

const BLOCK_LABELS: Record<BlockChoice, string> = {
  paragraph: "Paragraph",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
};

function currentBlock(editor: Editor): BlockChoice {
  for (const level of [1, 2, 3, 4] as const) {
    if (editor.isActive("heading", { level })) return `h${level}` as BlockChoice;
  }
  return "paragraph";
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor(
    {
      value,
      onChange,
      placeholder = "Write something…",
      variant = "full",
      autofocusEnd = false,
      onSelectionChange,
      surfaceId,
      className,
      ariaLabel = "Content",
    },
    ref
  ) {
    const [mode, setMode] = useState<EditorMode>(() =>
      surfaceId ? readEditorMode(surfaceId) : "wysiwyg"
    );
    const [picking, setPicking] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [, forceRender] = useState(0);

    /** Last markdown this component produced or accepted — the `setContent` guard. */
    const lastMarkdownRef = useRef(value);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onSelectionRef = useRef(onSelectionChange);
    onSelectionRef.current = onSelectionChange;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** True while a debounced onChange is in flight — the parent's `value` is
     *  a beat behind us, and syncing it back in would eat the caret. */
    const pendingRef = useRef(false);
    const overflowRef = useRef<HTMLDivElement>(null);
    const linkRef = useRef<HTMLDivElement>(null);

    const compact = variant === "compact";

    const extensions = useMemo(
      () => [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          codeBlock: {},
horizontalRule: {},
        }),
        Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer" } }),
        Image.configure({ inline: false, allowBase64: false }),
        Placeholder.configure({ placeholder }),
        Markdown.configure({
          html: false,
          transformPastedText: true,
          transformCopiedText: true,
          linkify: false,
          breaks: false,
          tightLists: true,
        }),
      ],
      [placeholder]
    );

    const emit = useCallback((editor: Editor, immediate: boolean) => {
      const md: string = editor.storage.markdown.getMarkdown();
      lastMarkdownRef.current = md;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (immediate) {
        pendingRef.current = false;
        onChangeRef.current(md);
        return;
      }
      pendingRef.current = true;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        pendingRef.current = false;
        onChangeRef.current(md);
      }, DEBOUNCE_MS);
    }, []);

    const editor = useEditor(
      {
        extensions,
        content: value,
        autofocus: autofocusEnd ? "end" : false,
        editorProps: {
          attributes: {
            role: "textbox",
            "aria-label": ariaLabel,
            "aria-multiline": "true",
            class: cx("wv-prose wv-editor focus:outline-none", MIN_HEIGHT[variant]),
          },
        },
        onUpdate: ({ editor: ed }) => emit(ed as Editor, false),
        onSelectionUpdate: ({ editor: ed }) => {
          forceRender((n) => n + 1);
          const cb = onSelectionRef.current;
          if (!cb) return;
          const { from, to } = ed.state.selection;
          if (from === to) {
            cb(null);
            return;
          }
          cb({ from, to, text: ed.state.doc.textBetween(from, to, "\n\n", " ") });
        },
        onTransaction: () => forceRender((n) => n + 1),
      },
      [extensions]
    );

    // Pull external changes in, but only when they really differ from what we
    // last serialized — otherwise every parent render would nuke the caret.
    useEffect(() => {
      if (!editor) return;
      if (value === lastMarkdownRef.current) return;
      if (pendingRef.current) return;
      lastMarkdownRef.current = value;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(value, false);
      const size = editor.state.doc.content.size;
      try {
        editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
      } catch {
        /* document shape changed under us; the caret lands wherever tiptap put it. */
      }
    }, [value, editor]);

    useEffect(
      () => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      },
      []
    );

    useEffect(() => {
      if (!overflowOpen && !linkOpen) return;
      function onDown(e: MouseEvent) {
        if (overflowOpen && !overflowRef.current?.contains(e.target as Node)) setOverflowOpen(false);
        if (linkOpen && !linkRef.current?.contains(e.target as Node)) setLinkOpen(false);
      }
      window.addEventListener("mousedown", onDown);
      return () => window.removeEventListener("mousedown", onDown);
    }, [overflowOpen, linkOpen]);

    const flush = useCallback((): string => {
      if (!editor) return lastMarkdownRef.current;
      const md: string = editor.storage.markdown.getMarkdown();
      lastMarkdownRef.current = md;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      pendingRef.current = false;
      return md;
    }, [editor]);

    useImperativeHandle(
      ref,
      (): RichMarkdownEditorHandle => ({
        getMarkdown: () => (mode === "markdown" ? lastMarkdownRef.current : flush()),
        setMarkdown: (md) => {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          pendingRef.current = false;
          lastMarkdownRef.current = md;
          if (editor && mode === "wysiwyg") editor.commands.setContent(md, false);
          onChangeRef.current(md);
        },
        replaceSelection: (md) => {
          if (!editor || mode === "markdown") {
            onChangeRef.current(md);
            return;
          }
          editor.chain().focus().deleteSelection().insertContent(md).run();
          emit(editor, true);
        },
        insertAtCursor: (md) => {
          if (!editor || mode === "markdown") return;
          editor.chain().focus().insertContent(md).run();
          emit(editor, true);
        },
      }),
      [editor, emit, flush, mode]
    );

    function switchMode(next: EditorMode) {
      if (next === mode) return;
      if (next === "markdown" && editor) onChangeRef.current(flush());
      setMode(next);
      if (surfaceId) writeEditorMode(surfaceId, next);
    }

    function pickImage(item: Media) {
      const md = imageMarkdown(item.url, item.alt ?? "");
      if (mode === "markdown") {
        onChangeRef.current(value + (value.endsWith("\n") || !value ? "" : "\n\n") + md + "\n");
        return;
      }
      if (!editor) return;
      editor.chain().focus().setImage({ src: item.url, alt: item.alt ?? "" }).run();
      emit(editor, true);
    }

    function openLink() {
      if (!editor) return;
      setLinkUrl(editor.getAttributes("link").href ?? "");
      setLinkOpen((v) => !v);
    }

    function applyLink() {
      if (!editor) return;
      const href = linkUrl.trim();
      const chain = editor.chain().focus().extendMarkRange("link");
      if (href) chain.setLink({ href }).run();
      else chain.unsetLink().run();
      setLinkOpen(false);
      emit(editor, true);
    }

    // -- toolbar -----------------------------------------------------------
    const disabled = mode === "markdown" || !editor;

    const heavyButtons = editor && (
      <>
        <ToolButton
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolButton>
      </>
    );

    return (
      <div
        className={cx(
          "overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm",
          "focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20",
          "dark:border-zinc-700 dark:bg-zinc-950",
          className
        )}
      >
        <div
          className={cx(
            "sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur",
            "dark:border-zinc-800 dark:bg-zinc-900/95",
            compact ? "px-1 py-1" : "px-2 py-1.5"
          )}
        >
          <select
            aria-label="Text style"
            disabled={disabled}
            value={editor ? currentBlock(editor) : "paragraph"}
            onChange={(e) => {
              if (!editor) return;
              const next = e.target.value as BlockChoice;
              if (next === "paragraph") editor.chain().focus().setParagraph().run();
              else
                editor
                  .chain()
                  .focus()
                  .setHeading({ level: Number(next.slice(1)) as 1 | 2 | 3 | 4 })
                  .run();
            }}
            className={cx(
              "mr-1 h-7 rounded-md border border-transparent bg-transparent px-1 text-xs font-medium text-zinc-600",
              "hover:bg-zinc-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40",
              "disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            )}
          >
            {(Object.keys(BLOCK_LABELS) as BlockChoice[])
              .filter((k) => !compact || k !== "h1")
              .map((k) => (
                <option key={k} value={k}>
                  {BLOCK_LABELS[k]}
                </option>
              ))}
          </select>

          {editor && (
            <>
              <ToolButton
                label="Bold"
                disabled={disabled}
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton
                label="Italic"
                disabled={disabled}
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton
                label="Strikethrough"
                disabled={disabled}
                active={editor.isActive("strike")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton
                label="Inline code"
                disabled={disabled}
                active={editor.isActive("code")}
                onClick={() => editor.chain().focus().toggleCode().run()}
              >
                <Code className="h-3.5 w-3.5" />
              </ToolButton>

              <Divider />

              <div className="relative" ref={linkRef}>
                <ToolButton label="Link" disabled={disabled} active={editor.isActive("link")} onClick={openLink}>
                  <LinkIcon className="h-3.5 w-3.5" />
                </ToolButton>
                {linkOpen && (
                  <div className="absolute left-0 top-8 z-30 w-64 space-y-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
                    <Input
                      autoFocus
                      value={linkUrl}
                      placeholder="https://example.com"
                      aria-label="Link URL"
                      onChange={(e) => setLinkUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyLink();
                        }
                        if (e.key === "Escape") setLinkOpen(false);
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={applyLink}
                        className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().extendMarkRange("link").unsetLink().run();
                          setLinkOpen(false);
                          emit(editor, true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                      >
                        <Unlink className="h-3 w-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <ToolButton
                label="Bulleted list"
                disabled={disabled}
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton
                label="Numbered list"
                disabled={disabled}
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton
                label="Quote"
                disabled={disabled}
                active={editor.isActive("blockquote")}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >
                <Quote className="h-3.5 w-3.5" />
              </ToolButton>

              <Divider />

              <ToolButton label="Insert image" disabled={mode === "markdown" ? false : !editor} onClick={() => setPicking(true)}>
                <ImageIcon className="h-3.5 w-3.5" />
              </ToolButton>

              {compact ? (
                <div className="relative" ref={overflowRef}>
                  <ToolButton label="More" disabled={disabled} onClick={() => setOverflowOpen((v) => !v)}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </ToolButton>
                  {overflowOpen && (
                    <div className="absolute left-0 top-8 z-30 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
                      {heavyButtons}
                    </div>
                  )}
                </div>
              ) : (
                heavyButtons
              )}
            </>
          )}

          <button
            type="button"
            title={mode === "markdown" ? "Back to rich text" : "Edit raw Markdown"}
            aria-pressed={mode === "markdown"}
            onClick={() => switchMode(mode === "markdown" ? "wysiwyg" : "markdown")}
            className={cx(
              "ml-auto inline-flex h-7 items-center rounded-md px-1.5 font-mono text-[11px] font-semibold transition-colors",
              "hover:bg-zinc-200/70 dark:hover:bg-zinc-800",
              mode === "markdown"
                ? "bg-blue-600/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            MD
          </button>
        </div>

        {mode === "markdown" ? (
          <textarea
            value={value}
            aria-label={`${ariaLabel} (Markdown source)`}
            placeholder={placeholder}
            onChange={(e) => {
              lastMarkdownRef.current = e.target.value;
              onChangeRef.current(e.target.value);
            }}
            className={cx(
              "w-full resize-y bg-transparent px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none dark:text-zinc-100",
              MIN_HEIGHT[variant]
            )}
          />
        ) : (
          <EditorContent editor={editor} className={cx("px-4 py-3", compact ? "text-sm" : "")} />
        )}

        <MediaPicker open={picking} onClose={() => setPicking(false)} onPick={pickImage} />
      </div>
    );
  }
);
