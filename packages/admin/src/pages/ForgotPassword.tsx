import { useState } from "react";
import { Link } from "react-router-dom";
import { apiForgotPassword } from "../api";
import { AuthCard } from "../components/AuthCard";
import { Button, ErrorBanner, Input, Label, errorMessage } from "../components/ui";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiForgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const backToLogin = (
    <Link to="/login" className="font-medium text-white/80 underline">
      Back to log in
    </Link>
  );

  if (sent) {
    return (
      <AuthCard title="Check your email" footer={backToLogin}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          If that account exists, we sent a link to reset its password. The link expires shortly, so use it soon.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot password"
      subtitle="We'll email you a link to set a new one."
      onSubmit={handleSubmit}
      footer={backToLogin}
    >
      {error && <ErrorBanner message={error} />}
      <div>
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Sending…" : "Send reset link"}
      </Button>
    </AuthCard>
  );
}
