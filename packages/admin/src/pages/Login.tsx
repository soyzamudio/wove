import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiLogin, apiMe } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, ErrorBanner, Input, Label, errorMessage } from "../components/ui";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsSetup(false);
    setSubmitting(true);
    try {
      await apiLogin({ email, password });
      await refresh();
      toast.success("Welcome back");
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      // A failed login combined with no active session may mean no admin exists yet.
      try {
        const me = await apiMe();
        if (!me) setNeedsSetup(true);
      } catch {
        setNeedsSetup(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Log in</h1>
        {error && (
          <ErrorBanner
            message={needsSetup ? `${error} — no admin account may exist yet.` : error}
          />
        )}
        {needsSetup && (
          <p className="text-sm">
            <Link to="/setup" className="font-medium underline">
              Set up the first admin account →
            </Link>
          </p>
        )}
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" disabled={submitting} className="w-full justify-center">
          {submitting ? "Signing in…" : "Log in"}
        </Button>
      </form>
    </div>
  );
}
