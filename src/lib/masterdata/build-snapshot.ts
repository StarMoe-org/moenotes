import { masterdataConfig } from "@/config/masterdata";
import { GAME_SERVER_PROFILES, PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { buildFetch } from "@/lib/build/fetch";
import type { VersionManifest } from "@/types/masterdata";

/** The metadata service's index.json: per region, its path and the SHA-256 of every file it serves. */
interface MasterdataIndex {
  regions?: Record<string, { path?: string; files?: Record<string, string> }>;
}

interface BuildSnapshotState {
  manifest?: Promise<VersionManifest>;
  index?: Promise<MasterdataIndex | null>;
  tables: Map<string, Promise<unknown>>;
  activeRequests: number;
  waiters: Array<() => void>;
}

const snapshotKey = Symbol.for("moenotes.masterdata.build-snapshot");
const globalState = globalThis as typeof globalThis & { [snapshotKey]?: BuildSnapshotState };
const state = globalState[snapshotKey] ??= { tables: new Map(), activeRequests: 0, waiters: [] };
const MAX_CONCURRENT_REQUESTS = 6;

function sourceBases(): string[] {
  return [...new Set(Object.values(masterdataConfig.sources).map((base) => base.replace(/\/+$/, "")))];
}

/**
 * Build-time override: read a local checkout of the data repository (StarMoe-org/moenotes-masterdata:
 * `current_version.json` plus one directory per region, `hk-tw-mo/`, `jp/`, …) instead of the network. A checkout
 * with the older single `master/` directory still serves the primary server.
 */
function localSourceDir(): string | undefined {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const dir = (import.meta.env.MOENOTES_MASTERDATA_DIR as string | undefined) ?? processEnv?.MOENOTES_MASTERDATA_DIR;
  return dir?.trim() || undefined;
}

interface NodeFs {
  readFile(path: string, encoding: "utf8"): Promise<string>;
}
// A variable specifier keeps the Node built-in out of type checking and client bundles; only builds reach it.
const NODE_FS = "node:fs/promises";

async function readLocalJson(dir: string, path: string): Promise<unknown> {
  const { readFile } = await import(/* @vite-ignore */ NODE_FS) as NodeFs;
  return JSON.parse(await readFile(`${dir.replace(/[\\/]+$/, "")}/${path.replace(/^\/+/, "")}`, "utf8")) as unknown;
}

export function getBuildManifest(): Promise<VersionManifest> {
  state.manifest ??= fetchBuildManifest();
  return state.manifest;
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
  return sha256 ? `sha256:${sha256}` : `${server}:${name}`;
}

export async function getBuildMasterData<T>(
  path: string,
  validate: (raw: unknown) => T,
  server: GameServer = PRIMARY_SERVER,
): Promise<T> {
  const name = path.replace(/^\/+/, "");
  const cacheKey = await getBuildTableKey(server, name);
  let request = state.tables.get(cacheKey);
  if (!request) {
    request = fetchBuildTable(server, name);
    state.tables.set(cacheKey, request);
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
