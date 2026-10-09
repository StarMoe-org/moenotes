import { describe, expect, test } from "bun:test";
import {
  createPageUpdateWatcher,
  currentPageVersion,
  loadedPageVersion,
  MIN_CHECK_GAP_MS,
  serverTimingDescription,
} from "../src/lib/site/page-update";

/** A fetch answering HEAD requests with the given page versions in turn; null answers without one. */
function versions(...answers: (string | null | Error)[]) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const answer = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (answer instanceof Error) throw answer;
    return new Response(null, { status: 200, headers: answer ? { "server-timing": `cfL4;desc="x", page;desc="${answer}"` } : {} });
  }) as typeof fetch;
  return { fetcher, requests };
}

describe("page versions", () => {
  test("the page metric is read from a Server-Timing header among other metrics", () => {
    expect(serverTimingDescription('page;desc="1a-2b"')).toBe("1a-2b");
    expect(serverTimingDescription('cfL4;desc="?proto=TCP", page;dur=0;desc="1a-2b"')).toBe("1a-2b");
    expect(serverTimingDescription("page;desc=token")).toBe("token");
    expect(serverTimingDescription('pager;desc="x"')).toBeNull();
    expect(serverTimingDescription("page")).toBeNull();
    expect(serverTimingDescription(null)).toBeNull();
  });

  test("the loaded version comes from the navigation entry when the browser exposes it", () => {
    const entries = (serverTiming?: { name: string; description: string }[]) => ({
      getEntriesByType: () => [{ serverTiming }] as unknown as PerformanceEntryList,
    });
    expect(loadedPageVersion(entries([{ name: "cfL4", description: "x" }, { name: "page", description: "1a-2b" }]))).toBe("1a-2b");
    expect(loadedPageVersion(entries([]))).toBeNull();
    expect(loadedPageVersion(entries())).toBeNull();
    expect(loadedPageVersion({ getEntriesByType: () => [] })).toBeNull();
  });

  test("the current version is asked for with an uncached HEAD of the page", async () => {
    const { fetcher, requests } = versions("1a-2b");
    expect(await currentPageVersion("/tools/deck", fetcher)).toBe("1a-2b");
    expect(requests).toEqual([{ url: "/tools/deck", init: { method: "HEAD", cache: "no-store", credentials: "same-origin" } }]);
  });

  test("errors and answers without a version name no version", async () => {
    expect(await currentPageVersion("/", versions(null).fetcher)).toBeNull();
    expect(await currentPageVersion("/", versions(new TypeError("offline")).fetcher)).toBeNull();
    const notFound = (async () => new Response(null, { status: 404, headers: { "server-timing": 'page;desc="404"' } })) as unknown as typeof fetch;
    expect(await currentPageVersion("/", notFound)).toBeNull();
  });
});

describe("page update watcher", () => {
  const clock = () => {
    let time = 0;
    return { now: () => time, advance: (ms: number) => { time += ms; } };
  };

  test("a newer version is reported once, and an unchanged page never", async () => {
    const time = clock();
    const updates: string[] = [];
    const { fetcher } = versions("a", "b", "b", "c");
    const watcher = createPageUpdateWatcher({ path: "/", loaded: "a", onUpdate: (version) => updates.push(version), fetcher, now: time.now });
    for (let index = 0; index < 4; index++) {
      await watcher.check();
      time.advance(MIN_CHECK_GAP_MS);
    }
    expect(updates).toEqual(["b", "c"]);
  });

  test("without a loaded version the first answer stands for the page", async () => {
    const time = clock();
    const updates: string[] = [];
    const { fetcher } = versions(null, "a", "a", "b");
    const watcher = createPageUpdateWatcher({ path: "/", loaded: null, onUpdate: (version) => updates.push(version), fetcher, now: time.now });
    for (let index = 0; index < 4; index++) {
      await watcher.check();
      time.advance(MIN_CHECK_GAP_MS);
    }
    expect(updates).toEqual(["b"]);
  });

  test("checks closer than the minimum gap or while one is in flight are skipped", async () => {
    const time = clock();
    const { fetcher, requests } = versions("a");
    const watcher = createPageUpdateWatcher({ path: "/", loaded: "a", onUpdate: () => {}, fetcher, now: time.now });
    await Promise.all([watcher.check(), watcher.check()]);
    expect(requests).toHaveLength(1);
    time.advance(MIN_CHECK_GAP_MS - 1);
    await watcher.check();
    expect(requests).toHaveLength(1);
    time.advance(1);
    await watcher.check();
    expect(requests).toHaveLength(2);
  });
});
