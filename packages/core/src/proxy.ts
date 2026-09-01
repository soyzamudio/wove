/**
 * Reverse proxy to the public site.
 *
 * In production core is the only port exposed: it owns `/api`, `/mcp`, `/media`, `/admin`
 * and `/health`, and forwards everything else to the Astro server named by
 * `WOVE_SITE_UPSTREAM`. Bodies and responses are streamed, never buffered, so large
 * uploads and streamed HTML pass through with constant memory.
 */
import { clientIp } from "./ratelimit";
import { trustProxy, type Env } from "./env";

/** Paths core answers itself; everything else is proxied. */
export const RESERVED_PREFIXES = ["/api/", "/media/", "/admin/"] as const;
export const RESERVED_EXACT = ["/mcp", "/health", "/admin", "/api"] as const;

export function isReservedPath(path: string): boolean {
  return (
    RESERVED_EXACT.includes(path as (typeof RESERVED_EXACT)[number]) ||
    RESERVED_PREFIXES.some((p) => path.startsWith(p))
  );
}

/**
 * Headers that describe one hop of a connection rather than the message, per RFC 9110.
 * Forwarding them corrupts the next hop's framing, so they are dropped in both directions.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

/** The runtime writes its own `Date` on the way out; forwarding the upstream's duplicates it. */
const RESPONSE_ONLY_DROP = new Set(["date"]);

function forwardable(headers: Headers, kind: "request" | "response" = "request"): Headers {
  const out = new Headers();
  for (const [k, v] of headers) {
    const name = k.toLowerCase();
    if (HOP_BY_HOP.has(name)) continue;
    if (kind === "response" && RESPONSE_ONLY_DROP.has(name)) continue;
    out.append(k, v);
  }
  return out;
}

export const badGateway = (message: string) =>
  new Response(JSON.stringify({ code: "bad_gateway", message }), {
    status: 502,
    headers: { "content-type": "application/json" },
  });

export interface ProxyOptions {
  env?: Env;
  /** Bun server handle, used for the socket address when no proxy is trusted. */
  server?: unknown;
}

/**
 * Forward one request to `upstream`, preserving method, path, query, headers and body,
 * and adding the `x-forwarded-*` trio. Redirects are passed through untouched
 * (`redirect: "manual"`) so the browser — not core — follows them and the user's address
 * bar stays honest.
 */
export async function proxyRequest(upstream: string, req: Request, opts: ProxyOptions = {}): Promise<Response> {
  const env = opts.env ?? process.env;
  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, upstream);

  const headers = forwardable(req.headers);
  const trusted = trustProxy(env);
  const priorProto = req.headers.get("x-forwarded-proto");
  const priorHost = req.headers.get("x-forwarded-host");
  const priorFor = req.headers.get("x-forwarded-for");
  const ip = clientIp(req, opts.server, env);

  headers.set("x-forwarded-host", (trusted && priorHost) || url.host);
  headers.set("x-forwarded-proto", (trusted && priorProto) || url.protocol.replace(":", ""));
  headers.set("x-forwarded-for", trusted && priorFor ? `${priorFor}, ${ip}` : ip);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: "manual",
      // Streaming a request body requires half-duplex mode; `duplex` is not yet in lib.dom.
      ...(hasBody && req.body ? ({ duplex: "half" } as Record<string, unknown>) : {}),
    });
  } catch (e) {
    console.error("[proxy]", target.href, (e as Error).message);
    return badGateway(`Upstream ${upstream} is unreachable`);
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: forwardable(res.headers, "response"),
  });
}
