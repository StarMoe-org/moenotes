import { errorMessage, log } from "./builds";

const PROXY_TIMEOUT_MS = 15_000;

/** Hop-by-hop headers and the ones fetch() recomputes; forwarding them would corrupt the relayed message. */
const DROPPED_REQUEST_HEADERS = ["host", "connection", "content-length", "accept-encoding", "transfer-encoding"];
const DROPPED_RESPONSE_HEADERS = ["connection", "content-length", "content-encoding", "transfer-encoding"];

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Reads `MOENOTES_API_INTERNAL`: an absolute http(s) origin, in-cluster or public. Anything else counts as
 * unset. The caller reports it: a typo in this variable must not take the site down with it.
 */
export function parseApiOrigin(raw: string | undefined): { origin: string | undefined; invalid: boolean } {
  if (!raw) return { origin: undefined, invalid: false };
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return { origin: url.origin, invalid: false };
  } catch {
    // Not a URL at all, e.g. a bare host name.
  }
  return { origin: undefined, invalid: true };
}

/**
 * Relays `/api/*` to starmoe-api so pages call it same-origin: its session cookie stays first-party and no
 * CORS is involved. Redirects and Set-Cookie pass through untouched.
 */
export async function proxyApi(request: Request, origin: string | undefined): Promise<Response> {
  if (!origin) return new Response("Not Found\n", { status: 404, headers: { "cache-control": "no-store" } });
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const upstream = await fetch(new URL(url.pathname + url.search, origin), {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch (error) {
    // The address stays in the log: it can name in-cluster hosts.
    log(`api proxy: ${request.method} ${url.pathname} failed: ${errorMessage(error)}`);
    return new Response("Bad Gateway\n", { status: 502, headers: { "cache-control": "no-store" } });
  }
}
