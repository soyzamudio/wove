import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiLogin, apiMe } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Logo } from "../components/Logo";
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
    <div className="wv-auth-hero flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex justify-center text-white">
          <Logo />
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Log in</h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Sign in to your Wove site.</p>
          </div>
          {error && <ErrorBanner message={needsSetup ? `${error} — no admin account may exist yet.` : error} />}
          {needsSetup && (
            <p className="text-sm">
              <Link to="/setup" className="font-medium text-blue-600 underline dark:text-blue-400">
                Set up the first admin account →
              </Link>
            </p>
          )}
          <div>
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Log in"}
          </Button>
          <p className="text-center text-sm">
            <Link to="/forgot-password" className="text-zinc-500 hover:underline dark:text-zinc-400">
              Forgot password?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
