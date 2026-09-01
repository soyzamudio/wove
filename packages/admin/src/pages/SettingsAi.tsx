import { useEffect, useState } from "react";
import { AiProvider, type AiConfig, type AiConfigureInput } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { relativeTime } from "../lib/time";
import {
  ActorBadge,
  Badge,
  Button,
  Card,
  ChannelBadge,
  ErrorBanner,
  Input,
  Label,
  Select,
  Spinner,
  Textarea,
  errorMessage,
} from "../components/ui";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI (Grok)",
  "openai-compatible": "OpenAI-compatible",
};

const EMPTY: AiConfig = {
  provider: "anthropic",
  model: "",
  baseUrl: null,
  systemPrompt: null,
  keySource: "none",
  keyHint: null,
};

function keySourceLabel(config: AiConfig): string {
  if (config.keySource === "byok") return `Site key …${config.keyHint ?? "????"}`;
  if (config.keySource === "platform") return "Platform key";
  return "No key";
}

export function SettingsAi() {
  const config = useToolQuery("ai.config", {});
  const usage = useToolQuery("ai.usage", { limit: 20 });
  const invalidate = useInvalidateTool();
  const toast = useToast();

  const [form, setForm] = useState<AiConfig>(EMPTY);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<Array<{ id: string; name: string | null }>>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (config.data) setForm(config.data);
  }, [config.data]);

  const save = useToolMutation("ai.configure", {
    onSuccess: (updated) => {
      toast.success("AI settings saved");
      setForm(updated);
      invalidate("ai.config");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const saveKey = useToolMutation("ai.configure", {
    onSuccess: (updated) => {
      toast.success("API key saved");
      setForm(updated);
      setApiKey("");
      invalidate("ai.config");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const removeKey = useToolMutation("ai.configure", {
    onSuccess: (updated) => {
      toast.success("API key removed");
      setForm(updated);
      invalidate("ai.config");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const loadModels = useToolMutation("ai.models", {
    onSuccess: (list) => {
      setModels(list);
      // A provider switch clears the model; pick the first option for the new provider.
      setForm((f) => (f.model === "" && list[0] ? { ...f, model: list[0].id } : f));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Suggestions never need a key (core ships a built-in list), so load them as soon as the
  // provider is known; the Refresh button re-queries after a key is saved.
  const loadModelsMutate = loadModels.mutate;
  useEffect(() => {
    loadModelsMutate({ provider: form.provider });
  }, [form.provider, loadModelsMutate]);

  const test = useToolMutation("ai.test", {
    onSuccess: (result) => setTestResult(`${result.provider}/${result.model} — ${result.latencyMs}ms`),
    onError: () => setTestResult(null),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!config.data) return;
    const patch: AiConfigureInput = {};
    if (form.provider !== config.data.provider) patch.provider = form.provider;
    if (form.model !== config.data.model) patch.model = form.model;
    if (form.baseUrl !== config.data.baseUrl) patch.baseUrl = form.baseUrl;
    if (form.systemPrompt !== config.data.systemPrompt) patch.systemPrompt = form.systemPrompt;
    if (Object.keys(patch).length === 0) {
      toast.success("Nothing to save");
      return;
    }
    save.mutate(patch);
  }

  function submitKey() {
    if (!apiKey.trim()) return;
    saveKey.mutate({ apiKey: apiKey.trim() });
  }

  function submitRemoveKey() {
    if (window.confirm("Remove the stored site API key? The site will fall back to the platform key, if any.")) {
      removeKey.mutate({ clearKey: true });
    }
  }

  return (
    <div className="space-y-6">
      <div className="max-w-xl space-y-6">
      {config.isLoading && <Spinner />}
      {config.isError && <ErrorBanner message={errorMessage(config.error)} />}

      {config.data && (
        <>
          <Card>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Provider</Label>
                <Select
                  value={form.provider}
                  onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as AiProvider, model: "" }))}
                >
                  {AiProvider.options.map((p) => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Model</Label>
                <div className="flex items-center gap-2">
                  {models.length > 0 ? (
                    <Select value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}>
                      {/* keep a saved custom id selectable even if the provider list doesn't include it */}
                      {form.model && !models.some((m) => m.id === form.model) && (
                        <option value={form.model}>{form.model}</option>
                      )}
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name ?? m.id}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      value={form.model}
                      onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                      placeholder={loadModels.isPending ? "Loading models…" : "Model id, e.g. llama3.1"}
                    />
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loadModels.isPending}
                    onClick={() => loadModels.mutate({ provider: form.provider })}
                  >
                    {loadModels.isPending ? "Loading…" : "Refresh"}
                  </Button>
                </div>
                {loadModels.isError && (
                  <div className="mt-1 text-xs text-red-600 dark:text-red-400">{errorMessage(loadModels.error)}</div>
                )}
              </div>

              {form.provider === "openai-compatible" && (
                <div>
                  <Label>Base URL</Label>
                  <Input
                    type="url"
                    value={form.baseUrl ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value || null }))}
                    placeholder="http://localhost:11434/v1"
                  />
                </div>
              )}

              <div>
                <Label>System prompt</Label>
                <Textarea
                  rows={3}
                  value={form.systemPrompt ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value || null }))}
                  placeholder="Appended to the built-in site context prompt"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="secondary" disabled={test.isPending} onClick={() => test.mutate({})}>
                  {test.isPending ? "Testing…" : "Test connection"}
                </Button>
                {testResult && <span className="text-sm text-emerald-600 dark:text-emerald-400">{testResult}</span>}
                {test.isError && <ErrorBanner message={errorMessage(test.error)} />}
              </div>
            </form>
          </Card>

          <Card>
            <div className="mb-1 flex items-center justify-between">
              <Label>API key</Label>
              <Badge tone={form.keySource === "none" ? "amber" : "green"}>{keySourceLabel(form)}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
              <Button type="button" variant="secondary" disabled={saveKey.isPending || !apiKey.trim()} onClick={submitKey}>
                {saveKey.isPending ? "Saving…" : "Save key"}
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={form.keySource !== "byok" || removeKey.isPending}
                onClick={submitRemoveKey}
              >
                {removeKey.isPending ? "Removing…" : "Remove key"}
              </Button>
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Set one here or via WOVE_AI_&lt;PROVIDER&gt;_KEY on the server.
            </div>
          </Card>
        </>
      )}

      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold tracking-tight">Usage</h2>

        {usage.isLoading && <Spinner />}
        {usage.isError && <ErrorBanner message={errorMessage(usage.error)} />}

        {usage.data && (
          <>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="p-3">
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Calls</div>
                <div className="mt-0.5 text-2xl font-semibold tracking-tight">{usage.data.totals.calls}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Input tokens</div>
                <div className="mt-0.5 text-2xl font-semibold tracking-tight">
                  {usage.data.totals.inputTokens.toLocaleString()}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Output tokens</div>
                <div className="mt-0.5 text-2xl font-semibold tracking-tight">
                  {usage.data.totals.outputTokens.toLocaleString()}
                </div>
              </Card>
            </div>
            <div className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Token counts only; billing is applied by your hosting provider.
            </div>

            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Actor</th>
                    <th className="px-4 py-2 font-medium">Channel</th>
                    <th className="px-4 py-2 font-medium">Tool</th>
                    <th className="px-4 py-2 font-medium">Model</th>
                    <th className="px-4 py-2 font-medium">In</th>
                    <th className="px-4 py-2 font-medium">Out</th>
                    <th className="px-4 py-2 font-medium">Key source</th>
                    <th className="px-4 py-2 font-medium">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.data.items.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900"
                    >
                      <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{relativeTime(entry.ts)}</td>
                      <td className="px-4 py-2">
                        <ActorBadge kind={entry.actorKind} />
                      </td>
                      <td className="px-4 py-2">
                        <ChannelBadge channel={entry.channel} />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{entry.tool}</td>
                      <td className="px-4 py-2">{entry.model}</td>
                      <td className="px-4 py-2">{entry.inputTokens}</td>
                      <td className="px-4 py-2">{entry.outputTokens}</td>
                      <td className="px-4 py-2">{entry.keySource}</td>
                      <td className="px-4 py-2">
                        <span className={entry.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                          {entry.ok ? "ok" : "error"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {usage.data.items.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400" colSpan={9}>
                        No usage yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
