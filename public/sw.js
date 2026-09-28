/*
 * MoeNotes service worker: keeps the pages' images from the asset service in Cache Storage, so that the settings' Data
 * tab can count and clear them (src/lib/cache/images.ts reads the same cache from the page). It answers image requests
 * under the given prefixes only; every other request, and any failure, goes to the network as it would without it.
 *
 * Registered by src/lib/cache/service-worker.ts, which passes cacheConfig.images in the script URL:
 *   prefixes  comma-separated URL prefixes of the images to keep
 *   cache     the Cache Storage cache (older caches of the same family are dropped on activation)
 *   max       budget in bytes; past it the images kept longest ago go first
 *   ttl       age in ms after which a kept image is checked with the server in the background
 *   item      the largest image in bytes that is kept
 *
 * To retire it, publish a sw.js that only unregisters itself: browsers check the script on navigation.
 */
const params = new URL(self.location.href).searchParams;
const PREFIXES = (params.get("prefixes") || "").split(",").filter(Boolean);
const CACHE_FAMILY = "moenotes-images-";
const CACHE_NAME = params.get("cache") || `${CACHE_FAMILY}v1`;
const MAX_BYTES = Number(params.get("max")) || 256 * 1024 * 1024;
const TTL_MS = Number(params.get("ttl")) || 7 * 24 * 60 * 60 * 1000;
const MAX_ITEM_BYTES = Number(params.get("item")) || 10 * 1024 * 1024;
/** What a kept response carries besides the image: its size, and when it was fetched (the eviction order, its age). */
const SIZE_HEADER = "x-moenotes-size";
const STORED_HEADER = "x-moenotes-stored-at";
/** Eviction stops at this share of the budget, so that the next images do not start another right away. */
const PRUNE_TARGET = 0.9;
const PRUNE_DELAY_MS = 10_000;

let pruneTimer = null;

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_FAMILY) && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
    await prune();
  })().catch(() => undefined));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.destination !== "image" || request.headers.has("range")) return;
  const key = imageKey(request.url);
  if (key) event.respondWith(serve(event, key));
});

/** The cache key of an image to keep (its URL without the fragment), or null. */
function imageKey(url) {
  const bare = url.split("#", 1)[0];
  return PREFIXES.some((prefix) => bare.startsWith(prefix)) ? bare : null;
}

async function serve(event, key) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const kept = await cache.match(key);
    if (kept) {
      // A new export may have replaced the image at its address: shown now, checked for the next view.
      if (Date.now() - (Number(kept.headers.get(STORED_HEADER)) || 0) > TTL_MS) {
        event.waitUntil(fetchAndKeep(cache, key, null).catch(() => undefined));
      }
      return kept;
    }
    return await fetchAndKeep(cache, key, event);
  } catch {
    // A CORS refusal, a network error, no Cache Storage: the page's own request, as without the worker.
    return fetch(event.request);
  }
}

/**
 * Fetches `key` as a CORS request and keeps an image answer. The page's own request is no-cors, whose opaque answer
 * can be neither measured nor kept at its size; the asset service allows any origin. `no-cache` makes the browser
 * revalidate an image its HTTP cache already holds (a copy fetched without CORS headers would fail a CORS request),
 * so an unchanged image costs a 304 and no download.
 */
async function fetchAndKeep(cache, key, event) {
  const response = await fetch(key, { mode: "cors", credentials: "omit", cache: "no-cache" });
  const type = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (response.status !== 200 || !type.startsWith("image/")) return response;
  const blob = await response.blob();
  const kept = new Response(blob, {
    status: 200,
    headers: {
      "content-type": type,
      "content-length": String(blob.size),
      [SIZE_HEADER]: String(blob.size),
      [STORED_HEADER]: String(Date.now()),
    },
  });
  if (blob.size > MAX_ITEM_BYTES) return kept;
  const stored = cache.put(key, kept.clone()).then(schedulePrune, () => undefined);
  if (event) event.waitUntil(stored);
  else await stored;
  return kept;
}

function schedulePrune() {
  // After the last image of a page, so that a page of hundreds of images starts one eviction.
  if (pruneTimer) clearTimeout(pruneTimer);
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    prune().catch(() => undefined);
  }, PRUNE_DELAY_MS);
}

/** Evicts the images kept longest ago once the cache is over budget, down to PRUNE_TARGET of it. */
async function prune() {
  if (!(await caches.has(CACHE_NAME))) return;
  const cache = await caches.open(CACHE_NAME);
  const entries = [];
  let total = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    const size = Number(response.headers.get(SIZE_HEADER)) || 0;
    entries.push({ request, size, storedAt: Number(response.headers.get(STORED_HEADER)) || 0 });
    total += size;
  }
  if (total <= MAX_BYTES) return;
  entries.sort((a, b) => a.storedAt - b.storedAt);
  for (const entry of entries) {
    if (total <= MAX_BYTES * PRUNE_TARGET) break;
    await cache.delete(entry.request);
    total -= entry.size;
  }
}
