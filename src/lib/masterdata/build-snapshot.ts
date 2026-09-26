import { masterdataConfig } from "@/config/masterdata";
import type { VersionManifest } from "@/types/masterdata";

interface BuildSnapshotState {
  manifest?: Promise<VersionManifest>;
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

/** Build-time override: read a local masterdata checkout (same layout as the mirrors) instead of the network. */
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

export async function getBuildDataVersion(): Promise<string> {
  return (await getBuildManifest()).dataVersion;
}

export async function getBuildMasterData<T>(
  path: string,
  validate: (raw: unknown) => T,
): Promise<T> {
  const cacheKey = path.replace(/^\/+/, "");
  let request = state.tables.get(cacheKey);
  if (!request) {
    request = fetchBuildTable(cacheKey);
    state.tables.set(cacheKey, request);
  }
  return validate(await request);
}

/**
 * current_version.json only carries per-region hashes, while /master serves the merged tables,
 * so the cache token joins every region's hash: any region update invalidates it.
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

async function fetchBuildTable(path: string): Promise<unknown> {
  const localDir = localSourceDir();
  if (localDir) return readLocalJson(localDir, `${masterdataConfig.masterPath}/${path}`);

  const version = await getBuildDataVersion();
  const errors: string[] = [];

  for (const base of sourceBases()) {
    const url = `${base}${masterdataConfig.masterPath}/${path}?v=${encodeURIComponent(version)}`;
    try {
      return await fetchJsonWithRetry(url);
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to load build MasterData table ${path}: ${errors.join("; ")}`);
}

async function fetchJsonWithRetry(url: string, init?: RequestInit): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await withRequestSlot(async () => {
        const response = await fetch(url, init);
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
