import { expect, spyOn, test } from "bun:test";
import { loadSnapReplayRuntime } from "../src/lib/chart-data/snap-bridge";
import type { SnapReplayManifest } from "../src/lib/chart-data/snap-types";

test("relative replay manifests stay under the music-data site directory", async () => {
  const urls: string[] = [];
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async (url) => { urls.push(String(url)); return new Response("unavailable", { status: 503 }); });
  try {
    await expect(loadSnapReplayRuntime("https://example.invalid/music-data", { format: "nnnotes.replay-manifest/1", manifestUrl: "replay/source/manifest.json", sha256: "a".repeat(64) }, { region: "tw", masterVersion: "source", modelCommit: "engine" })).rejects.toThrow("HTTP 503");
    expect(urls).toEqual(["https://example.invalid/music-data/replay/source/manifest.json"]);
  } finally { fetch.mockRestore(); }
});

test("card labels start loading while the replay resources are still pending", async () => {
  const entry = (url: string) => ({ url, sha256: "b".repeat(64) });
  const manifest: SnapReplayManifest = { format: "nnnotes.replay-manifest/1", deckData: entry("deck.json"), snapLabels: entry("labels.json"),
    engine: { model: { commit: "engine" }, requestFormat: "ournotes.replay/1", js: entry("engine.js"), wasm: entry("engine.wasm") } };
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
  const requested: string[] = [];
  let release!: () => void, primaryReady!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const primary = new Promise<void>(resolve => { primaryReady = resolve; });
  const fetch = spyOn(globalThis, "fetch").mockImplementation(async url => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("manifest.json")) return new Response(bytes);
    requested.push(path);
    if (requested.length === 3) primaryReady();
    await pending;
    return new Response("unavailable", { status: 503 });
  });
  const task = loadSnapReplayRuntime("https://example.invalid/music-data", { format: manifest.format, manifestUrl: "source/manifest.json", sha256 },
    { region: "tw", masterVersion: "source", modelCommit: "engine" });
  try {
    await primary;
    expect(requested).toContain("/music-data/source/labels.json");
  } finally {
    release();
    await expect(task).rejects.toThrow("HTTP 503");
    fetch.mockRestore();
  }
});
