import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Settings as SettingsType } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Spinner, Tabs, errorMessage } from "../components/ui";
import { EmailStatusCard } from "../components/EmailStatusCard";
import { SettingsAi } from "./SettingsAi";
import { SettingsDesign } from "./SettingsDesign";

type SettingsTab = "site" | "design" | "ai";

const TABS: { label: string; value: SettingsTab }[] = [
  { label: "Site", value: "site" },
  { label: "Design", value: "design" },
  { label: "AI", value: "ai" },
];

const TAB_PATHS: Record<SettingsTab, string> = {
  site: "/settings",
  design: "/settings/design",
  ai: "/settings/ai",
};

const EMPTY: SettingsType = {
  siteTitle: "",
  tagline: "",
  siteUrl: "",
  theme: "",
  postsPerPage: 10,
};

export function Settings() {
  // The tab lives in the URL so /settings/design is linkable from the palette.
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const tab: SettingsTab = tabParam === "design" || tabParam === "ai" ? tabParam : "site";
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
    <div>
      <PageHeader title="Settings" subtitle="Site identity, design and AI configuration" />

      <div className="mb-6">
        <Tabs tabs={TABS} value={tab} onChange={(next) => navigate(TAB_PATHS[next])} />
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

          <EmailStatusCard />
        </div>
      )}

      {tab === "design" && <SettingsDesign />}

      {tab === "ai" && <SettingsAi />}
    </div>
  );
}
