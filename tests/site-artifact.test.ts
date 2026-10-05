import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { LOCALE_PATH_PREFIX, SUPPORTED_LOCALES } from "../src/config/locales";
import { extractSiteTarGzip, installSiteArtifact, SITE_ARTIFACT_LIMITS, validateSiteManifest, validateSiteTarHeader, type SiteManifest } from "../server/site-artifact";

const roots: string[] = [];
const originalFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function staging(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "site-artifact-"));
  roots.push(root);
  return root;
}
function checksum(header: Buffer): Buffer {
  header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return header;
}
function header(path: string, size = 0, type = "0", prefix = ""): Buffer {
  const result = Buffer.alloc(512);
  result.write(path, 0, 100);
  result.write("0000644\0", 100);
  result.write("0000000\0", 108);
  result.write("0000000\0", 116);
  result.write(size.toString(8).padStart(11, "0") + "\0", 124);
  result.write("00000000000\0", 136);
  result.write(type, 156);
  result.write("ustar\0", 257);
  result.write("00", 263);
  result.write(prefix, 345, 155);
  return checksum(result);
}
function entry(path: string, body = "", type = "0"): Buffer {
  const bytes = Buffer.from(body);
  return Buffer.concat([header(path, bytes.length, type), bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
}
function tar(entries: Buffer[]): Buffer {
  return Buffer.concat([...entries, Buffer.alloc(1024)]);
}
function validTar(): Buffer {
  return tar([
    entry("site/", "", "5"), entry("site/_astro/", "", "5"), entry("site/_astro/app.js", "export {};"),
    ...SUPPORTED_LOCALES.map((locale) => entry(`site/${LOCALE_PATH_PREFIX[locale] ? `${LOCALE_PATH_PREFIX[locale]}/` : ""}index.html`, "<!doctype html>")),
  ]);
}
function manifest(bytes: Buffer): SiteManifest {
  return {
    schema: 1, key: "0123456789abcdef", revision: "fedcba9876543210", commit: "a".repeat(40),
    data: { fingerprint: "b".repeat(64), label: "release-1" }, builtAt: "2026-01-01T00:00:00Z",
    locales: [...SUPPORTED_LOCALES], sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, pages: 13,
  };
}
function serve(bytes: Buffer, headers?: Record<string, string>): void {
  globalThis.fetch = (async (_url, options) => {
    expect(options?.credentials).toBe("omit");
    expect(options?.headers).toBeUndefined();
    return new Response(new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 71) controller.enqueue(bytes.subarray(i, i + 71));
        controller.close();
      },
    }), { headers });
  }) as typeof fetch;
}
async function extract(bytes: Buffer, options: Parameters<typeof extractSiteTarGzip>[2] = {}): Promise<void> {
  const root = await staging();
  await mkdir(join(root, "site"));
  const archive = join(root, "site.tar.gz");
  await writeFile(archive, bytes);
  await extractSiteTarGzip(archive, root, options);
}

describe("site manifest", () => {
  test("validates and copies expected identity and all thirteen locales", () => {
    const raw = manifest(gzipSync(validTar()));
    expect(validateSiteManifest(raw, raw)).toEqual(raw);
    expect(validateSiteManifest(raw, raw).locales).not.toBe(raw.locales);
  });
  test("rejects malformed and mismatched fields", () => {
    const expected = manifest(gzipSync(validTar()));
    for (const patch of [
      { schema: 2 }, { key: "wrong" }, { revision: "wrong" }, { commit: "wrong" },
      { data: { ...expected.data, fingerprint: "wrong" } }, { data: { ...expected.data, label: "wrong" } },
      { builtAt: "2026-02-30T00:00:00Z" }, { builtAt: "9999-01-01T00:00:00Z" }, { builtAt: "not a date" },
      { locales: expected.locales.slice(1) }, { locales: expected.locales.map(() => "en-US") },
      { sha256: "bad" }, { size: Infinity }, { size: 0 }, { size: -1 }, { size: 1.5 },
      { size: SITE_ARTIFACT_LIMITS.compressedBytes + 1 }, { pages: -1 },
    ]) expect(() => validateSiteManifest({ ...expected, ...patch }, expected)).toThrow();
    for (const value of [null, [], "bad", {}]) expect(() => validateSiteManifest(value, expected)).toThrow();
  });
});

describe("streaming artifact install", () => {
  test("installs valid gzip ustar with every locale and assets", async () => {
    const bytes = gzipSync(validTar());
    serve(bytes, { "content-length": String(bytes.length) });
    const root = await staging();
    await installSiteArtifact("https://github.com/owner/repo/releases/download/test/site.tar.gz", root, manifest(bytes));
    expect(await readFile(join(root, "site/en/index.html"), "utf8")).toBe("<!doctype html>");
    expect(await lstat(join(root, "site.tar.gz")).catch(() => null)).toBeNull();
  });
  test("rejects incorrect hash, short/oversized bodies and claimed length, cleaning only its own files", async () => {
    const bytes = gzipSync(validTar());
    for (const scenario of ["hash", "short", "long", "header"] as const) {
      const root = await staging();
      await writeFile(join(root, "keep"), "existing");
      const m = manifest(bytes);
      if (scenario === "hash") m.sha256 = "0".repeat(64);
      if (scenario === "short") m.size++;
      if (scenario === "long") m.size--;
      serve(bytes, scenario === "header" ? { "content-length": "1" } : undefined);
      await expect(installSiteArtifact("https://example.com/site.tar.gz", root, m)).rejects.toThrow();
      expect(await readFile(join(root, "keep"), "utf8")).toBe("existing");
      expect(await lstat(join(root, "site")).catch(() => null)).toBeNull();
      expect(await lstat(join(root, "site.tar.gz")).catch(() => null)).toBeNull();
    }
  });
  test("cleans partial extraction without writing traversal outside staging", async () => {
    const root = await staging();
    await writeFile(join(root, "keep"), "original");
    const bytes = gzipSync(tar([entry("site/partial", "safe"), entry("site/../keep", "overwrite")]));
    serve(bytes);
    await expect(installSiteArtifact("https://example.com/site.tar.gz", root, manifest(bytes))).rejects.toThrow("Unsafe tar path");
    expect(await readFile(join(root, "keep"), "utf8")).toBe("original");
    expect(await lstat(join(root, "site")).catch(() => null)).toBeNull();
    expect(await lstat(join(root, "site.tar.gz")).catch(() => null)).toBeNull();
  });
  test("aborts an in-flight download and removes partial files", async () => {
    const bytes = gzipSync(validTar());
    globalThis.fetch = (async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 10));
        options?.signal?.addEventListener("abort", () => controller.error(options.signal?.reason), { once: true });
      },
    }))) as typeof fetch;
    const root = await staging();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("cancelled download")), 40);
    try {
      await expect(installSiteArtifact("https://example.com/site.tar.gz", root, manifest(bytes), { signal: controller.signal })).rejects.toThrow();
    } finally {
      clearTimeout(timer);
    }
    expect(await lstat(join(root, "site")).catch(() => null)).toBeNull();
    expect(await lstat(join(root, "site.tar.gz")).catch(() => null)).toBeNull();
  });
  test("does not replace an existing site or archive", async () => {
    const bytes = gzipSync(validTar());
    serve(bytes);
    for (const existing of ["site", "site.tar.gz"]) {
      const root = await staging();
      await writeFile(join(root, existing), "untouched");
      await expect(installSiteArtifact("https://example.com/site.tar.gz", root, manifest(bytes))).rejects.toThrow();
      expect(await readFile(join(root, existing), "utf8")).toBe("untouched");
    }
  });
  test("rejects missing locale homepages and assets", async () => {
    for (const contents of [tar([entry("site/index.html", "home")]), tar(SUPPORTED_LOCALES.map((locale) => entry(`site/${LOCALE_PATH_PREFIX[locale] ? `${LOCALE_PATH_PREFIX[locale]}/` : ""}index.html`, "home")))]) {
      const bytes = gzipSync(contents);
      serve(bytes);
      const root = await staging();
      await expect(installSiteArtifact("https://example.com/site.tar.gz", root, manifest(bytes))).rejects.toThrow();
      expect(await lstat(join(root, "site")).catch(() => null)).toBeNull();
    }
  });
  test("rejects insecure URLs, credential URLs, unsafe redirects and aborted operations", async () => {
    const bytes = gzipSync(validTar());
    serve(bytes);
    for (const url of ["http://example.com/site.tar.gz", "https://token@example.com/site.tar.gz"]) {
      await expect(installSiteArtifact(url, await staging(), manifest(bytes))).rejects.toThrow("HTTPS");
    }
    globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: "http://example.com/unsafe" } })) as typeof fetch;
    await expect(installSiteArtifact("https://example.com/site.tar.gz", await staging(), manifest(bytes))).rejects.toThrow("HTTPS");
    await expect(installSiteArtifact("https://example.com/site.tar.gz", await staging(), manifest(bytes), { signal: AbortSignal.abort() })).rejects.toThrow();
  });
});

describe("strict bounded ustar extraction", () => {
  test("rejects traversal and ambiguous filesystem paths", async () => {
    for (const path of ["../escape", "/site/escape", "site/../../escape", "site/../escape", "site//bad", "site/./bad", "site/C:bad", "site/evil\\path", "site/NUL", "site/name.", "site/name ", "other/file"]) {
      await expect(extract(gzipSync(tar([entry(path, "evil")])))).rejects.toThrow("Unsafe tar path");
    }
  });
  test("rejects symlinks, hardlinks, devices, FIFO, sparse, PAX and GNU longname", async () => {
    for (const type of ["1", "2", "3", "4", "6", "S", "x", "g", "L", "K"]) {
      await expect(extract(gzipSync(tar([entry("site/evil", "", type)])))).rejects.toThrow("Unsupported tar entry type");
    }
  });
  test("supports ustar prefix paths and leading dot without enabling traversal", () => {
    expect(validateSiteTarHeader(header("index.html", 0, "0", "site/en")).path).toBe("site/en/index.html");
    expect(validateSiteTarHeader(header("./site/", 0, "5")).path).toBe("site");
    expect(() => validateSiteTarHeader(header("file", 0, "0", "site/.."))).toThrow();
  });
  test("rejects duplicate paths, case aliases and file/directory collisions", async () => {
    for (const entries of [
      [entry("site/file"), entry("site/file")],
      [entry("site/File"), entry("site/file")],
      [entry("site/file"), entry("site/file/nested")],
      [entry("site/file/nested"), entry("site/file")],
    ]) await expect(extract(gzipSync(tar(entries)))).rejects.toThrow();
  });
  test("enforces expanded bytes, declared file sizes and entry limits", async () => {
    await expect(extract(gzipSync(tar([entry("site/bomb", "x".repeat(8192))])), { maxExpandedBytes: 2048 })).rejects.toThrow("size limit");
    await expect(extract(gzipSync(tar([header("site/bomb", 8192)])), { maxFileBytes: 1024 })).rejects.toThrow("size limit");
    await expect(extract(gzipSync(tar([entry("site/a"), entry("site/b")])) , { maxEntries: 1 })).rejects.toThrow("entry count");
  });
  test("rejects invalid checksum, truncated tar, extra tar data and corrupt gzip CRC", async () => {
    const badHeader = header("site/file");
    badHeader[0] = 0;
    await expect(extract(gzipSync(tar([badHeader])))).rejects.toThrow("checksum");
    await expect(extract(gzipSync(entry("site/file")))).rejects.toThrow("end marker");
    await expect(extract(gzipSync(Buffer.concat([validTar(), entry("site/after")])))).rejects.toThrow("end marker");
    const bytes = gzipSync(validTar());
    bytes[bytes.length - 8] = bytes[bytes.length - 8]! ^ 1;
    await expect(extract(bytes)).rejects.toThrow();
    await expect(extract(bytes.subarray(0, bytes.length - 10))).rejects.toThrow();
  });
});
