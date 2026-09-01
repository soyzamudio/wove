import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react";
import { AgentpressError } from "../api";

export function errorMessage(err: unknown): string {
  if (err instanceof AgentpressError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function Spinner() {
  return <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {message}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  scheduled: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (STATUS_STYLES[status] ?? STATUS_STYLES.draft)}>
      {status}
    </span>
  );
}

export function ActorBadge({ kind }: { kind: string }) {
  const styles: Record<string, string> = {
    user: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
    agent: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
    anon: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  const label = kind === "user" ? "human" : kind;
  return <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + (styles[kind] ?? styles.anon)}>{label}</span>;
}

export function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {channel}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles: Record<string, string> = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
    secondary:
      "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      className={
        "rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 " +
        styles[variant] +
        " " +
        className
      }
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 " +
        (props.className ?? "")
      }
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{children}</label>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={"rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 " + className}>
      {children}
    </div>
  );
}
