import { cacheConfig } from "@/config/cache";
import { masterdataConfig } from "@/config/masterdata";
import { GAME_SERVER_PROFILES, type GameServer } from "@/config/servers";
import { storageKeys } from "@/config/storage";
import { clearCacheCategory } from "@/lib/cache/usage";
import {
  safeGetLocalStorage,
  safeGetSessionStorage,
  safeRemoveSessionStorage,
  safeSetLocalStorage,
  safeSetSessionStorage,
} from "@/lib/storage/safe-storage";

export interface CloudRegionVersionInfo {
  version?: string;
  resource_version?: string;
  verified_at?: string;
}

export interface LiveMasterDataVersionPayload {
  dataVersion: string;
  regions: Record<string, CloudRegionVersionInfo>;
  servers?: GameServer[];
  checkedCloud?: boolean;
  refreshed?: boolean;
}

const MAX_REFRESHES = 2;
const REFRESH_WINDOW_MS = 15_000;

function getRefreshCountState(): number {
  const now = Date.now();
  const ts = Number.parseInt(safeGetSessionStorage(storageKeys.masterdataRefreshTs) ?? "0", 10);
  const count = Number.parseInt(safeGetSessionStorage(storageKeys.masterdataRefreshCount) ?? "0", 10);
  if (!Number.isFinite(ts) || !Number.isFinite(count) || now - ts > REFRESH_WINDOW_MS) return 0;
  return count;
}

export function isManualRefreshAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return getRefreshCountState() < MAX_REFRESHES;
}

function recordManualRefresh(): void {
  const next = getRefreshCountState() + 1;
  safeSetSessionStorage(storageKeys.masterdataRefreshCount, String(next));
  safeSetSessionStorage(storageKeys.masterdataRefreshTs, String(Date.now()));
}

/** Read the page's active MasterData version stamped onto `<html data-masterdata-version="...">` during SSR. */
export function getDocumentMasterDataVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement?.getAttribute("data-masterdata-version")?.trim() || safeGetLocalStorage(storageKeys.masterdataVersion);
}

/** Read the page's per-region MasterData versions stamped onto `<html data-masterdata-regions="...">` during SSR. */
export function getDocumentRegionVersions(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const raw = document.documentElement?.getAttribute("data-masterdata-regions");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** Resolve the rendered MasterData version of `server` on the current page. */
export function getLocalServerMasterDataVersion(server: GameServer): string | null {
  const region = GAME_SERVER_PROFILES[server].masterdataRegion;
  const regions = getDocumentRegionVersions();
  return regions[region] ?? null;
}

/**
 * Format a raw MasterData version string (`1.1.0.100/9cb2cd74...` or `a1ba9587...` + `resource_version: "0.0.1.78_..."`)
 * into a concise, readable display label (e.g. `1.1.0.100 · 9cb2cd74` or `0.0.1.78 · a1ba9587`).
 */
export function formatMasterDataVersionLabel(version?: string | null, resourceVersion?: string | null): string {
  if (!version) return "";
  const trimmed = version.trim();
  if (trimmed.includes("/")) {
    const [prefix, hash = ""] = trimmed.split("/", 2);
    const shortHash = hash.length > 8 ? hash.slice(0, 8) : hash;
    return shortHash ? `${prefix} · ${shortHash}` : prefix!;
  }
  const semverPrefix = resourceVersion?.split("_")[0]?.trim();
  const shortHash = trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
  return semverPrefix ? `${semverPrefix} · ${shortHash}` : shortHash;
}

function browserHasForceBypassQuery(): boolean {
  if (typeof window === "undefined") return false;
  if (safeGetSessionStorage(storageKeys.masterdataBypassSession) === "1") return true;
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("_refresh")?.trim();
    if (token && token !== "0" && token.toLowerCase() !== "false") return true;
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
 * Modeled after MoeSekai's `MasterDataContext`:
 * Cleans `?_refresh=...` / `?refresh_masterdata=1` out of the address bar on arrival, records the active
 * SSR `dataVersion` in local storage, and keeps a short session bypass flag while lazy client indexes finish loading.
 */
export function syncMasterDataRefreshLanding(): (() => void) | undefined {
  if (typeof window === "undefined") return undefined;

  const docVersion = document.documentElement?.getAttribute("data-masterdata-version")?.trim() || null;
  const storedVersion = safeGetLocalStorage(storageKeys.masterdataVersion);

  try {
    const url = new URL(window.location.href);
    const hadRefresh = url.searchParams.has("_refresh") || url.searchParams.has("refresh_masterdata");
    if (hadRefresh) {
      url.searchParams.delete("_refresh");
      url.searchParams.delete("refresh_masterdata");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      safeSetSessionStorage(storageKeys.masterdataBypassSession, "1");
      void clearCacheCategory("data").catch(() => {});
    } else if (docVersion && storedVersion && storedVersion !== docVersion) {
      void clearCacheCategory("data").catch(() => {});
    }
  } catch {
    // Ignore URL errors.
  }

  if (docVersion) {
    safeSetLocalStorage(storageKeys.masterdataVersion, docVersion);
  }

  if (safeGetSessionStorage(storageKeys.masterdataBypassSession) === "1") {
    const timer = window.setTimeout(() => {
      safeRemoveSessionStorage(storageKeys.masterdataBypassSession);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }
  return undefined;
}

/**
 * Query live upstream cloud MasterData version (`check_cloud=1` penetrates `current_version.json` on the server).
 */
export async function fetchLiveMasterDataVersion(signal?: AbortSignal): Promise<LiveMasterDataVersionPayload | null> {
  const url = `${masterdataConfig.metaVersionApi}?check_cloud=1&${cacheConfig.masterdata.bustParam}=${Date.now()}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) return null;
  const payload = await response.json() as Partial<LiveMasterDataVersionPayload>;
  if (!payload || typeof payload.dataVersion !== "string") return null;
  return {
    dataVersion: payload.dataVersion,
    regions: payload.regions ?? {},
    ...(payload.servers ? { servers: payload.servers } : {}),
    ...(payload.checkedCloud !== undefined ? { checkedCloud: payload.checkedCloud } : {}),
    ...(payload.refreshed !== undefined ? { refreshed: payload.refreshed } : {}),
  };
}

/**
 * Force-penetrate server + client MasterData caches and reload the current page cleanly (`?_refresh=<ts>`).
 */
export async function forceRefreshMasterDataAndReload(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isManualRefreshAllowed()) return;

  recordManualRefresh();
  safeSetSessionStorage(storageKeys.masterdataBypassSession, "1");

  await Promise.allSettled([
    fetch(`${masterdataConfig.metaVersionApi}?${cacheConfig.masterdata.bustParam}=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "X-Moenotes-Bypass-Cache": "1",
      },
    }),
    clearCacheCategory("data"),
  ]);

  const url = new URL(window.location.href);
  url.searchParams.set("_refresh", String(Date.now()));
  window.location.href = url.toString();
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
