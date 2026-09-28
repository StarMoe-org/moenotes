import { assetConfig } from "@/config/assets";
import { cacheConfig } from "@/config/cache";
import { isAssetCacheBypassed } from "@/lib/cache/cached-fetch";

/** The image cache's service worker (`public/sw.js`, served at the site root so that it controls every page). */
const WORKER_PATH = "/sw.js";

/**
 * Registers the service worker that keeps the pages' images from the asset service (images.ts), with
 * `cacheConfig.images` in its script URL, once the page has loaded. While the developer switch that bypasses the caches
 * is on it unregisters it instead. Without service workers images load through the HTTP cache alone.
 */
export function registerImageCacheWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const run = () => {
    const container = navigator.serviceWorker;
    if (isAssetCacheBypassed()) {
      void container.getRegistrations()
        .then((registrations) => Promise.all(registrations.filter(isImageCacheWorker).map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }
    const { cacheName, maxBytes, ttlMs, maxResponseBytes } = cacheConfig.images;
    const params = new URLSearchParams({
      prefixes: `${assetConfig.api}/`,
      cache: cacheName,
      max: String(maxBytes),
      ttl: String(ttlMs),
      item: String(maxResponseBytes),
    });
    void container.register(`${WORKER_PATH}?${params}`, { scope: "/" }).catch(() => undefined);
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}

function isImageCacheWorker(registration: ServiceWorkerRegistration): boolean {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  return worker ? new URL(worker.scriptURL).pathname === WORKER_PATH : false;
}
