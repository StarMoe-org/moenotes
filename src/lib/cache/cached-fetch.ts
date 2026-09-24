import { assetConfig } from "@/config/assets";
import { cacheConfig } from "@/config/cache";
import { storageKeys } from "@/config/storage";
import { getAssetCache, setAssetCache, type AssetCacheEntry } from "@/lib/cache/asset-cache";
import { safeGetLocalStorage } from "@/lib/storage/safe-storage";

export type CachedFetchInput = Parameters<typeof globalThis.fetch>[0];
export type CachedFetchInit = Parameters<typeof globalThis.fetch>[1];

export interface CachedFetchOptions {
  ttlMs?: number;
  cacheKey?: string;
  forceRefresh?: boolean;
  allowStaleOnError?: boolean;
  fetcher?: typeof globalThis.fetch;
}

type FetchCacheWindow = Window & typeof globalThis & {
  __moenotesFetchCacheInstalled?: boolean;
  __moenotesOriginalFetch?: typeof globalThis.fetch;
};

const assetSourcePrefixes = [...Object.values(assetConfig.sources), assetConfig.releaseSource].map((source) => source.replace(/\/+$/, ""));
const inFlightRequests = new Map<string, Promise<Response>>();
let nativeFetchRef: typeof globalThis.fetch | null = null;

export async function cachedFetch(input: CachedFetchInput, init?: CachedFetchInit, options: CachedFetchOptions = {}): Promise<Response> {
  const fetcher = options.fetcher ?? getNativeFetch();
  const request = createRequest(input, init);
  if (!request) return fetcher(input, init);

  const cacheMode = init?.cache ?? request.cache;
  const cacheKey = options.cacheKey ?? getAssetCacheKey(request.url);
  const forceRefresh = options.forceRefresh === true || cacheMode === "reload" || cacheMode === "no-cache";

  if (cacheMode === "no-store" || isAssetCacheBypassed() || !isCacheableAssetRequest(request)) {
    return fetcher(request);
  }

  if (!forceRefresh) {
    const cached = await getAssetCache(cacheKey);
    if (cached) return createAssetCacheResponse(cached, "hit");
  }

  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) return (await inFlight).clone();

  const requestTask = fetchAndCacheAsset(request, fetcher, cacheKey, options);
  inFlightRequests.set(cacheKey, requestTask);

  try {
    return (await requestTask).clone();
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export function installFetchCache(): void {
  if (typeof window === "undefined") return;

  const target = window as FetchCacheWindow;
  if (target.__moenotesFetchCacheInstalled) return;

  nativeFetchRef = target.__moenotesOriginalFetch ?? window.fetch.bind(window);
  const originalFetch = nativeFetchRef;
  target.__moenotesOriginalFetch = originalFetch;
  target.fetch = ((input: CachedFetchInput, init?: CachedFetchInit) => cachedFetch(input, init, { fetcher: originalFetch })) as typeof window.fetch;
  target.__moenotesFetchCacheInstalled = true;
}

export function getAssetCacheKey(url: string): string {
  const normalizedUrl = new URL(url, typeof window === "undefined" ? undefined : window.location.href);
  normalizedUrl.hash = "";
  return normalizedUrl.toString();
}

export function isManagedAssetUrl(url: string): boolean {
  try {
    const normalizedUrl = new URL(url, typeof window === "undefined" ? undefined : window.location.href).toString();
    return assetSourcePrefixes.some((prefix) => normalizedUrl === prefix || normalizedUrl.startsWith(`${prefix}/`));
  } catch {
    return false;
  }
}

export function createAssetCacheResponse(entry: AssetCacheEntry, cacheState: "hit" | "stale" = "hit"): Response {
  const headers = new Headers(entry.headers);
  if (entry.contentType && !headers.has("content-type")) headers.set("content-type", entry.contentType);
  headers.set("x-moenotes-cache", cacheState);

  return new Response(entry.blob, {
    status: entry.status,
    statusText: entry.statusText,
    headers,
  });
}

async function fetchAndCacheAsset(
  request: Request,
  fetcher: typeof globalThis.fetch,
  cacheKey: string,
  options: CachedFetchOptions,
): Promise<Response> {
  try {
    const response = await fetcher(request);

    if (response.status >= 500 && options.allowStaleOnError !== false) {
      const stale = await getAssetCache(cacheKey, { allowStale: true });
      if (stale) return createAssetCacheResponse(stale, "stale");
    }

    return await storeCacheableAssetResponse(cacheKey, request.url, response, options.ttlMs) ?? response;
  } catch (error) {
    if (options.allowStaleOnError !== false) {
      const stale = await getAssetCache(cacheKey, { allowStale: true });
      if (stale) return createAssetCacheResponse(stale, "stale");
    }
    throw error;
  }
}

async function storeCacheableAssetResponse(cacheKey: string, url: string, response: Response, ttlMs = cacheConfig.assets.ttlMs): Promise<Response | null> {
  if (!isCacheableAssetResponse(response)) return null;

  const responseSize = getResponseContentLength(response);
  if (responseSize !== null && responseSize > cacheConfig.assets.maxResponseBytes) return null;

  const headerContentType = normalizeContentType(response.headers.get("content-type") ?? "");
  if (headerContentType && !isCacheableContentType(headerContentType)) return null;

  try {
    const blob = await response.clone().blob();
    const contentType = normalizeContentType(headerContentType || blob.type);
    const replay = createReplayResponse(response, blob, contentType);
    if (blob.size > cacheConfig.assets.maxResponseBytes) return replay;
    if (!isCacheableContentType(contentType)) return replay;

    const now = Date.now();
    await setAssetCache({
      key: cacheKey,
      url,
      blob,
      contentType,
      size: blob.size,
      status: response.status,
      statusText: response.statusText,
      headers: collectResponseHeaders(response.headers, contentType, blob.size),
      cachedAt: now,
      lastAccessedAt: now,
      expiresAt: now + ttlMs,
      staleUntil: now + ttlMs + cacheConfig.assets.staleFallbackTtlMs,
    });
    return replay;
  } catch {
    // Cache population is best-effort and must never break the request.
    return null;
  }
}

function getNativeFetch(): typeof globalThis.fetch {
  if (nativeFetchRef) return nativeFetchRef;
  nativeFetchRef = globalThis.fetch.bind(globalThis);
  return nativeFetchRef;
}

function createRequest(input: CachedFetchInput, init?: CachedFetchInit): Request | null {
  try {
    return new Request(input, init);
  } catch {
    return null;
  }
}

function isAssetCacheBypassed(): boolean {
  return safeGetLocalStorage(storageKeys.assetCacheBypass) === "true";
}

function isCacheableAssetRequest(request: Request): boolean {
  if (request.method.toUpperCase() !== "GET") return false;
  if (!isManagedAssetUrl(request.url)) return false;
  if (request.headers.has("authorization")) return false;
  if (request.headers.has("range")) return false;
  if (request.credentials === "include") return false;
  return true;
}

function isCacheableAssetResponse(response: Response): boolean {
  if (!response.ok) return false;
  if ([101, 103, 204, 205, 304].includes(response.status)) return false;
  if (response.type === "opaque" || response.type === "opaqueredirect") return false;
  return true;
}

function createReplayResponse(response: Response, blob: Blob, contentType: string): Response {
  return new Response(blob, {
    status: response.status,
    statusText: response.statusText,
    headers: collectResponseHeaders(response.headers, contentType, blob.size),
  });
}

function isCacheableContentType(contentType: string): boolean {
  if (!contentType) return false;
  if ((cacheConfig.assets.cacheableContentTypes as readonly string[]).includes(contentType)) return true;
  return cacheConfig.assets.cacheableContentTypePrefixes.some((prefix) => contentType.startsWith(prefix));
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function getResponseContentLength(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectResponseHeaders(headers: Headers, contentType: string, size: number): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "set-cookie" || normalizedKey === "content-encoding") return;
    result[normalizedKey] = value;
  });

  if (contentType) result["content-type"] = contentType;
  result["content-length"] = String(size);
  return result;
}
