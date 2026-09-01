import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Settings as SettingsType } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Input, Label, PageHeader, Spinner, Tabs, errorMessage } from "../components/ui";
import { EmailStatusCard } from "../components/EmailStatusCard";
import { SettingsAi } from "./SettingsAi";
import { SettingsDesign } from "./SettingsDesign";

type SettingsTab = "site" | "design" | "email" | "ai";

const TABS: { label: string; value: SettingsTab }[] = [
  { label: "Site", value: "site" },
  { label: "Design", value: "design" },
  { label: "Email", value: "email" },
  { label: "AI", value: "ai" },
];

const TAB_PATHS: Record<SettingsTab, string> = {
  site: "/settings",
  design: "/settings/design",
  email: "/settings/email",
  ai: "/settings/ai",
};

const EMPTY: SettingsType = {
  siteTitle: "",
  tagline: "",
  siteUrl: "",
  theme: "",
  postsPerPage: 10,
  postPermalink: "/:slug",
};

const PERMALINK_OPTIONS: Array<{ value: SettingsType["postPermalink"]; label: string; hint: string }> = [
  { value: "/:slug", label: "/:slug", hint: "Posts live at the site root" },
  { value: "/blog/:slug", label: "/blog/:slug", hint: "Posts live under /blog" },
];

export function Settings() {
  // The tab lives in the URL so /settings/design is linkable from the palette.
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const tab: SettingsTab = tabParam === "design" || tabParam === "ai" || tabParam === "email" ? tabParam : "site";
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
                <div>
                  <Label>Post URLs</Label>
                  <div className="space-y-2">
                    {PERMALINK_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 p-2.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <input
                          type="radio"
                          name="postPermalink"
                          className="mt-0.5 h-3.5 w-3.5 border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700"
                          checked={form.postPermalink === opt.value}
                          onChange={() => setForm((f) => ({ ...f, postPermalink: opt.value }))}
                        />
                        <span>
                          <span className="block font-mono font-medium text-zinc-900 dark:text-zinc-100">{opt.label}</span>
                          <span className="block text-xs text-zinc-500 dark:text-zinc-400">{opt.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Pages always use their own hierarchy path and aren't affected. Existing links to posts aren't
                    automatically redirected when you change this — add a redirect for any URLs you want to keep working.
                  </p>
                </div>
                <Button type="submit" variant="primary" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save settings"}
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}

      {tab === "design" && <SettingsDesign />}

      {tab === "email" && <EmailStatusCard />}

      {tab === "ai" && <SettingsAi />}
    </div>
  );
}
