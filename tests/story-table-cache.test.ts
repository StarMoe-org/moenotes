import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cacheConfig } from "@/config/cache";
import { fetchAndParseStory, storyTableCache } from "@/lib/story/parser";

const TABLES_PER_SCRIPT = 4;
const LIMIT_ENV = "MOENOTES_STORY_MAX_TABLES";

function tableResponse(): Response {
  return new Response(JSON.stringify({ header: [], allData: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function countingFetcher() {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return tableResponse();
  }) as typeof fetch;
  return { calls, fetcher };
}

const cachedScripts = () => [...new Set([...storyTableCache.tables.keys()].map((url) => /adv_script_[a-z0-9]+/.exec(url)?.[0]))];

describe("story table LRU", () => {
  const saved = process.env[LIMIT_ENV];

  beforeEach(() => {
    process.env[LIMIT_ENV] = String(TABLES_PER_SCRIPT * 2);
    storyTableCache.tables.clear();
  });

  afterEach(() => {
    storyTableCache.tables.clear();
    if (saved === undefined) delete process.env[LIMIT_ENV];
    else process.env[LIMIT_ENV] = saved;
  });

  test("evicts the oldest tables once the limit is exceeded", async () => {
    const { fetcher } = countingFetcher();
    for (const script of ["adv_script_a", "adv_script_b", "adv_script_c"]) await fetchAndParseStory(script, { fetcher });
    expect(storyTableCache.tables.size).toBe(TABLES_PER_SCRIPT * 2);
    expect(cachedScripts()).toEqual(["adv_script_b", "adv_script_c"]);
  });

  test("a hit renews its tables without fetching them again", async () => {
    const { calls, fetcher } = countingFetcher();
    await fetchAndParseStory("adv_script_a", { fetcher });
    await fetchAndParseStory("adv_script_b", { fetcher });
    await fetchAndParseStory("adv_script_a", { fetcher });
    expect(calls).toHaveLength(TABLES_PER_SCRIPT * 2);
    await fetchAndParseStory("adv_script_c", { fetcher });
    expect(cachedScripts()).toEqual(["adv_script_a", "adv_script_c"]);
  });

  test("defaults to the configured limit when the environment sets no valid one", async () => {
    const { fetcher } = countingFetcher();
    for (const value of ["", "0", "-1", "not-a-number"]) {
      process.env[LIMIT_ENV] = value;
      storyTableCache.tables.clear();
      const scripts = Math.ceil(cacheConfig.story.maxTables / TABLES_PER_SCRIPT) + 1;
      await Promise.all(Array.from({ length: scripts }, (_, index) => fetchAndParseStory(`adv_script_${index}`, { fetcher })));
      expect(storyTableCache.tables.size).toBe(cacheConfig.story.maxTables);
    }
  });

  test("a failed table is dropped so the next read retries it, and the others stay cached", async () => {
    const { calls, fetcher } = countingFetcher();
    const failing = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("-Text")) return Promise.resolve(new Response("", { status: 404 }));
      return fetcher(input, init);
    }) as typeof fetch;
    await expect(fetchAndParseStory("adv_script_a", { fetcher: failing })).rejects.toThrow();
    await Bun.sleep(0);
    expect([...storyTableCache.tables.keys()].some((url) => url.includes("-Text"))).toBe(false);

    calls.length = 0;
    await fetchAndParseStory("adv_script_a", { fetcher });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("-Text");
  });

  test("evicting an in-flight table leaves the callers holding it unaffected", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fetcher } = countingFetcher();
    const slow = (async (input: RequestInfo | URL, init?: RequestInit) => {
      await gate;
      return fetcher(input, init);
    }) as typeof fetch;

    const holder = fetchAndParseStory("adv_script_a", { fetcher: slow });
    await fetchAndParseStory("adv_script_b", { fetcher });
    await fetchAndParseStory("adv_script_c", { fetcher });
    expect(cachedScripts()).toEqual(["adv_script_b", "adv_script_c"]);
    release();
    expect((await holder).scriptName).toBe("adv_script_a");
  });

  test("a stale load failing does not drop the newer entry of the same table", async () => {
    let fail!: () => void;
    const gate = new Promise<void>((resolve) => {
      fail = resolve;
    });
    const stale = (async () => {
      await gate;
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const { calls, fetcher } = countingFetcher();

    const holder = fetchAndParseStory("adv_script_a", { fetcher: stale });
    await fetchAndParseStory("adv_script_b", { fetcher });
    await fetchAndParseStory("adv_script_c", { fetcher });
    await fetchAndParseStory("adv_script_a", { fetcher });
    fail();
    await expect(holder).rejects.toThrow();
    await Bun.sleep(0);

    calls.length = 0;
    await fetchAndParseStory("adv_script_a", { fetcher });
    expect(calls).toHaveLength(0);
  });
});
