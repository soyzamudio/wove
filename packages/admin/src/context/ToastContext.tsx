import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  push: (kind: Toast["kind"], message: string, action?: ToastAction) => void;
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((kind: Toast["kind"], message: string, action?: ToastAction) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, message, action }]);
    // Give an actionable toast (e.g. "Undo") longer to be clicked.
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, action ? 9000 : 4000);
  }, []);

  const value: ToastContextValue = {
    push,
    success: (message: string, action?: ToastAction) => push("success", message, action),
    error: (message: string) => push("error", message),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "flex items-center rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-black/10 " +
              (t.kind === "success" ? "bg-emerald-600" : t.kind === "error" ? "bg-red-600" : "bg-zinc-800")
            }
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="ml-3 rounded px-1.5 py-0.5 text-sm font-semibold underline underline-offset-2 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
