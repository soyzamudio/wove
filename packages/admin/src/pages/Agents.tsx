import { useState } from "react";
import { Scope, type Agent as AgentType } from "@agentpress/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Input, Label, Spinner, errorMessage } from "../components/ui";

const SCOPES = Scope.options;

function mcpSnippet(apiKey: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        agentpress: {
          url: "http://localhost:4000/mcp",
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

  const create = useToolMutation("agent.create", {
    onSuccess: (agent) => {
      toast.success(`Agent "${agent.name}" created`);
      invalidate("agent.list");
      setCreated(agent);
      setName("");
      setSelectedScopes([]);
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Agents</h1>

      {created && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <div className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            This key is shown once and cannot be retrieved again — copy it now.
          </div>
          <div className="mb-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-white px-3 py-2 text-xs dark:bg-zinc-900">
              {created.apiKey}
            </code>
            <Button variant="secondary" onClick={() => copy(created.apiKey, "API key")}>
              Copy
            </Button>
          </div>
          <div className="mb-1 text-sm font-medium">MCP config</div>
          <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded-md bg-white p-3 text-xs dark:bg-zinc-900">
              {mcpSnippet(created.apiKey)}
            </pre>
            <Button variant="secondary" onClick={() => copy(mcpSnippet(created.apiKey), "MCP config")}>
              Copy
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Create agent</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. content-bot" />
          </div>
          <div>
            <Label>Scopes</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  <span className="font-mono text-xs">{scope}</span>
                </label>
              ))}
            </div>
            {scopeError && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{scopeError}</div>}
          </div>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create agent"}
          </Button>
        </form>
      </Card>

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Scopes</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Last used</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {list.data.map((agent) => (
                <tr key={agent.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium">{agent.name}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {agent.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{relativeTime(agent.createdAt)}</td>
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                    {agent.lastUsedAt ? relativeTime(agent.lastUsedAt) : "never"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="danger"
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
              {list.data.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400" colSpan={5}>
                    No agents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
