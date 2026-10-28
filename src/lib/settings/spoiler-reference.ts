/**
 * The instant spoiler filtering uses until the visitor's clock is known: the page's render time (the build time for
 * the static pages). It is written to <html data-spoiler-now> and read back by the island bundles, so the server
 * markup and the hydrating client decide on the same unreleased items: nothing appears for a frame and is then
 * removed once useNow() resolves.
 *
 * The build can inline this module into several server chunks; the shared global keeps those copies on one
 * timestamp, so a page rendered late in the build still agrees with the value written into <html>.
 */
export const SPOILER_REFERENCE_NOW = (() => {
  if (typeof document !== "undefined") {
    const serialized = Number(document.documentElement.dataset.spoilerNow);
    if (Number.isFinite(serialized) && serialized > 0) return serialized;
    return Date.now();
  }
  const shared = globalThis as typeof globalThis & { __MOENOTES_SPOILER_NOW__?: number };
  const at = shared.__MOENOTES_SPOILER_NOW__ ?? Date.now();
  shared.__MOENOTES_SPOILER_NOW__ = at;
  return at;
})();
