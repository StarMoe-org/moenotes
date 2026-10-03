/**
 * Small helpers for page state kept in the current URL's query string. They never push history entries: they replace
 * the current one and keep its state object (Modal marks the entry it pushes with `{ modal: true }` and steps back over
 * it on close, which a replaced state would break). Safe to call during SSR, where they read nothing and write nothing.
 */

/** A query parameter of the current URL, or null (also during SSR). */
export function readQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Sets (or, with null, removes) a query parameter on the current history entry, keeping `history.state`. */
export function replaceQueryParam(name: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === null) {
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
  } else {
    if (url.searchParams.get(name) === value) return;
    url.searchParams.set(name, value);
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * A same-site path a `?return=` parameter may send the reader back to: one leading `/` (not `//host`, not `/\host`),
 * no scheme, no control characters. Returns the path, or null when it is not one.
 */
export function safeReturnPath(value: string | null | undefined): `/${string}` | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return null;
  return path as `/${string}`;
}
