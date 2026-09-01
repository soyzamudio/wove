import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { emailFormDiff, type EmailForm, type EmailStatus } from "../lib/emailForm";
import { Badge, Button, Card, CardHeader, ErrorBanner, Input, Label, Select, Spinner, errorMessage } from "./ui";

const DRIVER_TONES = { console: "amber", smtp: "green", resend: "green" } as const;

const DRIVERS: { value: EmailStatus["driver"]; label: string; hint: string }[] = [
  { value: "console", label: "Console", hint: "Nothing is delivered — messages are logged to the server console." },
  { value: "smtp", label: "SMTP", hint: "Any SMTP provider, configured with one connection URL." },
  { value: "resend", label: "Resend", hint: "Resend's API — paste an API key from resend.com." },
];

const SECRET_LABEL = { smtp: "SMTP URL", resend: "API key" } as const;
const SECRET_PLACEHOLDER = { smtp: "smtp://user:pass@host:587", resend: "re_…" } as const;

const SOURCE_LABEL: Record<EmailStatus["source"], string> = {
  dashboard: "dashboard",
  env: "env",
  none: "fallback",
};

/** Email configuration (driver, from, secret) plus a one-shot test send. */
export function EmailStatusCard() {
  const status = useToolQuery("email.status", {});
  const invalidate = useInvalidateTool();
  const { can } = useAuth();
  const toast = useToast();
  const [to, setTo] = useState("");
  const [form, setForm] = useState<EmailForm>({ driver: "console", from: "", secret: "" });

  useEffect(() => {
    if (status.data) setForm({ driver: status.data.driver, from: status.data.from, secret: "" });
  }, [status.data]);

  const save = useToolMutation("email.configure", {
    onSuccess: (updated) => {
      toast.success("Email settings saved");
      setForm({ driver: updated.driver, from: updated.from, secret: "" });
      invalidate("email.status");
    },
  });

  const removeSecret = useToolMutation("email.configure", {
    onSuccess: () => {
      toast.success("Email secret removed");
      invalidate("email.status");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const test = useToolMutation("email.test", {
    onSuccess: () => toast.success(`Test email sent to ${to}`),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const canWrite = can(["settings:write"]);
  const needsSecret = form.driver !== "console";
  const data = status.data;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const patch = emailFormDiff(data, form);
    if (Object.keys(patch).length === 0) {
      toast.success("Nothing to save");
      return;
    }
    save.mutate(patch);
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            Email
          </span>
        }
        action={data ? <Badge tone={DRIVER_TONES[data.driver] ?? "neutral"}>{data.driver}</Badge> : null}
      />

      {status.isLoading && <Spinner />}
      {status.isError && <ErrorBanner message={errorMessage(status.error)} />}

      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              Active: <span className="font-medium text-zinc-900 dark:text-zinc-100">{data.driver}</span> via{" "}
              {SOURCE_LABEL[data.source]}
            </span>
            {data.secretHint && <Badge tone="neutral">Secret {data.secretHint}</Badge>}
          </div>

          {!data.configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200">
              No email driver is configured — emails are only logged to the server console. Invite and password-reset
              links must be shared manually.
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="email-driver">Driver</Label>
              <Select
                id="email-driver"
                value={form.driver}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value as EmailStatus["driver"] }))}
              >
                {DRIVERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {DRIVERS.find((d) => d.value === form.driver)?.hint}
              </p>
            </div>

            <div>
              <Label htmlFor="email-from">From</Label>
              <Input
                id="email-from"
                value={form.from}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                placeholder="Wove <no-reply@example.com>"
              />
            </div>

            {needsSecret && (
              <div>
                <Label htmlFor="email-secret">{SECRET_LABEL[form.driver as "smtp" | "resend"]}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="email-secret"
                    type="password"
                    autoComplete="off"
                    value={form.secret}
                    disabled={!canWrite}
                    onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                    placeholder={SECRET_PLACEHOLDER[form.driver as "smtp" | "resend"]}
                  />
                  {data.source === "dashboard" && (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!canWrite || removeSecret.isPending}
                      onClick={() => {
                        if (window.confirm("Remove the stored email secret? Email falls back to the server env vars.")) {
                          removeSecret.mutate({ clearSecret: true, driver: "console" });
                        }
                      }}
                    >
                      {removeSecret.isPending ? "Removing…" : "Remove secret"}
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {data.secretHint
                    ? `Stored on the server (${data.secretHint}) — leave blank to keep it.`
                    : "Stored encrypted on the server; it is never shown again."}
                </p>
              </div>
            )}

            {save.isError && <ErrorBanner message={errorMessage(save.error)} />}

            <Button type="submit" variant="primary" disabled={!canWrite || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </form>

          <form
            className="flex items-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
            onSubmit={(e) => {
              e.preventDefault();
              if (to.trim()) test.mutate({ to: to.trim() });
            }}
          >
            <div className="flex-1">
              <Label htmlFor="email-test-to">Send test email</Label>
              <Input
                id="email-test-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="you@example.com"
                disabled={!canWrite}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={!canWrite || test.isPending || !to.trim()}>
              {test.isPending ? "Sending…" : "Send"}
            </Button>
          </form>

          {!canWrite && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              You need the settings:write scope to change email settings or send a test email.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
