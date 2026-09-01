import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiSetup } from "../api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, ErrorBanner, Input, Label } from "../components/ui";
import { errorMessage } from "../components/ui";

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
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Create the first admin account</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">This runs once, before anyone else can sign in.</p>
        </div>
        {error && <ErrorBanner message={error} />}
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        <Button type="submit" disabled={submitting} className="w-full justify-center">
          {submitting ? "Creating…" : "Create admin account"}
        </Button>
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Already set up? <Link to="/login" className="underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}
