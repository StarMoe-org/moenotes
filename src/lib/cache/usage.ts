import { deleteAssetCacheEntries, listAssetCacheEntries, type AssetCacheStats } from "@/lib/cache/asset-cache";
import { clearImageCache, getImageCacheUsage, isImageCacheAvailable } from "@/lib/cache/images";
import { CACHE_OBJECT_STORES, isIndexedDbCacheAvailable, openCacheDb, waitForTransaction } from "@/lib/cache/indexed-db";
import { PLAYER_FILE_KINDS, clearPlayerFiles, getPlayerFileUsage, type PlayerFileKind } from "@/lib/cache/player-files";

/**
 * What the settings' Data tab lists, by what the files are rather than by where they are kept: Live2D models (the
 * viewer's and the stories'), images (the pages' and the stories' backgrounds), audio (the stories' voices, music and
 * sound effects, and audio the pages fetch), the 3D charts, and data (the rest of a story, and the game data the pages
 * fetch). The order is the display order, and fixes each category's color (`--mn-cache-<category>`).
 */
export type CacheCategory = "live2d" | "images" | "audio" | "chart" | "data";
export const CACHE_CATEGORIES: readonly CacheCategory[] = ["live2d", "images", "audio", "chart", "data"];

/** The category a player file of each kind counts under. */
export const PLAYER_KIND_CATEGORIES: Readonly<Record<PlayerFileKind, CacheCategory>> = {
  live2d: "live2d",
  background: "images",
  voice: "audio",
  sound: "audio",
  chart: "chart",
  story: "data",
};

export interface CacheOverview {
  categories: Record<CacheCategory, AssetCacheStats>;
  total: AssetCacheStats;
}

/** Whether the browser lets the site keep files at all (no IndexedDB: every file downloads each time). */
export function isBrowserCacheAvailable(): boolean {
  return isIndexedDbCacheAvailable() || isImageCacheAvailable();
}

/** The category a release asset cache response counts under, by its content type. */
export function assetCacheCategory(contentType: string): CacheCategory {
  if (contentType.startsWith("image/")) return "images";
  if (contentType.startsWith("audio/")) return "audio";
  return "data";
}

export async function getCacheOverview(): Promise<CacheOverview> {
  const [players, assets, images] = await Promise.all([getPlayerFileUsage(), listAssetCacheEntries(), getImageCacheUsage()]);
  const categories = Object.fromEntries(CACHE_CATEGORIES.map((category) => [category, { entries: 0, bytes: 0 }])) as Record<CacheCategory, AssetCacheStats>;
  for (const kind of PLAYER_FILE_KINDS) addUsage(categories[PLAYER_KIND_CATEGORIES[kind]], players[kind]);
  addUsage(categories.images, images);
  for (const entry of assets) addUsage(categories[assetCacheCategory(entry.contentType)], { entries: 1, bytes: entry.size });
  const total = { entries: 0, bytes: 0 };
  for (const category of CACHE_CATEGORIES) addUsage(total, categories[category]);
  return { categories, total };
}

export async function clearCacheCategory(category: CacheCategory): Promise<void> {
  const kinds = PLAYER_FILE_KINDS.filter((kind) => PLAYER_KIND_CATEGORIES[kind] === category);
  const assets = (await listAssetCacheEntries()).filter((entry) => assetCacheCategory(entry.contentType) === category);
  await Promise.all([
    kinds.length > 0 ? clearPlayerFiles(kinds) : undefined,
    category === "images" ? clearImageCache() : undefined,
    deleteAssetCacheEntries(assets.map((entry) => entry.key)),
  ]);
}

/** Every store of the cache database and the image cache; the settings are kept elsewhere and stay. */
export async function clearAllCaches(): Promise<void> {
  await Promise.all([clearCacheDatabase(), clearImageCache()]);
}

async function clearCacheDatabase(): Promise<void> {
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

function addUsage(target: AssetCacheStats, part: AssetCacheStats): void {
  target.entries += part.entries;
  target.bytes += part.bytes;
}
