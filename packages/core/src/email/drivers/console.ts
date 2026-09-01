import type { EmailDriver } from "../index";

/** First http(s) URL in the plain-text body — the thing a developer actually needs. */
export function actionUrl(text: string): string | null {
  return text.match(/https?:\/\/\S+/)?.[0]?.replace(/[).,]+$/, "") ?? null;
}

const line = (w: number) => "─".repeat(w);

/**
 * The zero-config driver: prints a boxed summary so invite/reset links are one glance away
 * in `bun run dev` output. Never throws.
 */
export function consoleDriver(log: (s: string) => void = console.log): EmailDriver {
  return {
    name: "console",
    async send(msg) {
      const url = actionUrl(msg.text);
      const rows = [
        `to      ${msg.to}`,
        `from    ${msg.from}`,
        `subject ${msg.subject}`,
        ...(url ? [`link    ${url}`] : []),
      ];
      const width = Math.max(46, ...rows.map((r) => r.length)) + 2;
      log(
        [
          `┌${line(width)}┐`,
          `│ ${"email (console driver — not delivered)".padEnd(width - 2)} │`,
          `├${line(width)}┤`,
          ...rows.map((r) => `│ ${r.padEnd(width - 2)} │`),
          `└${line(width)}┘`,
        ].join("\n"),
      );
    },
  };
}
