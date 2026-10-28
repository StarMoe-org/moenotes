import { cacheConfig } from "@/config/cache";

/** Read the page's active MasterData version stamped onto `<html data-masterdata-version="...">` during SSR. */
export function getDocumentMasterDataVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement?.getAttribute("data-masterdata-version")?.trim() || null;
}

function browserHasForceBypassQuery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["refresh_masterdata", "__refresh", "nocache", "refresh"]) {
      const val = params.get(key)?.trim().toLowerCase();
      if (val === "1" || val === "true" || val === "yes") return true;
    }
  } catch {
    // Ignore malformed query strings.
  }
  return false;
}

/**
 * Attach `?v=<dataVersion>` (and `refresh_masterdata=1&_t=...` when the page itself was opened with force-bypass)
 * to client-side MasterData JSON endpoints (`/search-index.json`, `/band-item-upgrades.json`, `/character-voices.json`).
 */
export function withClientMasterDataVersion(path: string, options?: { forceBypass?: boolean }): string {
  const version = getDocumentMasterDataVersion();
  const bypass = Boolean(options?.forceBypass) || browserHasForceBypassQuery();
  if (!version && !bypass) return path;

  const params = new URLSearchParams();
  if (version) params.set(cacheConfig.masterdata.versionParam, version);
  if (bypass) {
    params.set("refresh_masterdata", "1");
    params.set(cacheConfig.masterdata.bustParam, String(Date.now()));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}
