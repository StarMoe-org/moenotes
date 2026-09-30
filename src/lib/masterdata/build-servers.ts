import { assetConfig } from "@/config/assets";
import { buildEnv } from "@/config/build-env";
import { GAME_SERVER_PROFILES, GAME_SERVERS, PRIMARY_SERVER, isGameServer, orderServers, type GameServer } from "@/config/servers";
import { buildFetch } from "@/lib/build/fetch";
import { getBuildMasterVersion } from "@/lib/masterdata/build-snapshot";

/** moenotes-assets `versions/current_version.json`: the latest exported (succeeded or partial) release per region. */
interface AssetReleaseManifest {
  regions?: Record<string, { resource_version?: string; master_version?: string }>;
}

const serversKey = Symbol.for("moenotes.masterdata.build-servers");
const globalState = globalThis as typeof globalThis & { [serversKey]?: Promise<GameServer[]> };

/**
 * The servers this build shows, in switcher order. A server joins once the asset service has exported a release of
 * its region, so the files its MasterData names are published; that export also makes the deploy server rebuild
 * (docs/deployment.md). The metadata service must serve its tables too. The primary server is always built.
 *
 * `MOENOTES_SERVERS` (comma-separated, e.g. `tw,jp`) replaces the check, for local MasterData checkouts or to try a
 * server before its assets are exported.
 */
export function getBuildServers(): Promise<GameServer[]> {
  globalState[serversKey] ??= resolveBuildServers();
  return globalState[serversKey];
}

async function resolveBuildServers(): Promise<GameServer[]> {
  const override = buildEnv("MOENOTES_SERVERS");
  if (override) {
    const names = override.split(",").map((name) => name.trim()).filter(Boolean);
    const unknown = names.filter((name) => !isGameServer(name));
    if (unknown.length) throw new Error(`MOENOTES_SERVERS names unknown servers: ${unknown.join(", ")}`);
    return orderServers([PRIMARY_SERVER, ...names]);
  }

  const url = buildEnv("MOENOTES_VERSION_URL") ?? `${assetConfig.api}/versions/current_version.json`;
  let released: Set<string>;
  try {
    const response = await buildFetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    released = new Set(Object.keys((await response.json() as AssetReleaseManifest).regions ?? {}));
  } catch (error) {
    console.warn(`[servers] the asset release manifest ${url} could not be read (${error instanceof Error ? error.message : String(error)}); building ${PRIMARY_SERVER} only`);
    return [PRIMARY_SERVER];
  }

  const servers: GameServer[] = [];
  for (const server of GAME_SERVERS) {
    if (server !== PRIMARY_SERVER && !released.has(GAME_SERVER_PROFILES[server].assetRegion)) continue;
    if (server !== PRIMARY_SERVER && !await getBuildMasterVersion(server)) continue;
    servers.push(server);
  }
  const skipped = GAME_SERVERS.filter((server) => !servers.includes(server));
  console.info(`[servers] building ${servers.join(", ")}${skipped.length ? `; not yet exported: ${skipped.join(", ")}` : ""}`);
  return servers;
}
