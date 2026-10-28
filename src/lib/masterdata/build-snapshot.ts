import { buildEnv } from "@/config/build-env";
import { masterdataConfig } from "@/config/masterdata";
import { GAME_SERVER_PROFILES, PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { buildFetch } from "@/lib/build/fetch";
import type { VersionManifest } from "@/types/masterdata";

/** The metadata service's index.json: per region, its path and the SHA-256 of every file it serves. */
interface MasterdataIndex {
  regions?: Record<string, { path?: string; files?: Record<string, string> }>;
}

interface BuildSnapshotState {
  manifest?: Promise<VersionManifest> | undefined;
  resolvedManifest?: VersionManifest | undefined;
  manifestCheckedAt: number;
  refreshing?: Promise<VersionManifest> | undefined;
  index?: Promise<MasterdataIndex | null> | undefined;
  tables: Map<string, Promise<unknown>>;
  epoch: number;
  activeRequests: number;
  waiters: Array<() => void>;
}

const snapshotKey = Symbol.for("moenotes.masterdata.build-snapshot");
const globalState = globalThis as typeof globalThis & { [snapshotKey]?: BuildSnapshotState };
const state = globalState[snapshotKey] ??= {
  manifestCheckedAt: 0,
  tables: new Map(),
  epoch: 0,
  activeRequests: 0,
  waiters: [],
};

const MAX_CONCURRENT_REQUESTS = 6;
const MAX_CACHED_TABLES = 256;
const DEFAULT_MANIFEST_TTL_MS = 60_000;

function manifestTtlMs(): number {
  const raw = buildEnv("MOENOTES_MASTERDATA_TTL_MS");
  if (!raw) return DEFAULT_MANIFEST_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MANIFEST_TTL_MS;
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

interface NodeFs {
  readFile(path: string, encoding: "utf8"): Promise<string>;
}
// A variable specifier keeps the Node built-in out of client bundles.
const NODE_FS = "node:fs/promises";

async function readLocalJson(dir: string, path: string): Promise<unknown> {
  const { readFile } = await import(/* webpackIgnore: true */ NODE_FS) as NodeFs;
  return JSON.parse(await readFile(`${dir.replace(/[\\/]+$/, "")}/${path.replace(/^\/+/, "")}`, "utf8")) as unknown;
}

/** Current epoch without awaiting; increments every time `dataVersion` rotates. */
export function currentMasterDataEpochSync(): number {
  return state.epoch;
}

/** Whether the in-memory manifest is still within its freshness window. */
export function isMasterDataManifestFresh(): boolean {
  return Boolean(state.resolvedManifest) && Date.now() - state.manifestCheckedAt < manifestTtlMs();
}

export function getBuildManifest(): Promise<VersionManifest> {
  if (!state.manifest) {
    state.manifest = fetchBuildManifest().then((loaded) => {
      state.resolvedManifest = loaded;
      state.manifestCheckedAt = Date.now();
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
    state.resolvedManifest = next;
    state.manifest = Promise.resolve(next);
    state.manifestCheckedAt = Date.now();
    if (prevVersion && next.dataVersion !== prevVersion) {
      state.epoch += 1;
      state.index = fetchBuildIndex();
      evictMutableTables();
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

function evictMutableTables(): void {
  for (const key of state.tables.keys()) {
    if (!key.startsWith("sha256:")) {
      state.tables.delete(key);
    }
  }
  pruneTableLru();
}

function pruneTableLru(): void {
  while (state.tables.size > MAX_CACHED_TABLES) {
    const oldest = state.tables.keys().next().value;
    if (oldest === undefined) break;
    state.tables.delete(oldest);
  }
}

/** Reset snapshot state (used by runtime cache invalidation tests). */
export function resetMasterDataSnapshotForTests(): void {
  state.manifest = undefined;
  state.resolvedManifest = undefined;
  state.manifestCheckedAt = 0;
  state.refreshing = undefined;
  state.index = undefined;
  state.tables.clear();
  state.epoch += 1;
}

/** The MasterData version a server's tables are at, or undefined when the metadata service does not serve it. */
export async function getBuildMasterVersion(server: GameServer): Promise<string | undefined> {
  return (await getBuildManifest()).regions?.[GAME_SERVER_PROFILES[server].masterdataRegion]?.version || undefined;
}

/**
 * Identity of a server's table: its SHA-256 from index.json when the service lists it, so that servers serving the
 * same bytes (the international servers share most tables) load and parse it once.
 */
export async function getBuildTableKey(server: GameServer, path: string): Promise<string> {
  const name = path.replace(/^\/+/, "");
  const index = await getBuildIndex();
  const sha256 = index?.regions?.[GAME_SERVER_PROFILES[server].masterdataRegion]?.files?.[name];
  if (sha256) return `sha256:${sha256}`;
  const version = await getBuildMasterVersion(server) ?? (await getBuildManifest()).dataVersion;
  return `${server}:${name}@${version}`;
}

export async function getBuildMasterData<T>(
  path: string,
  validate: (raw: unknown) => T,
  server: GameServer = PRIMARY_SERVER,
): Promise<T> {
  const name = path.replace(/^\/+/, "");
  const cacheKey = await getBuildTableKey(server, name);
  let request = state.tables.get(cacheKey);
  if (request) {
    // Refresh LRU order.
    state.tables.delete(cacheKey);
    state.tables.set(cacheKey, request);
  } else {
    request = fetchBuildTable(server, name).catch((error) => {
      state.tables.delete(cacheKey);
      throw error;
    });
    state.tables.set(cacheKey, request);
    pruneTableLru();
  }
  return validate(await request);
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

async function fetchBuildManifest(): Promise<VersionManifest> {
  const localDir = localSourceDir();
  if (localDir) {
    const raw = await readLocalJson(localDir, masterdataConfig.versionPath).catch(() => ({})) as Partial<VersionManifest>;
    return { ...raw, dataVersion: resolveDataVersion(raw) || "local", isFallback: false } as VersionManifest;
  }

  const errors: string[] = [];

  for (const base of sourceBases()) {
    try {
      const raw = await fetchJsonWithRetry(`${base}${masterdataConfig.versionPath}`, { cache: "no-store" }) as Partial<VersionManifest>;
      const dataVersion = resolveDataVersion(raw);
      if (!dataVersion) throw new Error("missing data version");
      return { ...raw, dataVersion, isFallback: false };
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to load the build MasterData manifest: ${errors.join("; ")}`);
}

function getBuildIndex(): Promise<MasterdataIndex | null> {
  state.index ??= fetchBuildIndex();
  return state.index;
}

/** Only an optimization: without the index every server's tables are loaded on their own. */
async function fetchBuildIndex(): Promise<MasterdataIndex | null> {
  if (localSourceDir()) return null;
  for (const base of sourceBases()) {
    try {
      return await fetchJsonWithRetry(`${base}${masterdataConfig.indexPath}`, { cache: "no-store" }) as MasterdataIndex;
    } catch {
      // Try the next source.
    }
  }
  return null;
}

async function fetchBuildTable(server: GameServer, path: string): Promise<unknown> {
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

  // A table the index does not list for the region (JP lacks some Bilibili tables) is not requested at all.
  const files = (await getBuildIndex())?.regions?.[profile.masterdataRegion]?.files;
  if (files && !(path in files)) throw new Error(`MasterData table ${server}/${path} is not served`);

  const version = await getBuildMasterVersion(server) ?? (await getBuildManifest()).dataVersion;
  const errors: string[] = [];

  for (const base of sourceBases()) {
    const url = `${base}${profile.masterdataPath}/${path}?v=${encodeURIComponent(version)}`;
    try {
      return await fetchJsonWithRetry(url);
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to load build MasterData table ${server}/${path}: ${errors.join("; ")}`);
}

async function fetchJsonWithRetry(url: string, init?: RequestInit): Promise<unknown> {
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
