import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { extractSiteTarGzip, validateSiteManifest } from "../server/site-artifact";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyBuildEnvironment, assertDataVersion, hashArchive, parseInput, validateManifest,
  type SiteManifest,
} from "../scripts/build-site-release";
import { SUPPORTED_LOCALES } from "../src/config/locales";

const revision = "0123456789abcdef";
const fingerprint = "jp:123:456:ja=789";
const commit = "a".repeat(40);
const key = createHash("sha256").update(`${revision}\n${fingerprint}\n${commit}`).digest("hex").slice(0, 16);
const env = {
  SITE_BUILD_KEY: key,
  SITE_BUILD_REVISION: revision,
  SITE_BUILD_COMMIT: "a".repeat(40),
  SITE_BUILD_FINGERPRINT: fingerprint,
  SITE_PUBLIC_ENV: JSON.stringify({ PUBLIC_ASSET_API: "https://assets.example.test", PUBLIC_EMPTY: "" }),
};
const input = parseInput(env);
function manifest(): SiteManifest {
  return {
    schema: 1, key, revision, commit: env.SITE_BUILD_COMMIT,
    data: { fingerprint, label: "jp@123" }, builtAt: "2026-01-01T00:00:00.000Z",
    locales: [...SUPPORTED_LOCALES], sha256: "b".repeat(64), size: 123, pages: 42,
  };
}

describe("site release inputs", () => {
  test("accepts the agreed protocol without executing a build on import", () => {
    expect(input).toEqual({ key, revision, commit: env.SITE_BUILD_COMMIT, fingerprint, publicEnv: JSON.parse(env.SITE_PUBLIC_ENV) });
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
  test("accepts full locale manifest and optional page count", () => {
    const value = manifest();
    expect(() => validateManifest(value, input)).not.toThrow();
    delete value.pages;
    expect(() => validateManifest(value, input)).not.toThrow();
  });
  test("rejects malformed identity, integrity fields and partial locale builds", () => {
    for (const patch of [
      { schema: 2 }, { key: "0".repeat(16) }, { revision: "0".repeat(16) }, { commit: "b".repeat(40) },
      { data: { fingerprint: "changed", label: "jp" } }, { data: null }, { builtAt: "invalid" },
      { locales: ["zh-CN"] }, { locales: [...SUPPORTED_LOCALES.slice(1), "en-US"] },
      { sha256: "invalid" }, { size: -1 }, { size: 1.5 }, { size: 512 * 1024 * 1024 + 1 }, { pages: -1 },
    ]) expect(() => validateManifest({ ...manifest(), ...patch }, input)).toThrow();
    expect(() => validateManifest(null, input)).toThrow();
  });
  test("hashes exact archive bytes and reports compressed byte length", async () => {
    const directory = await mkdtemp(join(tmpdir(), "site-release-test-"));
    try {
      const bytes = new Uint8Array([0x1f, 0x8b, 0x00, 0xff]);
      const path = join(directory, "site.tar.gz");
      await Bun.write(path, bytes);
      expect(await hashArchive(path)).toEqual({ size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

test("real CI ustar output round-trips through the deployment parser", async () => {
  const root = await mkdtemp(join(tmpdir(), "site-release-roundtrip-"));
  try {
    const source = join(root, "source");
    const target = join(root, "target");
    await mkdir(join(source, "site", "_astro"), { recursive: true });
    await mkdir(join(target, "site"), { recursive: true });
    await Bun.write(join(source, "site", "index.html"), "<!doctype html><title>fixture</title>");
    await Bun.write(join(source, "site", "_astro", "app.js"), "console.log('fixture')");
    const archive = join(root, "site.tar.gz");
    // A Windows drive colon in tar's archive argument is interpreted as a remote host by GNU tar.
    const child = Bun.spawn(["tar", "--format=ustar", "-czf", "../site.tar.gz", "site"], { cwd: source, stdout: "pipe", stderr: "pipe" });
    const errors = await new Response(child.stderr).text();
    expect(await child.exited, errors).toBe(0);
    const produced = { ...manifest(), ...await hashArchive(archive) };
    validateManifest(produced, input);
    expect(validateSiteManifest(produced, { key, revision, commit, data: produced.data }).sha256).toBe(produced.sha256);
    await extractSiteTarGzip(archive, target);
    expect(await Bun.file(join(target, "site", "index.html")).text()).toContain("fixture");
    expect(await Bun.file(join(target, "site", "_astro", "app.js")).text()).toContain("fixture");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("workflow pins source, isolates publication permissions and has no retention deletion", async () => {
  const workflow = await Bun.file(new URL("../.github/workflows/build-site.yml", import.meta.url)).text();
  expect(workflow).toContain("run-name: site-${{ inputs.key }}");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).not.toContain("if: github.ref == 'refs/heads/main'");
  expect(workflow.match(/ref: \$\{\{ inputs.commit \}\}/g)?.length).toBe(2);
  expect(workflow.match(/persist-credentials: false/g)?.length).toBe(2);
  const [build, publish] = workflow.split("\n  publish:");
  expect(build).not.toContain("contents: write");
  expect(publish).toContain("contents: write");
  expect(publish).not.toContain("bun install");
  expect(publish).toContain("SITE_BUILD_MODE: publish");
  expect(workflow).not.toMatch(/gh release delete|delete-release/);
});
