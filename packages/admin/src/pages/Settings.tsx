import { useEffect, useState } from "react";
import type { Settings as SettingsType } from "@agentpress/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Input, Label, Spinner, errorMessage } from "../components/ui";

const EMPTY: SettingsType = {
  siteTitle: "",
  tagline: "",
  siteUrl: "",
  theme: "",
  postsPerPage: 10,
};

export function Settings() {
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
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

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
  );
}
