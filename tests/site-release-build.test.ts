import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyBuildEnvironment, assertDataVersion, command, hashFile, lookupRelease, measuredCommand, parseInput, partName,
  releaseComplete, validateManifest, PART_BYTES, type SiteManifest,
} from "../scripts/build-site-release";
import { buildKey } from "../scripts/site-data";
import { SUPPORTED_LOCALES } from "../src/config/locales";

const revision = "0123456789abcdef";
const fingerprint = "jp:123:456:ja=789";
const commit = "a".repeat(40);
const key = createHash("sha256").update(`${revision}\n${fingerprint}\n${commit}`).digest("hex").slice(0, 16);
const env = {
  SITE_BUILD_KEY: key,
  SITE_BUILD_REVISION: revision,
  SITE_BUILD_COMMIT: commit,
  SITE_BUILD_FINGERPRINT: fingerprint,
  SITE_PUBLIC_ENV: JSON.stringify({ PUBLIC_ASSET_API: "https://assets.example.test", PUBLIC_EMPTY: "" }),
};
const input = parseInput(env);
function manifest(): SiteManifest {
  return {
    schema: 2, key, revision, commit,
    data: { fingerprint, label: "jp@123" }, builtAt: "2026-01-01T00:00:00.000Z",
    locales: [...SUPPORTED_LOCALES], format: "tar+zstd", size: 30, sha256: "b".repeat(64),
    parts: [{ name: partName(0), size: 20, sha256: "c".repeat(64) }, { name: partName(1), size: 10, sha256: "d".repeat(64) }],
    files: 50, expandedBytes: 4096, pages: 42,
  };
}

describe("site release inputs", () => {
  test("accepts the agreed protocol without executing a build on import", () => {
    expect(input).toEqual({ key, revision, commit, fingerprint, publicEnv: JSON.parse(env.SITE_PUBLIC_ENV) });
    expect(buildKey(revision, fingerprint, commit)).toBe(key);
  });
  for (const field of ["SITE_BUILD_KEY", "SITE_BUILD_REVISION", "SITE_BUILD_COMMIT"] as const) {
    test(`rejects injection, uppercase and malformed ${field}`, () => {
      for (const value of ["$(touch injected)", "A".repeat(env[field].length), env[field] + "\n", "", "--help"]) {
        expect(() => parseInput({ ...env, [field]: value })).toThrow();
      }
    });
  }
  test("rejects a key inconsistent with its content", () => {
    expect(() => parseInput({ ...env, SITE_BUILD_KEY: "0".repeat(16) })).toThrow("does not match");
  });
  test("accepts shell metacharacters as inert public values", () => {
    const raw = "$(touch /tmp/injected);\n`id`\"";
    expect(parseInput({ ...env, SITE_PUBLIC_ENV: JSON.stringify({ PUBLIC_TEXT: raw }) }).publicEnv.PUBLIC_TEXT).toBe(raw);
  });
  test("requires a bounded string-only PUBLIC_* object", () => {
    for (const value of ["", "null", "[]", "1", '"hello"', '{"GH_TOKEN":"x"}', '{"__proto__":{}}',
      '{"PUBLIC_TEST":1}', '{"PUBLIC_TEST":null}', '{"PUBLIC_TEST":"\\u0000"}',
      JSON.stringify({ PUBLIC_X: "x".repeat(8193) }),
      JSON.stringify(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`PUBLIC_${i}`, ""]))),
      " ".repeat(65_537), JSON.stringify({ ["PUBLIC_" + "x".repeat(121)]: "x" })]) {
      expect(() => parseInput({ ...env, SITE_PUBLIC_ENV: value })).toThrow();
    }
  });
  test("rejects unbounded or control-character fingerprints", () => {
    for (const value of ["", "x\ny", "x\0y", "x".repeat(16_385)]) {
      expect(() => parseInput({ ...env, SITE_BUILD_FINGERPRINT: value })).toThrow();
    }
  });
  test("clears inherited public settings and credentials before applying input", () => {
    const target: Record<string, string | undefined> = {
      PUBLIC_STALE: "stale", PUBLIC_ASSET_API: "old", GH_TOKEN: "secret", GITHUB_TOKEN: "secret",
      AWS_SECRET_ACCESS_KEY: "secret", PATH: "/usr/bin", MOENOTES_BUILD_LOCALES: "core",
      MOENOTES_REVISION: "old", MOENOTES_ASSET_INTERNAL: "http://private",
      MOENOTES_MASTERDATA_DIR: "/old", MOENOTES_SERVERS: "tw", MOENOTES_FETCH_CACHE_DIR: "/cache/fetch",
    };
    applyBuildEnvironment(input, target);
    expect(target.PUBLIC_STALE).toBeUndefined();
    expect(target.GH_TOKEN).toBeUndefined();
    expect(target.GITHUB_TOKEN).toBeUndefined();
    expect(target.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(target.PUBLIC_ASSET_API).toBe(input.publicEnv.PUBLIC_ASSET_API);
    expect(target.PUBLIC_EMPTY).toBe("");
    expect(target.MOENOTES_BUILD_LOCALES).toBe("all");
    expect(target.MOENOTES_REVISION).toBe(input.commit);
    expect(target.MOENOTES_ASSET_INTERNAL).toBeUndefined();
    expect(target.MOENOTES_MASTERDATA_DIR).toBeUndefined();
    expect(target.MOENOTES_SERVERS).toBeUndefined();
    expect(target.MOENOTES_FETCH_CACHE_DIR).toBe("/cache/fetch");
    expect(target.PATH).toBe("/usr/bin");
  });
});

describe("site release integrity", () => {
  test("rejects drift and any non-null export lag", () => {
    expect(() => assertDataVersion(input, { fingerprint }, null)).not.toThrow();
    expect(() => assertDataVersion(input, { fingerprint: "changed" }, null)).toThrow();
    expect(() => assertDataVersion(input, { fingerprint }, "pending jp")).toThrow();
    expect(() => assertDataVersion(input, { fingerprint }, "")).toThrow();
  });
  test("accepts a complete multi-part manifest", () => {
    expect(() => validateManifest(manifest(), input)).not.toThrow();
  });
  test("rejects malformed identity, integrity fields, parts and partial locale builds", () => {
    const part = (patch: object) => ({ parts: [{ ...manifest().parts[0]!, ...patch }, manifest().parts[1]!] });
    for (const patch of [
      { schema: 1 }, { key: "0".repeat(16) }, { revision: "0".repeat(16) }, { commit: "b".repeat(40) },
      { data: { fingerprint: "changed", label: "jp" } }, { data: null }, { builtAt: "invalid" },
      { locales: ["zh-CN"] }, { locales: [...SUPPORTED_LOCALES.slice(1), "en-US"] }, { format: "tar+gzip" },
      { sha256: "invalid" }, { size: 31 }, { parts: [] }, part({ name: "site.tar.gz" }), part({ size: PART_BYTES + 1 }),
      part({ size: 5 }), part({ sha256: "x" }), { files: 0 }, { expandedBytes: -1 }, { pages: -1 }, { pages: 51 },
      { extra: true },
    ]) expect(() => validateManifest({ ...manifest(), ...patch }, input)).toThrow();
    expect(() => validateManifest(null, input)).toThrow();
  });
  test("a published Release is complete only with the manifest and every part at its size", () => {
    const uploaded = (name: string, size: number) => ({ name, size, state: "uploaded" });
    const assets = [uploaded("site-manifest.json", 900), uploaded(partName(0), 20), uploaded(partName(1), 10)];
    expect(releaseComplete({ assets }, manifest())).toBe(true);
    expect(releaseComplete({ assets: assets.slice(0, 2) }, manifest())).toBe(false);
    expect(releaseComplete({ assets: [assets[0]!, uploaded(partName(0), 19), assets[2]!] }, manifest())).toBe(false);
    expect(releaseComplete({ assets: [uploaded("site.tar.gz", 1), uploaded("site-manifest.json", 900)] })).toBe(true);
    expect(releaseComplete({ assets: [uploaded("site.tar.gz", 1)] })).toBe(false);
  });
  test("hashes exact file bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "site-release-test-"));
    try {
      const bytes = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]);
      const path = join(directory, "part");
      await Bun.write(path, bytes);
      expect(await hashFile(path)).toEqual({ size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      await expect(hashFile(path, 3)).rejects.toThrow("exceeds");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe("build subprocess reporting", () => {
  test("captures machine output while preserving real child failures", async () => {
    expect(await command([process.execPath, "-e", "process.stdout.write('ok')"], true)).toBe("ok");
    await expect(command([process.execPath, "-e", "process.stderr.write('child failed');process.exit(7)"], true)).rejects.toThrow("failed (7): child failed");
  });
  test("inherited build output does not turn warnings into failures or swallow exit codes", async () => {
    await expect(command([process.execPath, "-e", "process.stderr.write('test warning\\n')"])).resolves.toBe("");
    await expect(command([process.execPath, "-e", "process.exit(7)"])).rejects.toThrow("failed (7)");
  });
  // Production runs GNU time on Linux; skip when /usr/bin/time is unavailable.
  test.skipIf(process.platform !== "linux" || !existsSync("/usr/bin/time"))("GNU time saves complete RSS and exit status without a stderr pipe", async () => {
    const root = await mkdtemp(join(tmpdir(), "site-time-test-"));
    try {
      const report = join(root, "metrics.txt");
      await measuredCommand([process.execPath, "-e", "process.stderr.write('measured warning\\n')"], report);
      const success = await Bun.file(report).text();
      expect(success).toContain("Maximum resident set size (kbytes):");
      expect(success).toContain("Exit status: 0");
      await expect(measuredCommand([process.execPath, "-e", "process.exit(7)"], report)).rejects.toThrow("failed (7)");
      expect(await Bun.file(report).text()).toContain("Exit status: 7");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
describe("draft Release lookup", () => {
  const tag = `site-${key}`;
  const draft = { id: 123, tag_name: tag, draft: true, prerelease: true, target_commitish: commit, assets: [], html_url: "https://github.com/example/repo/releases/tag/untagged-temporary" };
  test("finds an existing draft when the by-tag endpoint returns 404", async () => {
    const calls: string[] = [];
    const found = await lookupRelease(tag, true, async path => { calls.push(path); return path.startsWith("releases/tags/") ? null : [draft]; });
    expect(found).toEqual(draft);
    expect(calls).toEqual([`releases/tags/${tag}`, "releases?per_page=100&page=1"]);
  });
  test("read-only inspection does not need draft permissions", async () => {
    const calls: string[] = [];
    expect(await lookupRelease(tag, false, async path => { calls.push(path); return null; })).toBeNull();
    expect(calls).toEqual([`releases/tags/${tag}`]);
  });
  test("returns published releases directly without listing or overwriting", async () => {
    const published = { ...draft, draft: false };
    const calls: string[] = [];
    expect(await lookupRelease(tag, true, async path => { calls.push(path); return published; })).toEqual(published);
    expect(calls.length).toBe(1);
  });
  test("paginates older drafts and matches tag_name rather than title", async () => {
    expect(await lookupRelease(tag, true, async path => {
      if (path.startsWith("releases/tags/")) return null;
      if (path.endsWith("page=1")) return Array.from({ length: 100 }, (_, i) => ({ ...draft, tag_name: `other-${i}`, name: tag }));
      return [draft];
    })).toEqual(draft);
  });
  test("missing releases return null but failed draft listings propagate", async () => {
    expect(await lookupRelease(tag, true, async path => path.startsWith("releases/tags/") ? null : [])).toBeNull();
    await expect(lookupRelease(tag, true, async path => {
      if (path.startsWith("releases/tags/")) return null;
      throw new Error("HTTP 403");
    })).rejects.toThrow("HTTP 403");
    await expect(lookupRelease(tag, true, async () => null)).rejects.toThrow("Unable to list");
  });
});
test("workflow pins source, packs with Go, isolates publication permissions and has no retention deletion", async () => {
  const workflow = await Bun.file(new URL("../.github/workflows/build-site.yml", import.meta.url)).text();
  expect(workflow).toContain("run-name: site-${{ inputs.key }}");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).not.toContain("if: github.ref == 'refs/heads/main'");
  expect(workflow.match(/ref: \$\{\{ inputs.commit \}\}/g)?.length).toBe(2);
  expect(workflow.match(/persist-credentials: false/g)?.length).toBe(2);
  const [build, publish] = workflow.split("\n  publish:");
  expect(build).not.toContain("contents: write");
  expect(build).toContain("go build -trimpath -o ../.site-release/bin/moenotes ./cmd/moenotes");
  expect(build).toContain(".site-release/parts/");
  expect(build).not.toContain("site.tar.gz");
  expect(publish).toContain("contents: write");
  expect(publish).not.toContain("bun install");
  expect(publish).not.toContain("setup-go");
  expect(publish).toContain("SITE_BUILD_MODE: publish");
  expect(workflow).not.toMatch(/gh release delete|delete-release/);
});
