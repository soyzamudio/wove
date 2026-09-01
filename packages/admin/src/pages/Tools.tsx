import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { fetchToolCatalog } from "../api";
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, Spinner, errorMessage } from "../components/ui";

export function Tools() {
  const catalog = useQuery({ queryKey: ["tools-catalog"], queryFn: fetchToolCatalog });

  return (
    <div>
      <PageHeader title="Tools reference" subtitle="Everything an agent can do on this site" />

      {catalog.isLoading && <Spinner />}
      {catalog.isError && <ErrorBanner message={errorMessage(catalog.error)} />}

      {catalog.data && catalog.data.length === 0 && (
        <Card className="p-0">
          <EmptyState icon={<Wrench className="h-5 w-5" />} title="No tools registered" />
        </Card>
      )}

      {catalog.data && catalog.data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {catalog.data.map((tool) => (
            <Card key={tool.name}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{tool.name}</span>
                {tool.scopes.map((scope) => (
                  <Badge key={scope} tone="blue" mono>
                    {scope}
                  </Badge>
                ))}
              </div>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{tool.description}</p>
              <details className="mt-2 group">
                <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                  Input schema
                </summary>
                <pre className="wv-scroll mt-2 max-h-72 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
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
