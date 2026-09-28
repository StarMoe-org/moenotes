export const cacheConfig = {
  assets: {
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    staleFallbackTtlMs: 30 * 24 * 60 * 60 * 1000,
    maxEntries: 300,
    maxBytes: 150 * 1024 * 1024,
    maxResponseBytes: 25 * 1024 * 1024,
    cacheableContentTypePrefixes: ["image/", "audio/"] as const,
    cacheableContentTypes: ["application/json"] as const,
  },
  /**
   * Content-addressed files of the player sites (story site and chart site `assets/<sha256>.<ext>`) that the story
   * player, the Live2D viewer and the 3D chart previewer load. They never change, so they are kept until the budget
   * evicts them.
   */
  playerFiles: {
    /** Budget of the whole store; the least recently used files go first once it is exceeded. */
    maxBytes: 2 * 1024 * 1024 * 1024,
    /** Never more than this share of the quota the browser reports for the site. */
    quotaShare: 0.5,
    /** Eviction stops at this share of the budget, so the next files do not trigger it again right away. */
    pruneTarget: 0.9,
    /** A cached file's last use is written back at most this often (the eviction order needs no finer grain). */
    touchIntervalMs: 60 * 60 * 1000,
  },
  /**
   * The pages' images from the asset service (`<img>`, CSS backgrounds), which the service worker (`public/sw.js`)
   * keeps in the browser's Cache Storage so that the settings can count and clear them; see src/lib/cache/images.ts.
   */
  images: {
    /** The Cache Storage cache; a new name drops the old cache when the worker activates. */
    cacheName: "moenotes-images-v1",
    /** Budget of the cache; the images kept longest ago go first once it is exceeded. */
    maxBytes: 256 * 1024 * 1024,
    /** A kept image older than this is still shown, and checked with the server in the background. */
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    /** Larger images are shown but not kept. */
    maxResponseBytes: 10 * 1024 * 1024,
  },
} as const;
