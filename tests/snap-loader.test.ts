import { expect, spyOn, test } from "bun:test";
import { loadSnapReplayRuntime } from "../src/lib/chart-data/snap-bridge";

test("relative replay manifests stay under the music-data site directory", async () => {
  const urls: string[] = [];
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async (url) => { urls.push(String(url)); return new Response("unavailable", { status: 503 }); });
  try {
    await expect(loadSnapReplayRuntime("https://example.invalid/music-data", { format: "nnnotes.replay-manifest/1", manifestUrl: "replay/source/manifest.json", sha256: "a".repeat(64) }, { region: "tw", masterVersion: "source", modelCommit: "engine" })).rejects.toThrow("HTTP 503");
    expect(urls).toEqual(["https://example.invalid/music-data/replay/source/manifest.json"]);
  } finally { fetch.mockRestore(); }
});
