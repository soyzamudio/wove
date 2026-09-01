import { useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Mail, Plus, Users as UsersIcon } from "lucide-react";
import { UserRole, type Invite } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../lib/roles";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Spinner,
  type BadgeTone,
  errorMessage,
} from "../components/ui";

const ROLES = UserRole.options;

const ROLE_TONES: Record<UserRole, BadgeTone> = {
  admin: "violet",
  editor: "blue",
  author: "green",
  contributor: "neutral",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function expiryLabel(invite: Invite): string {
  const expires = new Date(invite.expiresAt).getTime();
  if (Number.isNaN(expires)) return "—";
  return expires < Date.now() ? "expired" : `expires ${relativeTime(invite.expiresAt)}`;
}

export function Users() {
  const users = useToolQuery("user.list", {});
  const invites = useToolQuery("user.invites", {});
  const invalidate = useInvalidateTool();
  const toast = useToast();
  const { user: me } = useAuth();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("editor");
  const [result, setResult] = useState<{ acceptUrl: string; emailSent: boolean; email: string } | null>(null);

  const invite = useToolMutation("user.invite", {
    onSuccess: (res) => {
      setResult({ acceptUrl: res.acceptUrl, emailSent: res.emailSent, email: res.invite.email });
      setEmail("");
      invalidate("user.invites");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const updateRole = useToolMutation("user.updateRole", {
    onSuccess: (updated) => {
      toast.success(`${updated.name || updated.email} is now ${ROLE_LABELS[updated.role].toLowerCase()}`);
      invalidate("user.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useToolMutation("user.remove", {
    onSuccess: () => {
      toast.success("User removed");
      invalidate("user.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const revoke = useToolMutation("user.revokeInvite", {
    onSuccess: () => {
      toast.success("Invite revoked");
      invalidate("user.invites");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Invite link copied");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function closeInvite() {
    setInviteOpen(false);
    setResult(null);
    setEmail("");
    setRole("editor");
  }

  const pending = invites.data ?? [];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Who can sign in to this site, and what they can do"
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Invite
          </Button>
        }
      />

      <Modal
        open={inviteOpen}
        onClose={closeInvite}
        title={result ? "Invite created" : "Invite a user"}
        footer={
          result ? (
            <Button variant="primary" onClick={closeInvite}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={closeInvite} disabled={invite.isPending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={invite.isPending || email.trim().length === 0}
                onClick={() => invite.mutate({ email: email.trim(), role })}
              >
                {invite.isPending ? "Inviting…" : "Send invite"}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {result.emailSent ? (
                <>
                  Email sent to <span className="font-medium text-zinc-900 dark:text-zinc-100">{result.email}</span>.
                  You can also share the link directly.
                </>
              ) : (
                <>
                  Email is not configured — share this link with{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{result.email}</span> yourself.
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-900">
                {result.acceptUrl}
              </code>
              <Button variant="secondary" onClick={() => copy(result.acceptUrl)}>
                Copy
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}
                  </option>
                ))}
              </Select>
              <ul className="mt-2 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {ROLES.map((r) => (
                  <li key={r}>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{ROLE_LABELS[r]}</span>:{" "}
                    {ROLE_DESCRIPTIONS[r]}
                  </li>
                ))}
              </ul>
            </div>
            {invite.isError && <ErrorBanner message={errorMessage(invite.error)} />}
          </div>
        )}
      </Modal>

      <div className="space-y-6">
        {users.isLoading && <Spinner />}
        {users.isError && <ErrorBanner message={errorMessage(users.error)} />}

        {users.data && (
          <Card className="overflow-hidden p-0">
            {users.data.length === 0 ? (
              <EmptyState
                icon={<UsersIcon className="h-5 w-5" />}
                title="No users yet"
                description="Invite a teammate to give them access to this site."
                action={
                  <Button variant="primary" onClick={() => setInviteOpen(true)}>
                    Invite
                  </Button>
                }
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Joined</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((u) => {
                    const isMe = u.id === me?.id;
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={u.name || u.email} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                                {u.name || "(no name)"}
                                {isMe && <span className="ml-1.5 text-xs font-normal text-zinc-400">you</span>}
                              </div>
                              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {isMe ? (
                            <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                          ) : (
                            <Select
                              aria-label={`Role for ${u.email}`}
                              className="w-40"
                              value={u.role}
                              disabled={updateRole.isPending}
                              onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value as UserRole })}
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </Select>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {isMe ? (
                            <Link
                              to="/profile"
                              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Edit profile
                            </Link>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={remove.isPending}
                              onClick={() => {
                                if (window.confirm(`Remove ${u.email}? Their posts stay, attributed to their id.`)) {
                                  remove.mutate({ id: u.id });
                                }
                              }}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        )}

        <div>
          <Card className="overflow-hidden p-0">
            <div className="px-4 pt-4">
              <CardHeader title="Pending invites" />
            </div>
            {invites.isLoading && (
              <div className="px-4">
                <Spinner />
              </div>
            )}
            {invites.isError && (
              <div className="px-4 pb-4">
                <ErrorBanner message={errorMessage(invites.error)} />
              </div>
            )}
            {invites.data &&
              (pending.length === 0 ? (
                <EmptyState
                  icon={<Mail className="h-5 w-5" />}
                  title="No pending invites"
                  description="Invites appear here until they're accepted, revoked or expired."
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-t border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <th className="px-4 py-2.5 font-medium">Email</th>
                      <th className="px-4 py-2.5 font-medium">Role</th>
                      <th className="px-4 py-2.5 font-medium">Expires</th>
                      <th className="px-4 py-2.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80"
                      >
                        <td className="px-4 py-2.5 font-medium">{inv.email}</td>
                        <td className="px-4 py-2.5">
                          <Badge tone={ROLE_TONES[inv.role]}>{ROLE_LABELS[inv.role]}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {expiryLabel(inv)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() => {
                              if (window.confirm(`Revoke the invite for ${inv.email}?`)) revoke.mutate({ id: inv.id });
                            }}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </Card>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Invite links are only shown once, when the invite is created — they can't be retrieved later. Revoke and
            re-invite if a link is lost.
          </p>
        </div>
      </div>
    </div>
  );
}
