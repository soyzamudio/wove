import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiSetup } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Logo } from "../components/Logo";
import { Button, ErrorBanner, Input, Label, errorMessage } from "../components/ui";

export function Setup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiSetup({ name, email, password });
      await refresh();
      toast.success("Admin account created");
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ap-hero flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex justify-center text-white">
          <Logo />
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Create the first admin account
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              This runs once, before anyone else can sign in.
            </p>
          </div>
          {error && <ErrorBanner message={error} />}
          <div>
            <Label htmlFor="setup-name">Name</Label>
            <Input id="setup-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label htmlFor="setup-email">Email</Label>
            <Input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="setup-password">Password</Label>
            <Input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating…" : "Create admin account"}
          </Button>
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            Already set up?{" "}
            <Link to="/login" className="text-blue-600 underline dark:text-blue-400">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
