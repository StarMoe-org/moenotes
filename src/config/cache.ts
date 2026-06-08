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
} as const;
