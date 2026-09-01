import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiResetPassword } from "../api";
import { validatePassword } from "../lib/password";
import { AuthCard } from "../components/AuthCard";
import { Button, ErrorBanner, Input, Label, errorMessage } from "../components/ui";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validatePassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiResetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const loginLink = (
    <Link to="/login" className="font-medium text-white/80 underline">
      Back to log in
    </Link>
  );

  if (done) {
    return (
      <AuthCard title="Password updated" footer={loginLink}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Your password has been changed.</p>
        <Link to="/login" className="block">
          <Button className="w-full">Log in</Button>
        </Link>
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard title="This reset link is invalid" footer={loginLink}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The link is missing its token. Request a new one from the{" "}
          <Link to="/forgot-password" className="font-medium text-blue-600 underline dark:text-blue-400">
            forgot password
          </Link>{" "}
          page.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" onSubmit={handleSubmit} footer={loginLink}>
      {error && <ErrorBanner message={error} />}
      <div>
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
        />
      </div>
      <div>
        <Label htmlFor="reset-confirm">Confirm password</Label>
        <Input
          id="reset-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Saving…" : "Reset password"}
      </Button>
    </AuthCard>
  );
}
