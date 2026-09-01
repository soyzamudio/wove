import { useState } from "react";
import { Mail } from "lucide-react";
import { useToolMutation, useToolQuery } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Badge, Button, Card, CardHeader, ErrorBanner, Input, Label, Spinner, errorMessage } from "./ui";

const DRIVER_TONES = { console: "amber", smtp: "green", resend: "green" } as const;

/** Which email driver core is using, plus a one-shot test send. */
export function EmailStatusCard() {
  const status = useToolQuery("email.status", {});
  const { can } = useAuth();
  const toast = useToast();
  const [to, setTo] = useState("");

  const test = useToolMutation("email.test", {
    onSuccess: () => toast.success(`Test email sent to ${to}`),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const canSend = can(["settings:write"]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            Email
          </span>
        }
        action={
          status.data ? <Badge tone={DRIVER_TONES[status.data.driver] ?? "neutral"}>{status.data.driver}</Badge> : null
        }
      />

      {status.isLoading && <Spinner />}
      {status.isError && <ErrorBanner message={errorMessage(status.error)} />}

      {status.data && (
        <div className="space-y-3">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Sending from <span className="font-medium text-zinc-900 dark:text-zinc-100">{status.data.from}</span>
          </div>

          {!status.data.configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200">
              No email driver is configured — emails are only logged to the server console. Invite and password-reset
              links must be shared manually.
            </div>
          )}

          <form
            className="flex items-end gap-2"
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
                disabled={!canSend}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={!canSend || test.isPending || !to.trim()}>
              {test.isPending ? "Sending…" : "Send"}
            </Button>
          </form>
          {!canSend && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              You need the settings:write scope to send a test email.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
