import { masterdataConfig } from "@/config/masterdata";
import { getMasterdataCache, setMasterdataCache } from "@/lib/masterdata/cache";
import { fetchVersionManifest, getStoredDataVersion } from "@/lib/masterdata/version";
import type { MasterDataFetchOptions } from "@/types/masterdata";

export async function fetchMasterData<T>(path: string, options: MasterDataFetchOptions = {}): Promise<T> {
  const source = options.source ?? "mirror";
  const version = getStoredDataVersion() ?? (await fetchVersionManifest(source)).dataVersion;
  const cacheKey = path.replace(/^\/+/, "");

  if (!options.noCache) {
    const cached = await getMasterdataCache<T>(cacheKey, version);
    if (cached) return cached;
  }

  const base = masterdataConfig.sources[source];
  const url = `${base}${masterdataConfig.masterPath}/${cacheKey}?v=${encodeURIComponent(version)}`;
  const response = await fetch(url, options.noCache ? { cache: "no-store" } : undefined);
  if (!response.ok) throw new Error(`MasterData request failed: ${response.status}`);
  const data = await response.json() as T;
  await setMasterdataCache(cacheKey, version, data);
  return data;
}
