import { useEffect, useState } from "react";
import type { Settings as SettingsType } from "@agentpress/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Input, Label, Spinner, errorMessage } from "../components/ui";
import { SettingsAi } from "./SettingsAi";

type SettingsTab = "site" | "ai";

const TABS: { label: string; value: SettingsTab }[] = [
  { label: "Site", value: "site" },
  { label: "AI", value: "ai" },
];

const EMPTY: SettingsType = {
  siteTitle: "",
  tagline: "",
  siteUrl: "",
  theme: "",
  postsPerPage: 10,
};

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>("site");
  const settings = useToolQuery("settings.get", {});
  const invalidate = useInvalidateTool();
  const toast = useToast();

  const [form, setForm] = useState<SettingsType>(EMPTY);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const update = useToolMutation("settings.update", {
    onSuccess: () => {
      toast.success("Settings saved");
      invalidate("settings.get");
      invalidate("site.info");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate(form);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium " +
              (tab === t.value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "site" && (
        <div className="max-w-xl space-y-6">
          {settings.isLoading && <Spinner />}
          {settings.isError && <ErrorBanner message={errorMessage(settings.error)} />}

          {settings.data && (
            <Card>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label>Site title</Label>
                  <Input
                    value={form.siteTitle}
                    onChange={(e) => setForm((f) => ({ ...f, siteTitle: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Tagline</Label>
                  <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
                </div>
                <div>
                  <Label>Site URL</Label>
                  <Input
                    type="url"
                    value={form.siteUrl}
                    onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Theme</Label>
                  <Input value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} />
                </div>
                <div>
                  <Label>Posts per page</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.postsPerPage}
                    onChange={(e) => setForm((f) => ({ ...f, postsPerPage: Number(e.target.value) }))}
                  />
                </div>
                <Button type="submit" variant="primary" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save settings"}
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "ai" && <SettingsAi />}
    </div>
  );
}
