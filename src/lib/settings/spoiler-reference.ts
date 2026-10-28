/**
 * The instant spoiler filtering uses until the visitor's clock is known: the page's render time (the build time for
 * the static pages). It is written to <html data-spoiler-now> and read back by the island bundles, so the server
 * markup and the hydrating client decide on the same unreleased items: nothing appears for a frame and is then
 * removed once useNow() resolves.
 */
export const SPOILER_REFERENCE_NOW = (() => {
  if (typeof document !== "undefined") {
    const serialized = Number(document.documentElement.dataset.spoilerNow);
    if (Number.isFinite(serialized) && serialized > 0) return serialized;
  }
  return Date.now();
})();
