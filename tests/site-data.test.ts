import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { assetExportLag, buildKey, describeData, sourceDigest, sourceRevision, type AssetManifest } from "../scripts/site-data";

const serverDir = fileURLToPath(new URL("../server", import.meta.url));

async function go(...args: string[]): Promise<string> {
  const child = Bun.spawn(["go", "run", "./cmd/moenotes", ...args], { cwd: serverDir, stdout: "pipe", stderr: "pipe" });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(code, err).toBe(0);
  return out.trim();
}

describe("site data identity (shared with the Go server)", () => {
  test("describes regions in byte order with missing fields left empty", () => {
    const manifest: AssetManifest = {
      regions: {
        tw: { resource_version: "1.0.1", master_version: "m1", locales: { "zh-Hant": { snapshot: "b" }, en: { snapshot: "a" } } },
        jp: { master_version: "m2", locales: { ja: {} } },
      },
    };
    // Same expectation as server/internal/upstream TestDescribe.
    expect(describeData(manifest)).toEqual({ fingerprint: "jp::m2:ja=;tw:1.0.1:m1:en=a,zh-Hant=b", label: "jp@? tw@1.0.1" });
    expect(() => describeData({})).toThrow("no released region");
  });

  test("export lag only counts released regions and tracked metadata", async () => {
    const masterdata = async () => ({ regions: { "hk-tw-mo": { version: "m2" }, jp: { version: "j1" } } });
    const behind: AssetManifest = { regions: { tw: { master_version: "m1", metadata_region: "hk-tw-mo" } } };
    expect(await assetExportLag(behind, "x", masterdata)).toBe("MasterData hk-tw-mo is at m2, assets exported m1");
    const current: AssetManifest = { regions: {
      tw: { master_version: "m2", metadata_region: "hk-tw-mo" }, en: { master_version: "x", metadata_region: "" }, jp: { master_version: "j1" },
    } };
    expect(await assetExportLag(current, "x", masterdata)).toBeNull();
    expect(await assetExportLag({ ...current, pending: { tw: {}, kr: {} } }, "x", masterdata)).toBe("asset release still running for tw");
  });

  test("source revision mixes in PUBLIC_* settings only, independent of order", () => {
    const base = sourceRevision("d", { PATH: "/bin" });
    expect(sourceRevision("d", { PATH: "/usr/bin", MOENOTES_GITHUB_TOKEN: "x" })).toBe(base);
    expect(sourceRevision("d", { PUBLIC_ASSET_API: "https://x" })).not.toBe(base);
    expect(sourceRevision("d", { PUBLIC_B: "2", PUBLIC_A: "1" })).toBe(sourceRevision("d", { PUBLIC_A: "1", PUBLIC_B: "2" }));
    expect(base).toMatch(/^[a-f0-9]{16}$/);
    expect(buildKey(base, "tw:1", "a".repeat(40))).toMatch(/^[a-f0-9]{16}$/);
  });

  test("the Go server computes the same source digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "site-digest-"));
    try {
      for (const name of ["next.config.ts", "postcss.config.mjs", "package.json", "bun.lock", "tsconfig.json"]) await Bun.write(join(root, name), name);
      await mkdir(join(root, "src", "a", "b"), { recursive: true });
      await Bun.write(join(root, "src", "a", "b", "Z.ts"), "z");
      await Bun.write(join(root, "src", "a", "B.ts"), "upper case sorts first in byte order");
      await Bun.write(join(root, "public", "x.txt"), "public");
      await Bun.write(join(root, "server", "ignored.go"), "not a site source");
      expect(await go("source-digest", root)).toBe(await sourceDigest(root));
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 120_000);

  test("the Go server's embedded site config is generated from src/config", async () => {
    const child = Bun.spawn([process.execPath, "scripts/generate-runtime-config.ts", "--check"], { stdout: "pipe", stderr: "pipe" });
    expect(await child.exited, await new Response(child.stderr).text()).toBe(0);
  });
});
