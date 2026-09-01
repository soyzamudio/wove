import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** The shared shell for the public auth pages (login, invite, forgot/reset). */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
}) {
  const body = (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </>
  );
  return (
    <div className="wv-auth-hero flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex justify-center text-white">
          <Logo />
        </div>
        {onSubmit ? (
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            {body}
          </form>
        ) : (
          <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            {body}
          </div>
        )}
        {footer && <div className="mt-4 text-center text-sm text-zinc-300">{footer}</div>}
      </div>
    </div>
  );
}
