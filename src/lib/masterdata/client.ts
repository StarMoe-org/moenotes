import { masterdataConfig } from "@/config/masterdata";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage } from "@/lib/storage/safe-storage";
import { getSettings } from "@/lib/settings/store";
import { getMasterdataCacheEntry, getStaleMasterdataCache, setMasterdataCache } from "@/lib/masterdata/cache";
import { fetchVersionManifest, getMasterdataSourceFallbackOrder } from "@/lib/masterdata/version";
import type { MasterDataFetchOptions, VersionManifest } from "@/types/masterdata";
import type { MasterdataSource } from "@/types/settings";

const inFlightRequests = new Map<string, Promise<unknown>>();

export async function fetchMasterData<T>(path: string, options: MasterDataFetchOptions<T> = {}): Promise<T> {
  const source = options.source ?? getSettings().masterdataSource;
  const cacheKey = path.replace(/^\/+/, "");
  const bypassCache = shouldBypassCache(options);
  const requestKey = `${source}:${cacheKey}:${bypassCache ? "no-cache" : "cache"}`;

  const existing = inFlightRequests.get(requestKey) as Promise<T> | undefined;
  if (existing) return existing;

  const request = fetchMasterDataUncached(cacheKey, source, bypassCache, options)
    .finally(() => inFlightRequests.delete(requestKey));
  inFlightRequests.set(requestKey, request as Promise<unknown>);
  return request;
}

async function fetchMasterDataUncached<T>(
  cacheKey: string,
  source: MasterdataSource,
  bypassCache: boolean,
  options: MasterDataFetchOptions<T>,
): Promise<T> {
  let manifest: VersionManifest;
  try {
    manifest = await fetchVersionManifest(source);
  } catch (error) {
    return getStaleOrThrow(cacheKey, options.validate, error);
  }

  const version = manifest.dataVersion;

  if (!bypassCache) {
    const cached = await getMasterdataCacheEntry<unknown>(cacheKey, version);
    if (cached) return validateData(cached.data, options.validate);
  }

  const dataSources = getMasterdataSourceFallbackOrder(manifest.source ?? source);
  let lastError: unknown = null;

  for (const dataSource of dataSources) {
    const base = masterdataConfig.sources[dataSource];
    const url = `${base}${masterdataConfig.masterPath}/${cacheKey}?v=${encodeURIComponent(version)}`;
    try {
      const response = await fetch(url, bypassCache ? { cache: "no-store" } : undefined);
      if (!response.ok) throw new Error(`MasterData request failed: ${response.status}`);
      const raw = await response.json() as unknown;
      const data = validateData(raw, options.validate);
      if (!bypassCache) await setMasterdataCache(cacheKey, version, data);
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  return getStaleOrThrow(cacheKey, options.validate, lastError ?? new Error("MasterData request failed."));
}

function shouldBypassCache<T>(options: MasterDataFetchOptions<T>): boolean {
  if (options.noCache) return true;
  return safeGetLocalStorage(storageKeys.masterdataCacheBypass) === "true";
}

async function getStaleOrThrow<T>(cacheKey: string, validate: MasterDataFetchOptions<T>["validate"], error: unknown): Promise<T> {
  const stale = await getStaleMasterdataCache<unknown>(cacheKey);
  if (stale) return validateData(stale.data, validate);
  throw error instanceof Error ? error : new Error(String(error));
}

function validateData<T>(raw: unknown, validate: MasterDataFetchOptions<T>["validate"]): T {
  return validate ? validate(raw) : raw as T;
}
