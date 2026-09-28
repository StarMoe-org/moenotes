import { clearAssetCache, getAssetCacheStats, type AssetCacheStats } from "@/lib/cache/asset-cache";
import { CACHE_OBJECT_STORES, isIndexedDbCacheAvailable, openCacheDb, waitForTransaction } from "@/lib/cache/indexed-db";
import { PLAYER_FILE_SOURCES, clearPlayerFiles, getPlayerFileBudget, getPlayerFileUsage, type PlayerFileSource } from "@/lib/cache/player-files";

/** What the settings' Data tab lists: the player files by the tool that loaded them, and the release asset cache. */
export type CacheCategory = PlayerFileSource | "assets";
export const CACHE_CATEGORIES: readonly CacheCategory[] = [...PLAYER_FILE_SOURCES, "assets"];

export interface CacheOverview {
  categories: Record<CacheCategory, AssetCacheStats>;
  total: AssetCacheStats;
  /** The player files together, and the budget in bytes they are kept within (the asset cache has its own). */
  players: AssetCacheStats;
  playerBudget: number;
}

/** Whether the browser lets the site keep files at all (no IndexedDB: every file downloads each time). */
export function isBrowserCacheAvailable(): boolean {
  return isIndexedDbCacheAvailable();
}

export async function getCacheOverview(): Promise<CacheOverview> {
  const [players, assets, playerBudget] = await Promise.all([getPlayerFileUsage(), getAssetCacheStats(), getPlayerFileBudget()]);
  const categories: Record<CacheCategory, AssetCacheStats> = { ...players, assets };
  return {
    categories,
    total: sumUsage(CACHE_CATEGORIES.map((category) => categories[category])),
    players: sumUsage(PLAYER_FILE_SOURCES.map((source) => players[source])),
    playerBudget,
  };
}

export function clearCacheCategory(category: CacheCategory): Promise<void> {
  return category === "assets" ? clearAssetCache() : clearPlayerFiles(category);
}

/** Every store of the cache database; the settings are kept elsewhere and stay. */
export async function clearAllCaches(): Promise<void> {
  if (!isIndexedDbCacheAvailable()) return;
  try {
    const db = await openCacheDb();
    const transaction = db.transaction([...CACHE_OBJECT_STORES], "readwrite");
    for (const name of CACHE_OBJECT_STORES) transaction.objectStore(name).clear();
    await waitForTransaction(transaction);
  } catch {
    // The usage the settings show afterwards tells whether it went through.
  }
}

function sumUsage(parts: readonly AssetCacheStats[]): AssetCacheStats {
  return parts.reduce((sum, part) => ({ entries: sum.entries + part.entries, bytes: sum.bytes + part.bytes }), { entries: 0, bytes: 0 });
}
