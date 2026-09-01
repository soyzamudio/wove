import { useEffect, useState } from "react";
import { useToolMutation } from "../api";
import { validatePassword } from "../lib/password";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../lib/roles";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  Spinner,
  errorMessage,
} from "../components/ui";

export function Profile() {
  const { user, loading, refresh } = useAuth();
  const toast = useToast();

  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  const saveName = useToolMutation("user.updateProfile", {
    onSuccess: async () => {
      toast.success("Profile saved");
      await refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const savePassword = useToolMutation("user.updateProfile", {
    onSuccess: () => {
      toast.success("Password changed");
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (loading) return <Spinner />;
  if (!user) return <ErrorBanner message="Not signed in." />;

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    saveName.mutate({ name: name.trim() });
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = validatePassword(password, confirm);
    if (problem) {
      setPasswordError(problem);
      return;
    }
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    setPasswordError(null);
    savePassword.mutate({ password, currentPassword });
  }

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account on this site" />

      <div className="max-w-xl space-y-6">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={user.name || user.email} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{user.name || "(no name)"}</div>
              <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">{user.email}</div>
            </div>
            <div className="ml-auto text-right">
              <Badge tone="violet">{ROLE_LABELS[user.role]}</Badge>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{ROLE_DESCRIPTIONS[user.role]}</div>
            </div>
          </div>
          <form onSubmit={submitName} className="space-y-3">
            <div>
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={user.email} disabled readOnly />
            </div>
            <div>
              <Label htmlFor="profile-role">Role</Label>
              <Input id="profile-role" value={ROLE_LABELS[user.role]} disabled readOnly />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Only an admin can change your role.
              </p>
            </div>
            <Button type="submit" variant="primary" disabled={saveName.isPending}>
              {saveName.isPending ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Change password" />
          <form onSubmit={submitPassword} className="space-y-3">
            {passwordError && <ErrorBanner message={passwordError} />}
            <div>
              <Label htmlFor="profile-current">Current password</Label>
              <Input
                id="profile-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="profile-new">New password</Label>
              <Input
                id="profile-new"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div>
              <Label htmlFor="profile-confirm">Confirm new password</Label>
              <Input
                id="profile-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <Button type="submit" variant="primary" disabled={savePassword.isPending}>
              {savePassword.isPending ? "Changing…" : "Change password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
