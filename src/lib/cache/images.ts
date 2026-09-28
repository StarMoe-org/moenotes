import { cacheConfig } from "@/config/cache";
import type { AssetCacheStats } from "@/lib/cache/asset-cache";

/**
 * The pages' images the service worker keeps (`public/sw.js`, registered by service-worker.ts). The page shares Cache
 * Storage with the worker, so the settings count and clear the cache from here.
 */

/** The size the worker writes on each kept response (the same header as in public/sw.js). */
const SIZE_HEADER = "x-moenotes-size";

export function isImageCacheAvailable(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

/** Kept images and their bytes; none while the worker has kept nothing (or cannot run). */
export async function getImageCacheUsage(): Promise<AssetCacheStats> {
  if (!isImageCacheAvailable()) return { entries: 0, bytes: 0 };
  try {
    // `open` would create the cache: ask first.
    if (!(await caches.has(cacheConfig.images.cacheName))) return { entries: 0, bytes: 0 };
    const responses = await (await caches.open(cacheConfig.images.cacheName)).matchAll();
    return {
      entries: responses.length,
      bytes: responses.reduce((sum, response) => sum + (Number(response.headers.get(SIZE_HEADER)) || 0), 0),
    };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

export async function clearImageCache(): Promise<void> {
  if (!isImageCacheAvailable()) return;
  try {
    await caches.delete(cacheConfig.images.cacheName);
  } catch {
    // The usage the settings show afterwards tells whether it went through.
  }
}
