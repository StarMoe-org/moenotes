import { join, resolve } from "node:path";
import { assetConfig } from "../src/config/assets";
import { masterdataConfig } from "../src/config/masterdata";

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function positiveNumber(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return value;
}

const dataDir = resolve(env("MOENOTES_DATA_DIR") ?? "/data");

/** Deploy server settings; every value comes from the environment (see docs/deployment.md). */
export const config = {
  appDir: resolve(import.meta.dir, ".."),
  host: env("HOST") ?? "0.0.0.0",
  port: positiveNumber("PORT", 80),
  dataDir,
  buildsDir: join(dataDir, "builds"),
  logsDir: join(dataDir, "logs"),
  fetchCacheDir: join(dataDir, "cache", "fetch"),
  statePath: join(dataDir, "state.json"),
  /**
   * The asset service's release manifest decides when to rebuild: it only moves once a release has been
   * exported, so every file the new MasterData refers to is already published. Public URLs here are sent to
   * the in-cluster origins by buildFetch.
   */
  assetVersionUrl: env("MOENOTES_VERSION_URL") ?? `${assetConfig.api}/versions/current_version.json`,
  /** Only read to confirm the export has caught up with MasterData before a build starts. */
  masterdataVersionUrl: `${Object.values(masterdataConfig.sources)[0]}${masterdataConfig.versionPath}`,
  pollMs: positiveNumber("MOENOTES_POLL_SECONDS", 60) * 1000,
  /** How long a build waits for the asset export to catch up with MasterData before it runs anyway. */
  syncWaitMs: positiveNumber("MOENOTES_SYNC_WAIT_SECONDS", 2 * 60 * 60) * 1000,
  buildTimeoutMs: positiveNumber("MOENOTES_BUILD_TIMEOUT_SECONDS", 60 * 60) * 1000,
  /** Builds kept on disk: the live one, the previous one in full, the rest as `_astro/` only. */
  keepBuilds: Math.max(2, Math.floor(positiveNumber("MOENOTES_KEEP_BUILDS", 4))),
  keepLogs: 10,
} as const;

export type ServerConfig = typeof config;
