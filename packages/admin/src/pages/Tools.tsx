import { useQuery } from "@tanstack/react-query";
import { fetchToolCatalog } from "../api";
import { Card, ErrorBanner, Spinner, errorMessage } from "../components/ui";

export function Tools() {
  const catalog = useQuery({ queryKey: ["tools-catalog"], queryFn: fetchToolCatalog });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tools reference</h1>

      {catalog.isLoading && <Spinner />}
      {catalog.isError && <ErrorBanner message={errorMessage(catalog.error)} />}

      {catalog.data && catalog.data.length === 0 && (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">No tools registered.</div>
      )}

      {catalog.data && catalog.data.length > 0 && (
        <div className="space-y-3">
          {catalog.data.map((tool) => (
            <Card key={tool.name}>
              <div className="mb-1 font-mono text-sm font-semibold">{tool.name}</div>
              <div className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {tool.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {scope}
                  </span>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                  Input schema
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-950">
                  {JSON.stringify(tool.inputSchema, null, 2)}
                </pre>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
