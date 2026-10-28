/**
 * Emotion cache for Material 3 components.
 *
 * - Every rule goes into `@layer mui` (declared in src/styles/global.css between Tailwind's base and utilities), so
 *   Tailwind utilities on a MUI component win without `!important`.
 * - Standalone renders (unit tests) get a fresh cache per call on the server; Next.js App Router renders share one
 *   `compat` cache per request via NextMd3Registry and flush rules through `useServerInsertedHTML`.
 */
import createCache, { type EmotionCache } from "@emotion/cache";

const LAYER = "mui";

export function createLayeredMd3Cache(): EmotionCache {
  const cache = createCache({ key: "css" });
  const insert = cache.insert;
  cache.insert = (selector, serialized, sheet, shouldCache) => {
    if (!serialized.styles.startsWith("@layer")) {
      serialized = { ...serialized, styles: `@layer ${LAYER}{${serialized.styles}}` };
    }
    return insert(selector, serialized, sheet, shouldCache);
  };
  return cache;
}

let browserCache: EmotionCache | null = null;

export function getMd3EmotionCache(): EmotionCache {
  if (typeof document === "undefined") return createLayeredMd3Cache();
  browserCache ??= createLayeredMd3Cache();
  return browserCache;
}
