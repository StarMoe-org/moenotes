import { assetConfig } from "@/config/assets";
import { buildEnv } from "@/config/build-env";
import { masterdataConfig } from "@/config/masterdata";

/**
 * fetch() for build-time requests to our own services (MasterData tables, story tables, version manifests).
 *
 * - Public origins are swapped for the configured in-cluster ones (`assetConfig.internal`,
 *   `masterdataConfig.internal`), so a build inside the cluster skips the CDN. URLs written into pages are
 *   built elsewhere and keep the public origins.
 * - With `MOENOTES_FETCH_CACHE_DIR`, GET responses that carry an ETag or Last-Modified are kept on disk and
 *   revalidated by the next build: whatever did not change since the previous data version answers 304
 *   instead of transferring again. The `v` cache-busting parameter is left out of the cache key so that
 *   holds across versions. Requests with `cache: "no-store"` bypass the cache.
 */

const rewrites: ReadonlyArray<readonly [from: string, to: string]> = [
  ...originRewrites([assetConfig.api], assetConfig.internal),
  ...originRewrites(Object.values(masterdataConfig.sources), masterdataConfig.internal),
];

function originRewrites(publicOrigins: readonly string[], internal: string | undefined): Array<readonly [string, string]> {
  if (!internal) return [];
  return [...new Set(publicOrigins.map((origin) => origin.replace(/\/+$/, "")))].map((origin) => [origin, internal] as const);
}

/** The URL a build request is sent to: the in-cluster origin when one is configured for it. */
export function toBuildUrl(url: string): string {
  for (const [from, to] of rewrites) {
    if (url === from || url.startsWith(`${from}/`) || url.startsWith(`${from}?`)) return `${to}${url.slice(from.length)}`;
  }
  return url;
}

interface CacheMeta {
  url: string;
  etag?: string;
  lastModified?: string;
  contentType?: string;
}

interface NodeFs {
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  rename(from: string, to: string): Promise<void>;
}
// A variable specifier keeps the Node built-in out of type checking and client bundles; only builds reach it.
const NODE_FS = "node:fs/promises";

interface BuildFetchState {
  fs?: Promise<NodeFs>;
  stats: { downloaded: number; revalidated: number; uncached: number };
  reporting: boolean;
}

const stateKey = Symbol.for("moenotes.build.fetch");
const globalState = globalThis as typeof globalThis & { [stateKey]?: BuildFetchState };
const state = globalState[stateKey] ??= { stats: { downloaded: 0, revalidated: 0, uncached: 0 }, reporting: false };

export async function buildFetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
  if (input instanceof Request) return fetch(input, init);
  const url = String(input);
  const target = toBuildUrl(url);
  const cacheDir = buildEnv("MOENOTES_FETCH_CACHE_DIR");
  if (!cacheDir || (init?.method ?? "GET").toUpperCase() !== "GET" || init?.cache === "no-store") return fetch(target, init);

  reportAtExit();
  const entry = await cacheEntryPath(cacheDir, url);
  const cached = await readCacheEntry(entry);
  const headers = new Headers(init?.headers);
  if (cached?.meta.etag) headers.set("If-None-Match", ifNoneMatch(cached.meta.etag));
  if (cached?.meta.lastModified) headers.set("If-Modified-Since", cached.meta.lastModified);

  const response = await fetch(target, { ...init, headers });
  if (response.status === 304 && cached) {
    state.stats.revalidated += 1;
    return new Response(cached.body, { status: 200, headers: contentTypeHeaders(cached.meta.contentType) });
  }
  if (!response.ok) return response;

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  if (!etag && !lastModified) {
    state.stats.uncached += 1;
    return response;
  }

  const body = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  const meta: CacheMeta = { url };
  if (etag) meta.etag = etag;
  if (lastModified) meta.lastModified = lastModified;
  if (contentType) meta.contentType = contentType;
  // The cache only saves transfer; failing to write it must not fail the build.
  await writeCacheEntry(entry, meta, body).catch((error: unknown) => {
    console.warn(`[build-fetch] cache write failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
  });
  state.stats.downloaded += 1;
  return new Response(body, { status: response.status, headers: contentTypeHeaders(contentType ?? undefined) });
}

function contentTypeHeaders(contentType: string | undefined): Record<string, string> {
  return contentType ? { "content-type": contentType } : {};
}

/**
 * Cloudflare weakens the ETag of responses it compresses (`W/"x"`), and the asset service compares
 * If-None-Match strictly, so a weak tag alone never matches. If-None-Match uses weak comparison anyway, so
 * offering the strong form of the same tag is equivalent and lets such origins answer 304.
 */
function ifNoneMatch(etag: string): string {
  return etag.startsWith("W/") ? `${etag}, ${etag.slice(2)}` : etag;
}

function nodeFs(): Promise<NodeFs> {
  state.fs ??= import(/* @vite-ignore */ NODE_FS) as Promise<NodeFs>;
  return state.fs;
}

async function cacheEntryPath(cacheDir: string, url: string): Promise<string> {
  const key = new URL(url);
  key.searchParams.delete("v");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key.toString())));
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${cacheDir.replace(/[\\/]+$/, "")}/${hex.slice(0, 2)}/${hex}`;
}

async function readCacheEntry(entry: string): Promise<{ meta: CacheMeta; body: Uint8Array<ArrayBuffer> } | null> {
  const fs = await nodeFs();
  try {
    const meta = JSON.parse(await fs.readFile(`${entry}.json`, "utf8")) as CacheMeta;
    return { meta, body: await fs.readFile(`${entry}.body`) };
  } catch {
    return null;
  }
}

async function writeCacheEntry(entry: string, meta: CacheMeta, body: Uint8Array): Promise<void> {
  const fs = await nodeFs();
  await fs.mkdir(entry.slice(0, entry.lastIndexOf("/")), { recursive: true });
  // The body lands before the metadata that points at it; each file is replaced atomically.
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(`${entry}.body.${suffix}`, body);
  await fs.rename(`${entry}.body.${suffix}`, `${entry}.body`);
  await fs.writeFile(`${entry}.json.${suffix}`, JSON.stringify(meta));
  await fs.rename(`${entry}.json.${suffix}`, `${entry}.json`);
}

function reportAtExit(): void {
  if (state.reporting) return;
  state.reporting = true;
  const processRef = (globalThis as { process?: { once?(event: "exit", listener: () => void): unknown } }).process;
  processRef?.once?.("exit", () => {
    const { downloaded, revalidated, uncached } = state.stats;
    console.log(`[build-fetch] ${revalidated} unchanged (304), ${downloaded} downloaded, ${uncached} without validators`);
  });
}
