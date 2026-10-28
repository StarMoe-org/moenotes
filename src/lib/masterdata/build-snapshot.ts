import { buildEnv } from "@/config/build-env";
import { cacheConfig } from "@/config/cache";
import { masterdataConfig } from "@/config/masterdata";
import { GAME_SERVER_PROFILES, PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { buildFetch, type BuildFetchInit } from "@/lib/build/fetch";
import type { VersionManifest } from "@/types/masterdata";

/** The metadata service's index.json: per region, its path and the SHA-256 of every file it serves. */
interface MasterdataIndex {
  regions?: Record<string, { path?: string; files?: Record<string, string> }>;
}

export interface MasterDataReadOptions {
  /** Force bypass of in-memory, disk, and upstream CDN/proxy caches for this read. */
  forceBypass?: boolean;
}

export interface ForceRefreshMasterDataOptions {
  /** Clear all cached MasterData tables and force upstream cache-busting on their next load (default: true). */
  purgeTables?: boolean;
}

export interface MasterDataCacheStats {
  dataVersion: string | null;
  regionVersions: Record<string, string>;
  epoch: number;
  cachedTables: number;
  maxTables: number;
  versionTtlMs: number;
  manifestCheckedAt: number;
  manifestFetchCount: number;
  isFresh: boolean;
}

interface BuildSnapshotState {
  manifest?: Promise<VersionManifest> | undefined;
  resolvedManifest?: VersionManifest | undefined;
  manifestLocalDir?: string | undefined;
  regionVersions: Record<string, string>;
  manifestCheckedAt: number;
  manifestFetchCount: number;
  refreshing?: Promise<VersionManifest> | undefined;
  forceRefreshing?: Promise<VersionManifest> | undefined;
  index?: Promise<MasterdataIndex | null> | undefined;
  indexVersion?: string | undefined;
  tables: Map<string, Promise<unknown>>;
  /** Epoch during which uncached tables must also bypass disk/CDN caches once (`forceRefreshMasterData`). */
  forceBypassEpoch: number;
  penetratedKeys: Set<string>;
  epoch: number;
  activeRequests: number;
  waiters: Array<() => void>;
}

const snapshotKey = Symbol.for("moenotes.masterdata.build-snapshot");
const globalState = globalThis as typeof globalThis & { [snapshotKey]?: BuildSnapshotState };
const state = globalState[snapshotKey] ??= {
  regionVersions: {},
  manifestCheckedAt: 0,
  manifestFetchCount: 0,
  tables: new Map(),
  forceBypassEpoch: -1,
  penetratedKeys: new Set(),
  epoch: 0,
  activeRequests: 0,
  waiters: [],
};

const MAX_CONCURRENT_REQUESTS = 6;

function versionTtlMs(): number {
  const raw = buildEnv("MOENOTES_MASTERDATA_VERSION_TTL_MS") ?? buildEnv("MOENOTES_MASTERDATA_TTL_MS");
  if (!raw) return cacheConfig.masterdata.versionTtlMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : cacheConfig.masterdata.versionTtlMs;
}

function maxCachedTables(): number {
  const raw = buildEnv("MOENOTES_MASTERDATA_MAX_TABLES");
  if (!raw) return cacheConfig.masterdata.maxTables;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : cacheConfig.masterdata.maxTables;
}

function sourceBases(): string[] {
  return [...new Set(Object.values(masterdataConfig.sources).map((base) => base.replace(/\/+$/, "")))];
}

/**
 * Local checkout override: read StarMoe-org/moenotes-masterdata (`current_version.json` plus one directory per
 * region, `hk-tw-mo/`, `jp/`, …) instead of the network.
 */
function localSourceDir(): string | undefined {
  return buildEnv("MOENOTES_MASTERDATA_DIR");
}

/** Optional persistent version-keyed disk cache directory for decoded MasterData tables. */
function masterdataCacheDir(): string | undefined {
  return buildEnv("MOENOTES_MASTERDATA_CACHE_DIR");
}

/** Append `?v=<version>` to a MasterData URL so every upstream table/index request carries an explicit version. */
export function withMasterDataVersionParam(rawUrl: string, version: string): string {
  const v = version.trim() || "latest";
  const param = cacheConfig.masterdata.versionParam;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set(param, v);
    return parsed.toString();
  } catch {
    const sep = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${sep}${encodeURIComponent(param)}=${encodeURIComponent(v)}`;
  }
}

function isTruthyFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * Detect whether an incoming HTTP request asks to force-penetrate MasterData & version caches.
 * Accepts query params (`?refresh_masterdata=1`, `?__refresh=1`, `?nocache=1`, `?refresh=1`)
 * or request headers (`x-moenotes-bypass-cache: 1`, `x-moenotes-refresh-masterdata: 1`).
 */
export function shouldBypassMasterDataCache(options: {
  searchParams?: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;
  headers?: Headers | null | undefined;
}): boolean {
  const { searchParams, headers } = options;
  if (headers) {
    if (isTruthyFlag(headers.get("x-moenotes-bypass-cache")) || isTruthyFlag(headers.get("x-moenotes-refresh-masterdata"))) {
      return true;
    }
  }
  if (!searchParams) return false;
  const keys = ["refresh_masterdata", "__refresh", "nocache", "refresh"] as const;
  if (searchParams instanceof URLSearchParams) {
    const rawRefreshToken = searchParams.get("_refresh")?.trim();
    if (rawRefreshToken && rawRefreshToken !== "0" && rawRefreshToken.toLowerCase() !== "false") return true;
    return keys.some((key) => isTruthyFlag(searchParams.get(key)));
  }
  const rawToken = searchParams["_refresh"];
  const firstToken = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim();
  if (firstToken && firstToken !== "0" && firstToken.toLowerCase() !== "false") return true;
  return keys.some((key) => {
    const raw = searchParams[key];
    const first = Array.isArray(raw) ? raw[0] : raw;
    return isTruthyFlag(first);
  });
}

interface NodeFs {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  rename(from: string, to: string): Promise<void>;
}
// A variable specifier keeps the Node built-in out of client bundles.
const NODE_FS = "node:fs/promises";
let fsPromise: Promise<NodeFs> | undefined;

function nodeFs(): Promise<NodeFs> {
  fsPromise ??= import(/* turbopackIgnore: true */ /* webpackIgnore: true */ NODE_FS) as Promise<NodeFs>;
  return fsPromise;
}

async function readLocalJson(dir: string, path: string): Promise<unknown> {
  const { readFile } = await nodeFs();
  return JSON.parse(await readFile(`${dir.replace(/[\\/]+$/, "")}/${path.replace(/^\/+/, "")}`, "utf8")) as unknown;
}

async function versionedDiskEntryPath(cacheDir: string, cacheKey: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cacheKey)));
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${cacheDir.replace(/[\\/]+$/, "")}/${hex.slice(0, 2)}/${hex}.json`;
}

async function readVersionedDiskTable(cacheDir: string, cacheKey: string): Promise<{ hit: true; value: unknown } | { hit: false }> {
  try {
    const fs = await nodeFs();
    const file = await versionedDiskEntryPath(cacheDir, cacheKey);
    const raw = await fs.readFile(file, "utf8");
    return { hit: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { hit: false };
  }
}

async function writeVersionedDiskTable(cacheDir: string, cacheKey: string, value: unknown): Promise<void> {
  try {
    const fs = await nodeFs();
    const file = await versionedDiskEntryPath(cacheDir, cacheKey);
    await fs.mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    const tmp = `${file}.${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value));
    await fs.rename(tmp, file);
  } catch {
    // Disk cache is best-effort acceleration; never fail MasterData reads on write errors.
  }
}

function extractRegionVersions(manifest: VersionManifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [region, info] of Object.entries(manifest.regions ?? {})) {
    if (info?.version) out[region] = info.version;
  }
  return out;
}

function recordManifest(loaded: VersionManifest): void {
  state.resolvedManifest = loaded;
  state.manifestLocalDir = localSourceDir() ?? "";
  state.regionVersions = extractRegionVersions(loaded);
  state.manifest = Promise.resolve(loaded);
  state.manifestCheckedAt = Date.now();
}

function syncSourceEnvironment(): void {
  const currentDir = localSourceDir() ?? "";
  if (state.manifestLocalDir !== undefined && state.manifestLocalDir !== currentDir) {
    state.manifest = undefined;
    state.resolvedManifest = undefined;
    state.manifestLocalDir = currentDir;
    state.regionVersions = {};
    state.manifestCheckedAt = 0;
    state.index = undefined;
    state.indexVersion = undefined;
    state.tables.clear();
    state.penetratedKeys.clear();
    state.epoch += 1;
  }
}

/** Current epoch without awaiting; increments every time `dataVersion` rotates or a force-bypass refresh runs. */
export function currentMasterDataEpochSync(): number {
  syncSourceEnvironment();
  return state.epoch;
}

/** Whether the in-memory version manifest is still within its configured TTL window. */
export function isMasterDataManifestFresh(): boolean {
  syncSourceEnvironment();
  const ttl = versionTtlMs();
  if (ttl <= 0) return false;
  return Boolean(state.manifest) && Boolean(state.resolvedManifest) && Date.now() - state.manifestCheckedAt < ttl;
}

/** Diagnostic snapshot of the Version Cache and Version-Keyed MasterData Cache. */
export function getMasterDataCacheStats(): MasterDataCacheStats {
  return {
    dataVersion: state.resolvedManifest?.dataVersion ?? null,
    regionVersions: { ...state.regionVersions },
    epoch: state.epoch,
    cachedTables: state.tables.size,
    maxTables: maxCachedTables(),
    versionTtlMs: versionTtlMs(),
    manifestCheckedAt: state.manifestCheckedAt,
    manifestFetchCount: state.manifestFetchCount,
    isFresh: isMasterDataManifestFresh(),
  };
}

/**
 * Force-penetrate both `masterdataConfig.versionPath` (`current_version.json`) and MasterData caches:
 * 1. Re-fetches `current_version.json` with cache-busting `_t` query + `no-cache, no-store` headers.
 * 2. Re-fetches `index.json?v=<dataVersion>` with cache-busting `_t` query + `no-cache, no-store` headers.
 * 3. Purges cached MasterData tables (when `purgeTables !== false`), increments `epoch` to invalidate all derived
 *    `memo()` selectors, and marks the new epoch so each table's first load also bypasses disk & CDN caches.
 */
export function forceRefreshMasterData(options: ForceRefreshMasterDataOptions = {}): Promise<VersionManifest> {
  const purgeTables = options.purgeTables !== false;
  state.forceRefreshing ??= (async () => {
    const next = await fetchBuildManifest();
    const prevVersion = state.resolvedManifest?.dataVersion;
    recordManifest(next);
    if (purgeTables || (prevVersion && next.dataVersion !== prevVersion)) {
      state.epoch += 1;
      state.tables.clear();
      state.penetratedKeys.clear();
      if (purgeTables) {
        state.forceBypassEpoch = state.epoch;
      }
      state.indexVersion = next.dataVersion;
      state.index = fetchBuildIndex(next.dataVersion, true);
      await state.index;
    }
    return next;
  })().finally(() => {
    state.forceRefreshing = undefined;
  });
  return state.forceRefreshing;
}

/**
 * Penetrate `current_version.json` immediately (`_t` + `no-cache, no-store`) to inspect the latest cloud version
 * (used when the Settings -> Data sheet opens). If upstream has moved, rotates the in-memory epoch right away.
 */
export async function peekCloudMasterDataManifest(): Promise<VersionManifest> {
  return refreshManifestIfChanged();
}

export function getBuildManifest(options?: MasterDataReadOptions): Promise<VersionManifest> {
  syncSourceEnvironment();
  if (options?.forceBypass) {
    return forceRefreshMasterData({ purgeTables: true });
  }

  if (!state.manifest) {
    state.manifest = fetchBuildManifest().then((loaded) => {
      recordManifest(loaded);
      return loaded;
    }).catch((error) => {
      state.manifest = undefined;
      throw error;
    });
    return state.manifest;
  }

  if (isMasterDataManifestFresh()) {
    return state.manifest;
  }

  state.refreshing ??= refreshManifestIfChanged().finally(() => {
    state.refreshing = undefined;
  });
  return state.refreshing;
}

async function refreshManifestIfChanged(): Promise<VersionManifest> {
  try {
    const next = await fetchBuildManifest();
    const prevVersion = state.resolvedManifest?.dataVersion;
    recordManifest(next);
    if (prevVersion && next.dataVersion !== prevVersion) {
      state.epoch += 1;
      state.penetratedKeys.clear();
      state.indexVersion = next.dataVersion;
      state.index = fetchBuildIndex(next.dataVersion, false);
      evictStaleVersionTables(next.dataVersion);
    }
    return next;
  } catch (error) {
    // Keep serving the last known good manifest during transient upstream blips.
    if (state.resolvedManifest) {
      state.manifestCheckedAt = Date.now();
      return state.resolvedManifest;
    }
    throw error;
  }
}

function evictStaleVersionTables(activeDataVersion: string): void {
  const activeRegionSuffixes = new Set(Object.values(state.regionVersions).map((v) => `@${v}`));
  const activePrefix = `v:${activeDataVersion}:`;
  for (const key of state.tables.keys()) {
    if (key.startsWith(activePrefix)) continue;
    let matchesActiveRegion = false;
    for (const suffix of activeRegionSuffixes) {
      if (key.endsWith(suffix)) {
        matchesActiveRegion = true;
        break;
      }
    }
    if (!matchesActiveRegion) {
      state.tables.delete(key);
    }
  }
  pruneTableLru();
}

function pruneTableLru(): void {
  const limit = maxCachedTables();
  while (state.tables.size > limit) {
    const oldest = state.tables.keys().next().value;
    if (oldest === undefined) break;
    state.tables.delete(oldest);
  }
}

/** Reset snapshot state (used by runtime cache invalidation tests). */
export function resetMasterDataSnapshotForTests(): void {
  state.manifest = undefined;
  state.resolvedManifest = undefined;
  state.regionVersions = {};
  state.manifestCheckedAt = 0;
  state.manifestFetchCount = 0;
  state.refreshing = undefined;
  state.forceRefreshing = undefined;
  state.index = undefined;
  state.indexVersion = undefined;
  state.tables.clear();
  state.forceBypassEpoch = -1;
  state.penetratedKeys.clear();
  state.epoch += 1;
}

/** The MasterData version a server's tables are at, or undefined when the metadata service does not serve it. */
export async function getBuildMasterVersion(server: GameServer, options?: MasterDataReadOptions): Promise<string | undefined> {
  const manifest = await getBuildManifest(options);
  return manifest.regions?.[GAME_SERVER_PROFILES[server].masterdataRegion]?.version || undefined;
}

/**
 * Version-scoped identity of a server's table:
 * - Scoped by `manifest.dataVersion` + `sha256` from `index.json` when available, so international servers sharing
 *   identical table bytes decode once within a version while cleanly isolating across version rotations.
 * - Otherwise scoped by `${server}:${name}@${regionVersion}`.
 */
export async function getBuildTableKey(server: GameServer, path: string, options?: MasterDataReadOptions): Promise<string> {
  const name = path.replace(/^\/+/, "");
  const manifest = await getBuildManifest(options);
  const index = await getBuildIndex(manifest.dataVersion, Boolean(options?.forceBypass));
  const sha256 = index?.regions?.[GAME_SERVER_PROFILES[server].masterdataRegion]?.files?.[name];
  if (sha256) return `v:${manifest.dataVersion}:sha256:${sha256}`;
  const version = manifest.regions?.[GAME_SERVER_PROFILES[server].masterdataRegion]?.version || manifest.dataVersion;
  return `${server}:${name}@${version}`;
}

export async function getBuildMasterData<T>(
  path: string,
  validate: (raw: unknown) => T,
  server: GameServer = PRIMARY_SERVER,
  options?: MasterDataReadOptions,
): Promise<T> {
  const name = path.replace(/^\/+/, "");
  const explicitBypass = Boolean(options?.forceBypass);
  const cacheKey = await getBuildTableKey(server, name, options);

  const epochRequiresBypass = state.forceBypassEpoch === state.epoch && !state.penetratedKeys.has(cacheKey);
  const bypassTableFetch = explicitBypass || epochRequiresBypass;

  let request = explicitBypass ? undefined : state.tables.get(cacheKey);
  if (request) {
    // Refresh LRU order.
    state.tables.delete(cacheKey);
    state.tables.set(cacheKey, request);
  } else {
    if (epochRequiresBypass) {
      state.penetratedKeys.add(cacheKey);
    }
    request = loadOrFetchTable(server, name, cacheKey, bypassTableFetch).catch((error) => {
      state.tables.delete(cacheKey);
      state.penetratedKeys.delete(cacheKey);
      throw error;
    });
    state.tables.set(cacheKey, request);
    pruneTableLru();
  }
  return validate(await request);
}

async function loadOrFetchTable(
  server: GameServer,
  path: string,
  cacheKey: string,
  forceBypass: boolean,
): Promise<unknown> {
  const diskDir = !localSourceDir() ? masterdataCacheDir() : undefined;
  if (diskDir && !forceBypass) {
    const cached = await readVersionedDiskTable(diskDir, cacheKey);
    if (cached.hit) return cached.value;
  }
  const fresh = await fetchBuildTable(server, path, forceBypass);
  if (diskDir) {
    await writeVersionedDiskTable(diskDir, cacheKey, fresh);
  }
  return fresh;
}

/**
 * Cache token of the whole manifest, joining every region's hash: any region update invalidates it. Tables are
 * requested with their own region's version instead.
 */
function resolveDataVersion(raw: Partial<VersionManifest>): string | undefined {
  if (raw.dataVersion || raw.version) return raw.dataVersion || raw.version;
  const regions = Object.entries(raw.regions ?? {})
    .filter(([, region]) => region?.version)
    .sort(([a], [b]) => a.localeCompare(b));
  return regions.length ? regions.map(([name, region]) => `${name}:${region.version}`).join(",") : undefined;
}

/**
 * Always forces cache penetration (`forceBypass: true` -> `?_t=...` + `no-cache, no-store` headers + `cache: "no-store"`)
 * on every single check of `masterdataConfig.versionPath` (`current_version.json`).
 */
async function fetchBuildManifest(): Promise<VersionManifest> {
  state.manifestFetchCount += 1;
  const localDir = localSourceDir();
  if (localDir) {
    const raw = await readLocalJson(localDir, masterdataConfig.versionPath).catch(() => ({})) as Partial<VersionManifest>;
    return { ...raw, dataVersion: resolveDataVersion(raw) || "local", isFallback: false } as VersionManifest;
  }

  const errors: string[] = [];

  for (const base of sourceBases()) {
    try {
      const raw = await fetchJsonWithRetry(`${base}${masterdataConfig.versionPath}`, {
        forceBypass: true,
        cache: "no-store",
      }) as Partial<VersionManifest>;
      const dataVersion = resolveDataVersion(raw);
      if (!dataVersion) throw new Error("missing data version");
      return { ...raw, dataVersion, isFallback: false };
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to load the build MasterData manifest: ${errors.join("; ")}`);
}

function getBuildIndex(dataVersion: string, forceBypass = false): Promise<MasterdataIndex | null> {
  if (forceBypass || !state.index || state.indexVersion !== dataVersion) {
    state.indexVersion = dataVersion;
    state.index = fetchBuildIndex(dataVersion, forceBypass);
  }
  return state.index;
}

/** Only an optimization: without the index every server's tables are loaded on their own. Always carries `?v=<dataVersion>`. */
async function fetchBuildIndex(dataVersion: string, forceBypass: boolean): Promise<MasterdataIndex | null> {
  if (localSourceDir()) return null;
  for (const base of sourceBases()) {
    const url = withMasterDataVersionParam(`${base}${masterdataConfig.indexPath}`, dataVersion);
    try {
      return await fetchJsonWithRetry(url, forceBypass ? { forceBypass: true, cache: "no-store" } : undefined) as MasterdataIndex;
    } catch {
      // Try the next source.
    }
  }
  return null;
}

async function fetchBuildTable(server: GameServer, path: string, forceBypass: boolean): Promise<unknown> {
  const profile = GAME_SERVER_PROFILES[server];
  const localDir = localSourceDir();
  if (localDir) {
    try {
      return await readLocalJson(localDir, `${profile.masterdataRegion}/${path}`);
    } catch (error) {
      if (server !== PRIMARY_SERVER) throw error;
      return readLocalJson(localDir, `${masterdataConfig.masterPath}/${path}`);
    }
  }

  const manifest = await getBuildManifest();
  // A table the index does not list for the region (JP lacks some Bilibili tables) is not requested at all.
  const files = (await getBuildIndex(manifest.dataVersion, false))?.regions?.[profile.masterdataRegion]?.files;
  if (files && !(path in files)) throw new Error(`MasterData table ${server}/${path} is not served`);

  const version = manifest.regions?.[profile.masterdataRegion]?.version || manifest.dataVersion;
  const errors: string[] = [];

  for (const base of sourceBases()) {
    const url = withMasterDataVersionParam(`${base}${profile.masterdataPath}/${path}`, version);
    try {
      return await fetchJsonWithRetry(url, forceBypass ? { forceBypass: true, cache: "no-store" } : undefined);
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to load build MasterData table ${server}/${path}: ${errors.join("; ")}`);
}

async function fetchJsonWithRetry(url: string, init?: BuildFetchInit): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await withRequestSlot(async () => {
        const response = await buildFetch(url, init);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json() as unknown;
      });
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

async function withRequestSlot<T>(task: () => Promise<T>): Promise<T> {
  if (state.activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => state.waiters.push(resolve));
  }
  state.activeRequests += 1;
  try {
    return await task();
  } finally {
    state.activeRequests -= 1;
    state.waiters.shift()?.();
  }
}
