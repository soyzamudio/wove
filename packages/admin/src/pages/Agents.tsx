import { useState } from "react";
import { Bot, KeyRound, Plus } from "lucide-react";
import { Scope, type Agent as AgentType } from "@wove/sdk";
import { API_URL, resolveApiOrigin, useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { useToast } from "../context/ToastContext";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  Spinner,
  cx,
  errorMessage,
} from "../components/ui";

const SCOPES = Scope.options;

function mcpSnippet(apiKey: string): string {
  const origin = resolveApiOrigin(API_URL, typeof window !== "undefined" ? window.location.origin : undefined);
  return JSON.stringify(
    {
      mcpServers: {
        wove: {
          url: `${origin}/mcp`,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2
  );
}

export function Agents() {
  const list = useToolQuery("agent.list", {});
  const invalidate = useInvalidateTool();
  const toast = useToast();

  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>([]);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [created, setCreated] = useState<(AgentType & { apiKey: string }) | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const create = useToolMutation("agent.create", {
    onSuccess: (agent) => {
      toast.success(`Agent "${agent.name}" created`);
      invalidate("agent.list");
      setCreated(agent);
      setName("");
      setSelectedScopes([]);
      setFormOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const revoke = useToolMutation("agent.revoke", {
    onSuccess: () => {
      toast.success("Agent revoked");
      invalidate("agent.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function toggleScope(scope: Scope) {
    setSelectedScopes((cur) => (cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (selectedScopes.length === 0) {
      setScopeError("Select at least one scope");
      return;
    }
    setScopeError(null);
    create.mutate({ name: name.trim(), scopes: selectedScopes });
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="API keys that let agents work on this site over MCP"
        actions={
          <Button variant="primary" onClick={() => setFormOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New agent
          </Button>
        }
      />

      <div className="space-y-6">
        {created && (
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-200">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              This key is shown once and cannot be retrieved again — copy it now.
            </div>
            <div className="mb-3 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs dark:bg-zinc-950">
                {created.apiKey}
              </code>
              <Button variant="secondary" onClick={() => copy(created.apiKey, "API key")}>
                Copy
              </Button>
            </div>
            <div className="mb-1 text-sm font-medium">MCP config</div>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-zinc-950">
                {mcpSnippet(created.apiKey)}
              </pre>
              <Button variant="secondary" onClick={() => copy(mcpSnippet(created.apiKey), "MCP config")}>
                Copy
              </Button>
            </div>
          </Card>
        )}

        {formOpen && (
          <Card>
            <CardHeader title="Create agent" />
            <form onSubmit={submit} className="space-y-4">
              <div className="max-w-sm">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. content-bot"
                />
              </div>
              <div>
                <Label>Scopes</Label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {SCOPES.map((scope) => {
                    const checked = selectedScopes.includes(scope);
                    return (
                      <label
                        key={scope}
                        className={cx(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                          checked
                            ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                            : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={checked}
                          onChange={() => toggleScope(scope)}
                        />
                        <span className="truncate font-mono text-xs">{scope}</span>
                      </label>
                    );
                  })}
                </div>
                {scopeError && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{scopeError}</div>}
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={create.isPending}>
                  {create.isPending ? "Creating…" : "Create agent"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {list.isLoading && <Spinner />}
        {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

        {list.data && (
          <Card className="overflow-hidden p-0">
            {list.data.length === 0 ? (
              <EmptyState
                icon={<Bot className="h-5 w-5" />}
                title="No agents yet"
                description="Create an agent to give an AI assistant scoped access to this site."
                action={
                  <Button variant="primary" onClick={() => setFormOpen(true)}>
                    New agent
                  </Button>
                }
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Scopes</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium">Last used</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900"
                    >
                      <td className="px-4 py-2.5 font-semibold">{agent.name}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {agent.scopes.map((scope) => (
                            <Badge key={scope} mono>
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{relativeTime(agent.createdAt)}</td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">
                        {agent.lastUsedAt ? relativeTime(agent.lastUsedAt) : "never"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => {
                            if (window.confirm(`Revoke agent "${agent.name}"?`)) {
                              revoke.mutate({ id: agent.id });
                            }
                          }}
                        >
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
