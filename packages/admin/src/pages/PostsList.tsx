import { useState } from "react";
import { Link } from "react-router-dom";
import { useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { Button, Card, ErrorBanner, Input, Spinner, StatusPill, errorMessage } from "../components/ui";

type StatusFilter = "all" | "draft" | "published" | "scheduled";

const TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Scheduled", value: "scheduled" },
];

export function PostsList({ postType }: { postType: "post" | "page" }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");

  const basePath = postType === "post" ? "/posts" : "/pages";
  const heading = postType === "post" ? "Posts" : "Pages";

  const list = useToolQuery("post.list", {
    type: postType,
    status: status === "all" ? undefined : status,
    q: q || undefined,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{heading}</h1>
        <Link to={`${basePath}/new`}>
          <Button variant="primary">New</Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium " +
                (status === tab.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          className="w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput);
          }}
        >
          <Input
            placeholder="Search…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onBlur={() => setQ(qInput)}
          />
        </form>
      </div>

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {list.data.items.map((post) => (
                <tr key={post.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2">
                    <Link to={`${basePath}/${post.id}`} className="font-medium hover:underline">
                      {post.title || "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">{post.slug}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={post.status} />
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400">
                    {relativeTime(post.updatedAt)}
                  </td>
                </tr>
              ))}
              {list.data.items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400" colSpan={4}>
                    No {heading.toLowerCase()} found.
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
