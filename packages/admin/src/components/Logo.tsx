import { cx } from "./ui";

/** The agentpress wordmark: a rounded square mark with a blue "a" plus the name. */
export function Logo({ size = "md", className = "" }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex items-center justify-center rounded-lg bg-blue-600 font-semibold leading-none text-white",
          size === "sm" ? "h-6 w-6 text-sm" : "h-7 w-7 text-base"
        )}
      >
        a
      </span>
      <span className={cx("font-semibold tracking-tight", size === "sm" ? "text-sm" : "text-base")}>agentpress</span>
    </span>
  );
}
