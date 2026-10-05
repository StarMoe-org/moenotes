import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GithubBuild, publicBuildEnvironment, releaseAssetUrl, type GithubBuildOptions } from "../server/github-build";
import { SUPPORTED_LOCALES } from "../src/config/locales";
import { buildKey } from "../server/upstream";

const key = "0123456789abcdef";
const commit = "a".repeat(40);
const expected = { key, revision: "abcdef0123456789", commit, data: { fingerprint: "tw:1:1:en=x", label: "tw@1" } };
const repo = "StarMoe-org/moenotes";
const base = `https://github.com/${repo}/releases/download/site-${key}/`;
const release = { tag_name: `site-${key}`, draft: false, assets: ["site.tar.gz", "site-manifest.json"].map(name => ({ name, browser_download_url: base + name })) };
const manifest = { schema: 1, ...expected, builtAt: "2026-10-05T12:00:00.000Z", locales: [...SUPPORTED_LOCALES], sha256: "b".repeat(64), size: 1024, pages: 123 };
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function options(): Promise<GithubBuildOptions> {
  const root = await mkdtemp(join(tmpdir(), "moenotes-github-test-")); roots.push(root);
  return { repo, ref: "main", commit, token: "test-secret", pendingPath: join(root, "pending.json"), pollMs: 1, timeoutMs: 1000 };
}
function mock(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) => handler(String(url), init)) as typeof fetch;
}
const json = (value: unknown) => Response.json(value);
const missing = () => new Response(null, { status: 404 });

describe("GitHub site builds", () => {
  test("only sends PUBLIC_* values and bounds inputs", () => {
    expect(JSON.parse(publicBuildEnvironment({ PUBLIC_TITLE: "demo", MOENOTES_GITHUB_TOKEN: "secret", PRIVATE: "x" }))).toEqual({ PUBLIC_TITLE: "demo" });
    expect(() => publicBuildEnvironment({ "PUBLIC_bad-key": "x" })).toThrow();
    expect(() => publicBuildEnvironment({ PUBLIC_X: "x".repeat(8193) })).toThrow();
  });
  test("CI key binds commit while local key remains compatible", () => {
    expect(buildKey(expected.revision, expected.data, commit)).not.toBe(buildKey(expected.revision, expected.data, "c".repeat(40)));
    expect(buildKey(expected.revision, expected.data)).toBe(new Bun.CryptoHasher("sha256").update(`${expected.revision}\n${expected.data.fingerprint}`).digest("hex").slice(0, 16));
  });
  test("refuses unexpected asset origins and paths", () => {
    expect(releaseAssetUrl(repo, `site-${key}`, "site.tar.gz", base + "site.tar.gz")).toBe(base + "site.tar.gz");
    expect(() => releaseAssetUrl(repo, `site-${key}`, "site.tar.gz", "https://evil.invalid/file")).toThrow();
  });
  test("reuses published artifacts without dispatch and never sends credentials to asset host", async () => {
    const calls: string[] = [];
    const client = new GithubBuild(await options(), mock((url, init) => {
      calls.push(url);
      if (url.startsWith(base)) { expect(new Headers(init?.headers).has("authorization")).toBe(false); return json(manifest); }
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-secret");
      return json(release);
    }));
    expect((await client.wait(expected, () => {}, new AbortController().signal)).archiveUrl).toBe(base + "site.tar.gz");
    expect(calls.some(url => url.includes("dispatches"))).toBe(false);
  });
  test("missing token fails closed without network or local build", async () => {
    const config = await options(); delete config.token;
    let calls = 0;
    await expect(new GithubBuild(config, mock(() => { calls++; return missing(); })).wait(expected, () => {}, new AbortController().signal)).rejects.toThrow("MOENOTES_GITHUB_TOKEN");
    expect(calls).toBe(0);
  });
  test("dispatch persists first and completed failure clears journal for later retry", async () => {
    const config = await options(); let dispatches = 0;
    const client = new GithubBuild(config, mock(async (url, init) => {
      if (url.includes("/releases/tags/")) return missing();
      if (url.includes("/dispatches")) {
        expect(await Bun.file(config.pendingPath).exists()).toBe(true);
        const body = JSON.parse(String(init?.body));
        expect(body.inputs.commit).toBe(commit); expect(body.inputs.key).toBe(key);
        expect(body.inputs.public_env).not.toContain("test-secret");
        dispatches++; return new Response(null, { status: 204 });
      }
      return json({ workflow_runs: dispatches ? [{ id: 12, display_title: `site-${key}`, status: "completed", conclusion: "failure", created_at: new Date().toISOString() }] : [] });
    }));
    await expect(client.wait(expected, () => {}, new AbortController().signal)).rejects.toThrow("finished (failure)");
    expect(dispatches).toBe(1); expect(await Bun.file(config.pendingPath).exists()).toBe(false);
  });
  test("restart attaches to persisted run rather than dispatching another", async () => {
    const config = await options();
    await Bun.write(config.pendingPath, JSON.stringify({ key, dispatchedAt: Date.now(), runId: 77 }));
    let polls = 0; let dispatches = 0;
    const client = new GithubBuild(config, mock((url, init) => {
      if (init?.method === "POST") dispatches++;
      if (url.includes("/releases/tags/")) return ++polls >= 3 ? json(release) : missing();
      if (url.startsWith(base)) return json(manifest);
      return json({ id: 77, display_title: `site-${key}`, status: "in_progress", conclusion: null });
    }));
    await client.wait(expected, () => {}, new AbortController().signal);
    expect(dispatches).toBe(0); expect(await Bun.file(config.pendingPath).exists()).toBe(false);
  });
  test("API failure does not become artifact-missing and trigger a build", async () => {
    let posts = 0;
    const client = new GithubBuild(await options(), mock((_url, init) => { if (init?.method === "POST") posts++; return new Response("secret", { status: 403 }); }));
    await expect(client.wait(expected, () => {}, new AbortController().signal)).rejects.toThrow("HTTP 403"); expect(posts).toBe(0);
  });
  test("cancellation stops a waiting request", async () => {
    const controller = new AbortController(); controller.abort(new Error("shutdown"));
    const client = new GithubBuild(await options(), mock((_url, init) => { init?.signal?.throwIfAborted(); return missing(); }));
    await expect(client.wait(expected, () => {}, controller.signal)).rejects.toThrow("shutdown");
  });
});
