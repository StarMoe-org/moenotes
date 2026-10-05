import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config, type ServerConfig } from "../server/config";
import { BuildStore } from "../server/builds";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
test("CI credential failure retains live site and never begins a local Astro build", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "moenotes-ci-store-")); dirs.push(dataDir);
  const settings: ServerConfig = { ...config, buildMode: "github", githubToken: undefined,
    githubCommit: "a".repeat(40), dataDir, buildsDir: join(dataDir, "builds"), logsDir: join(dataDir, "logs"),
    statePath: join(dataDir, "state.json"), fetchCacheDir: join(dataDir, "cache"),
    // An attempted local build cannot succeed, even if the parent has installed dependencies.
    appDir: join(dataDir, "no-app"),
  };
  const store = new BuildStore(settings);
  await store.load();
  const record = { id: "previous", key: "old", revision: "old", data: "old", builtAt: new Date().toISOString(), durationMs: 1 };
  store.current = record;
  await expect(store.build("0123456789abcdef", "abcdef0123456789", { fingerprint: "tw:1:1", label: "tw@1" })).rejects.toThrow("MOENOTES_GITHUB_TOKEN");
  expect(store.current).toBe(record);
  expect(store.progress).toBeNull();
  expect(await readdir(settings.buildsDir)).toEqual([]);
  const logs = await readdir(settings.logsDir);
  expect(logs).toContain("latest.log");
  const text = await Bun.file(join(settings.logsDir, logs.find(name => name.endsWith("-github.log"))!)).text();
  expect(text).not.toContain("astro.mjs");
});
