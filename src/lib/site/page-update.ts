/**
 * Notices that the site published a newer version of the open page. The server names each HTML page's version in a
 * `Server-Timing` metric (server/static.ts): the page reads the version it was loaded with from its navigation entry
 * and compares it with a HEAD of its own URL when the tab comes back into view, when the browser restores it from its
 * back/forward cache, when the network returns and periodically while it is visible. Pages that a build left unchanged
 * keep their version, so only a page whose content changed is reported.
 *
 * The page never reloads by itself: the reader is told and decides.
 */

/** The `Server-Timing` metric that carries a page's version. */
export const PAGE_VERSION_METRIC = "page";
/** Checks while the tab stays visible. */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;
/** Checks are at least this far apart. */
export const MIN_CHECK_GAP_MS = 60 * 1000;
/** The first check waits until the page has settled; a page left sooner is not checked at all. */
export const FIRST_CHECK_DELAY_MS = 3 * 1000;

/** The `desc` of `metric` in a `Server-Timing` header value, or null. */
export function serverTimingDescription(header: string | null, metric = PAGE_VERSION_METRIC): string | null {
  if (!header) return null;
  for (const entry of header.split(",")) {
    const [name, ...params] = entry.split(";").map((part) => part.trim());
    if (name !== metric) continue;
    for (const param of params) {
      const match = /^desc=(?:"((?:[^"\\]|\\.)*)"|([^\s",;]+))$/i.exec(param);
      if (match) return (match[1] ?? match[2] ?? "").replace(/\\(.)/g, "$1") || null;
    }
    return null;
  }
  return null;
}

/** The version the document was loaded with, from its navigation entry; null when the browser does not expose it. */
export function loadedPageVersion(performanceApi: Pick<Performance, "getEntriesByType"> | undefined = globalThis.performance): string | null {
  try {
    const [entry] = (performanceApi?.getEntriesByType("navigation") ?? []) as Partial<PerformanceNavigationTiming>[];
    return entry?.serverTiming?.find((metric) => metric.name === PAGE_VERSION_METRIC)?.description || null;
  } catch {
    return null;
  }
}

/** The version the site serves now for `path`; null when the answer names none (another host, an error, offline). */
export async function currentPageVersion(path: string, fetcher: typeof fetch = globalThis.fetch): Promise<string | null> {
  try {
    const response = await fetcher(path, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
    return response.ok ? serverTimingDescription(response.headers.get("server-timing")) : null;
  } catch {
    return null;
  }
}

export interface PageUpdateWatcherOptions {
  /** The page's path, which the site is asked about. */
  path: string;
  /** The version the page was loaded with; when unknown, the first answer stands for it. */
  loaded: string | null;
  /** Called once per newer version. */
  onUpdate: (version: string) => void;
  fetcher?: typeof fetch | undefined;
  now?: () => number;
}

/**
 * Compares the page with the site on each `check()`. Checks closer than MIN_CHECK_GAP_MS to the previous one, and
 * checks while one is in flight, are skipped.
 */
export function createPageUpdateWatcher({ path, loaded, onUpdate, fetcher, now = Date.now }: PageUpdateWatcherOptions) {
  let baseline = loaded;
  let lastCheck = Number.NEGATIVE_INFINITY;
  let checking = false;
  let reported: string | null = null;

  return {
    async check(): Promise<void> {
      if (checking || now() - lastCheck < MIN_CHECK_GAP_MS) return;
      checking = true;
      lastCheck = now();
      try {
        const current = await currentPageVersion(path, fetcher);
        if (!current) return;
        if (!baseline) baseline = current;
        else if (current !== baseline && current !== reported) {
          reported = current;
          onUpdate(current);
        }
      } finally {
        checking = false;
      }
    },
  };
}

/**
 * Watches the open page in the browser: shortly after load, when the tab comes back into view, on a back/forward
 * cache restore, when the network returns and every CHECK_INTERVAL_MS while visible. Returns a function that stops it.
 */
export function installPageUpdateCheck(onUpdate: (version: string) => void, fetcher?: typeof fetch): () => void {
  const watcher = createPageUpdateWatcher({ path: window.location.pathname, loaded: loadedPageVersion(), onUpdate, fetcher });
  const check = () => void watcher.check();
  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) check();
  };
  const timer = window.setInterval(onVisibility, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", check);
  const first = window.setTimeout(check, FIRST_CHECK_DELAY_MS);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", check);
  };
}
