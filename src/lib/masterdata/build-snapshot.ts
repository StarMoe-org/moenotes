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

async function fetchBuildManifest(): Promise<VersionManifest> {
  const errors: string[] = [];

  for (const base of sourceBases()) {
    try {
      const raw = await fetchJsonWithRetry(`${base}${masterdataConfig.versionPath}`, { cache: "no-store" }) as Partial<VersionManifest>;
      const dataVersion = raw.dataVersion || raw.version;
      if (!dataVersion) throw new Error("missing data version");
      return { ...raw, dataVersion, isFallback: false };
    } catch (error) {
      errors.push(`${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to load the build MasterData manifest: ${errors.join("; ")}`);
}

async function fetchBuildTable(path: string): Promise<unknown> {
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
