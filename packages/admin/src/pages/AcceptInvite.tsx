import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiAcceptInvite } from "../api";
import { validatePassword } from "../lib/password";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { AuthCard } from "../components/AuthCard";
import { Button, ErrorBanner, Input, Label, errorMessage } from "../components/ui";

export function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(!token);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();

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
      await apiAcceptInvite({ token, name: name.trim(), password });
      await refresh();
      toast.success("Welcome to the team");
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setInvalid(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (invalid) {
    return (
      <AuthCard
        title="This invite can't be used"
        subtitle={token ? "The link is invalid or has expired." : "The link is missing its token."}
        footer={
          <Link to="/login" className="font-medium text-white/80 underline">
            Back to log in
          </Link>
        }
      >
        {error && <ErrorBanner message={error} />}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ask an admin of this site for a new invite — invite links expire, and each one can only be used once.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Accept your invite" subtitle="Pick a name and a password to finish setting up your account." onSubmit={handleSubmit}>
      {error && <ErrorBanner message={error} />}
      <div>
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <div>
        <Label htmlFor="invite-password">Password</Label>
        <Input
          id="invite-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <div>
        <Label htmlFor="invite-confirm">Confirm password</Label>
        <Input
          id="invite-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Setting up…" : "Accept invite"}
      </Button>
    </AuthCard>
  );
}
