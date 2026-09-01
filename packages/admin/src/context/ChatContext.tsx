import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatMessage, ChatToolCall, ChatThread } from "@wove/sdk";
import { client, streamChat } from "../api";
import { planSummary } from "../lib/chat";
import { errorMessage } from "../components/ui";
import { useToast } from "./ToastContext";

/** Tool caches that a chat-applied mutation can invalidate. */
const INVALIDATE_AFTER_APPLY = ["post.list", "menu.list", "site.info", "design.get"] as const;

export interface ChatState {
  open: boolean;
  threadId: string | null;
  title: string;
  messages: ChatMessage[];
  /** Tokens streamed so far for the in-flight assistant reply. */
  streamText: string;
  /** Tool calls announced during the in-flight reply, in arrival order. */
  streamCalls: ChatToolCall[];
  streaming: boolean;
  loadingThread: boolean;
  /** Setup/stream failure for the last turn, shown inline above the composer. */
  error: string | null;
  applyingMessageId: string | null;
}

export interface ChatContextValue extends ChatState {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  send: (text: string) => void;
  stop: () => void;
  newThread: () => void;
  openThread: (id: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  applyPlan: (messageId: string, callIds: string[]) => Promise<void>;
  discardPlan: (messageId: string) => Promise<void>;
  dismissError: () => void;
}

const ChatCtx = createContext<ChatContextValue | null>(null);

const EMPTY: Pick<ChatState, "threadId" | "title" | "messages" | "streamText" | "streamCalls" | "error"> = {
  threadId: null,
  title: "New chat",
  messages: [],
  streamText: "",
  streamCalls: [],
  error: null,
};

function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Conversation state for the site-chat slide-over. Mounted in Layout so the
 * thread survives route changes and open/close within the session.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ChatState>({ ...EMPTY, open: false, streaming: false, loadingThread: false, applyingMessageId: null });
  const abortRef = useRef<AbortController | null>(null);
  // Guards against a stale stream (user switched threads mid-flight) writing back.
  const runRef = useRef(0);
  // Mirror of state.threadId: setState updaters don't run synchronously, so the
  // stream call needs the current thread id without waiting for a re-render.
  const threadIdRef = useRef<string | null>(null);

  useEffect(() => {
    threadIdRef.current = state.threadId;
  }, [state.threadId]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const patch = useCallback((p: Partial<ChatState>) => setState((s) => ({ ...s, ...p })), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runRef.current++;
    setState((s) => {
      if (!s.streaming) return s;
      // Keep whatever streamed in as a local assistant message so the transcript
      // doesn't just lose the partial answer.
      const partial: ChatMessage[] =
        s.streamText.trim() || s.streamCalls.length
          ? [
              {
                id: localId("local"),
                role: "assistant",
                content: s.streamText,
                toolCalls: s.streamCalls,
                planPending: false,
                usage: null,
                ts: new Date().toISOString(),
              },
            ]
          : [];
      return { ...s, streaming: false, streamText: "", streamCalls: [], messages: [...s.messages, ...partial] };
    });
  }, []);

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const run = ++runRef.current;
      const alive = () => runRef.current === run;

      const userMessage: ChatMessage = {
        id: localId("user"),
        role: "user",
        content: message,
        toolCalls: [],
        planPending: false,
        usage: null,
        ts: new Date().toISOString(),
      };

      const threadIdForCall = threadIdRef.current ?? undefined;
      setState((s) => ({ ...s, messages: [...s.messages, userMessage], streaming: true, streamText: "", streamCalls: [], error: null }));

      streamChat(
        { threadId: threadIdForCall, message },
        {
          onThread: (info) => {
            if (!alive()) return;
            threadIdRef.current = info.threadId;
            patch({ threadId: info.threadId, title: info.title || "New chat" });
            qc.invalidateQueries({ queryKey: ["chat.threads"] });
          },
          onToken: (t) => {
            if (!alive()) return;
            setState((s) => ({ ...s, streamText: s.streamText + t }));
          },
          onToolCall: (call) => {
            if (!alive()) return;
            setState((s) => {
              const idx = s.streamCalls.findIndex((c) => c.id === call.id);
              const next = idx >= 0 ? s.streamCalls.map((c) => (c.id === call.id ? call : c)) : [...s.streamCalls, call];
              return { ...s, streamCalls: next };
            });
          },
          onMessage: (msg) => {
            if (!alive()) return;
            setState((s) => ({ ...s, messages: [...s.messages, msg], streamText: "", streamCalls: [] }));
          },
          onDone: () => {
            if (!alive()) return;
            setState((s) => ({ ...s, streaming: false, streamText: "", streamCalls: [] }));
            qc.invalidateQueries({ queryKey: ["chat.threads"] });
          },
          onError: (err) => {
            if (!alive()) return;
            setState((s) => ({ ...s, streaming: false, error: err.message || err.code }));
          },
        },
        controller.signal
      ).finally(() => {
        if (!alive()) return;
        setState((s) => (s.streaming ? { ...s, streaming: false } : s));
      });
    },
    [patch, qc]
  );

  const newThread = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runRef.current++;
    threadIdRef.current = null;
    setState((s) => ({ ...s, ...EMPTY, streaming: false, loadingThread: false, applyingMessageId: null }));
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      abortRef.current = null;
      runRef.current++;
      patch({ loadingThread: true, error: null, streaming: false, streamText: "", streamCalls: [] });
      try {
        const res = await client.call("chat.get", { id });
        threadIdRef.current = res.thread.id;
        setState((s) => ({
          ...s,
          threadId: res.thread.id,
          title: res.thread.title,
          messages: res.messages,
          loadingThread: false,
        }));
      } catch (err) {
        patch({ loadingThread: false, error: errorMessage(err) });
      }
    },
    [patch]
  );

  const deleteThread = useCallback(
    async (id: string) => {
      try {
        await client.call("chat.delete", { id });
        qc.invalidateQueries({ queryKey: ["chat.threads"] });
        toast.success("Thread deleted");
        if (threadIdRef.current === id) threadIdRef.current = null;
        setState((s) => (s.threadId === id ? { ...s, ...EMPTY, streaming: false, applyingMessageId: null } : s));
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [qc, toast]
  );

  const replaceMessage = useCallback((updated: ChatMessage) => {
    setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === updated.id ? updated : m)) }));
  }, []);

  const invalidateSiteCaches = useCallback(() => {
    for (const name of INVALIDATE_AFTER_APPLY) qc.invalidateQueries({ queryKey: [name] });
  }, [qc]);

  const applyPlan = useCallback(
    async (messageId: string, callIds: string[]) => {
      const threadId = threadIdRef.current;
      if (!threadId || callIds.length === 0) return;
      patch({ applyingMessageId: messageId });
      try {
        const updated = await client.call("chat.apply", { threadId, messageId, approve: callIds });
        replaceMessage(updated);
        invalidateSiteCaches();
        const summary = planSummary(updated.toolCalls);
        if (updated.toolCalls.some((c) => c.status === "failed")) toast.push("error", summary);
        else toast.success(summary);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        patch({ applyingMessageId: null });
      }
    },
    [patch, replaceMessage, invalidateSiteCaches, toast]
  );

  const discardPlan = useCallback(
    async (messageId: string) => {
      const threadId = threadIdRef.current;
      if (!threadId) return;
      patch({ applyingMessageId: messageId });
      try {
        const updated = await client.call("chat.discard", { threadId, messageId });
        replaceMessage(updated);
        toast.success("Plan discarded");
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        patch({ applyingMessageId: null });
      }
    },
    [patch, replaceMessage, toast]
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      ...state,
      open,
      setOpen,
      toggle: () => setOpen((v) => !v),
      send,
      stop,
      newThread,
      openThread,
      deleteThread,
      applyPlan,
      discardPlan,
      dismissError: () => patch({ error: null }),
    }),
    [state, open, send, stop, newThread, openThread, deleteThread, applyPlan, discardPlan, patch]
  );

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}

export type { ChatThread };
