import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { assetConfig } from "../src/config/assets";
import { loadRecognitionBundle, recognitionDigest } from "../src/lib/recognition/client";

const runtimeDir = path.join(import.meta.dir, "..", "public", "recognition");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const core = await import(path.join(runtimeDir, "detector-core.mjs")) as {
  artworkRecord: (card: unknown) => unknown;
  fitArtwork: (rgba: Uint8ClampedArray, width: number, height: number, box: number[], outWidth: number, outHeight: number) => Uint8ClampedArray;
};
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
const digest = (bytes: Uint8Array) => recognitionDigest(bytes.slice().buffer);

test("the default configuration reads the bundle pointer from the recognition site and serves the Worker itself", () => {
  const { site, pointerUrl, workerUrl } = assetConfig.recognition;
  if (!process.env.PUBLIC_RECOGNITION_SITE) expect(site).toBe("https://storage.bdon.moe/moenotes");
  expect(pointerUrl).toBe(`${site}/recognition/current.json`);
  expect(workerUrl).toBe("/recognition/recognition-worker.js");
  for (const file of ["recognition-worker.js", "detector-core.mjs", "field-runtime-loader.js", "field-reader.js"])
    expect(statSync(path.join(runtimeDir, file)).isFile()).toBe(true);
});

test("the site carries only its own recognition code, notices and license texts", () => {
  const shipped = files(runtimeDir).map(file => path.relative(runtimeDir, file).split(path.sep).join("/"));
  expect(shipped.filter(file => !/\.(js|mjs|md|txt)$/.test(file))).toEqual([]);
  expect(shipped.filter(file => !file.startsWith("licenses/")).reduce((total, file) => total + statSync(path.join(runtimeDir, file)).size, 0)).toBeLessThan(100_000);
});

/** A synthetic recognition site: pointer -> bundle manifest -> gallery and field manifests. */
async function syntheticSite() {
  const site = "https://recognition.example.invalid/moenotes";
  const art = "1".repeat(64);
  const gallery = encode({ format: "ournotes.browser-feature-gallery/3", galleryId: "a".repeat(64), catalog: [{ region: "hk-tw-mo", masterVersion: "synthetic/1" }],
    cards: [{ kind: "member", id: "1", width: 212, height: 282, identity: { assetId: "1", characterIds: ["1"], rarity: 2, cardType: 5 }, regions: ["hk-tw-mo"],
      art: { file: `${art}.webp`, sha256: art, bytes: 10, width: 384, height: 384, derive: { method: "fit", box: [0, 0, 384, 384], filter: "lanczos3" } } }] });
  const fields = encode({ format: "ournotes.browser-cultivation-assets/2", runtime: {}, model: {} });
  const record = async (bytes: Uint8Array) => { const sha256 = await digest(bytes); return { path: `assets/${sha256}.json`, sha256, bytes: bytes.length, contentType: "application/json" }; };
  const bundle = encode({ format: "moenotes.recognition-bundle/1", entries: { gallery: "gallery/manifest.json", fields: "fields/manifest.json" },
    files: { "gallery/manifest.json": await record(gallery), "fields/manifest.json": await record(fields), "art/member/1.webp": { path: `assets/${art}.webp`, sha256: art, bytes: 10, contentType: "image/webp" } } });
  const bundleSha = await digest(bundle);
  const objects = new Map<string, Uint8Array>([
    [`${site}/recognition/current.json`, encode({ format: "moenotes.recognition-pointer/1", bundle: { sha256: bundleSha, bytes: bundle.length } })],
    [`${site}/assets/${bundleSha}.json`, bundle],
    [`${site}/assets/${await digest(gallery)}.json`, gallery],
    [`${site}/assets/${await digest(fields)}.json`, fields],
  ]);
  return { site, objects, bundleSha, galleryUrl: `${site}/assets/${await digest(gallery)}.json`, gallerySha: await digest(gallery), fieldsSha: await digest(fields),
    config: { site, pointerUrl: `${site}/recognition/current.json`, workerUrl: "https://moenotes.example.invalid/recognition/recognition-worker.js" } };
}

async function withFetch(objects: Map<string, Uint8Array>, run: (requests: { url: string; init: RequestInit | undefined }[]) => Promise<void>) {
  const saved = globalThis.fetch, requests: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init });
    const body = objects.get(url);
    return body ? new Response(body.slice()) : new Response("missing", { status: 404 });
  }) as typeof fetch;
  try { await run(requests); } finally { globalThis.fetch = saved; }
}

test("the loader follows the pointer to verified content-addressed manifests", async () => {
  const fixture = await syntheticSite();
  await withFetch(fixture.objects, async requests => {
    const loaded = await loadRecognitionBundle(fixture.config, new AbortController().signal);
    expect(loaded.bundleSha256).toBe(fixture.bundleSha);
    expect(loaded.manifest.cards.map(card => `${card.kind}:${card.id}`)).toEqual(["member:1"]);
    expect(loaded.configuration).toEqual({ workerUrl: fixture.config.workerUrl, manifestUrl: fixture.galleryUrl, manifestSha256: fixture.gallerySha,
      fieldManifestUrl: `${fixture.site}/assets/${fixture.fieldsSha}.json`, fieldManifestSha256: fixture.fieldsSha });
    expect(requests.map(request => request.url)).toEqual([fixture.config.pointerUrl, `${fixture.site}/assets/${fixture.bundleSha}.json`, fixture.galleryUrl]);
    expect(requests[0]!.init?.cache).toBe("no-cache");
    expect(requests.every(request => request.init?.credentials === "omit")).toBe(true);
  });
});

test("pointer, bundle and gallery failures remain distinguishable", async () => {
  const signal = new AbortController().signal;
  const fixture = await syntheticSite();
  const variant = async (change: (objects: Map<string, Uint8Array>) => void | Promise<void>, expected: object) => {
    const objects = new Map(fixture.objects); await change(objects);
    await withFetch(objects, async () => { await expect(loadRecognitionBundle(fixture.config, signal)).rejects.toMatchObject(expected); });
  };
  await variant(objects => { objects.delete(fixture.config.pointerUrl); }, { code: "manifestFetch", detail: "HTTP 404" });
  await variant(objects => { objects.set(fixture.config.pointerUrl, encode({ format: "moenotes.recognition-pointer/0", bundle: { sha256: fixture.bundleSha, bytes: 1 } })); }, { code: "manifestFormat" });
  await variant(objects => { objects.set(`${fixture.site}/assets/${fixture.bundleSha}.json`, encode({ tampered: true })); }, { code: "manifestHash" });
  await variant(objects => { objects.set(fixture.galleryUrl, encode({ tampered: true })); }, { code: "manifestHash" });
  await variant(async objects => {
    const bundle = encode({ format: "moenotes.recognition-bundle/1", entries: { gallery: "gallery/manifest.json" },
      files: { "gallery/manifest.json": { path: `assets/${"0".repeat(64)}.json`, sha256: fixture.gallerySha, bytes: 1, contentType: "application/json" } } });
    const sha256 = await digest(bundle);
    objects.set(fixture.config.pointerUrl, encode({ format: "moenotes.recognition-pointer/1", bundle: { sha256, bytes: bundle.length } }));
    objects.set(`${fixture.site}/assets/${sha256}.json`, bundle);
  }, { code: "manifestFormat" });
  await expect(loadRecognitionBundle({ ...fixture.config, pointerUrl: "" }, signal)).rejects.toMatchObject({ code: "configuration" });
});

test("gallery artwork is a content-addressed sibling file with its size, digest and derivation", () => {
  const sha256 = "2".repeat(64);
  const member = { kind: "member", id: "1", width: 212, height: 282,
    art: { file: `${sha256}.webp`, sha256, bytes: 10, width: 384, height: 384, derive: { method: "fit", box: [47.65957446808511, 0, 336.3404255319149, 384], filter: "lanczos3" } } };
  expect(() => core.artworkRecord(member)).not.toThrow();
  expect(() => core.artworkRecord({ ...member, kind: "snap", width: 512, height: 288, art: { ...member.art, width: 512, height: 288, derive: { method: "direct" } } })).not.toThrow();
  for (const art of [{ ...member.art, file: `files/${sha256}` }, { ...member.art, file: `${"3".repeat(64)}.webp` }, { ...member.art, file: "../x.webp" },
    { ...member.art, sha256: "x" }, { ...member.art, derive: { method: "fit", box: [0, 0, 999, 1], filter: "lanczos3" } }, { ...member.art, derive: { method: "stretch" } }])
    expect(() => core.artworkRecord({ ...member, art })).toThrow("invalidGalleryArtwork");
});

test("artwork crops resample like Pillow's Lanczos resize with a box", () => {
  const width = 8, height = 6, source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) source[(y * width + x) * 4 + c] = c === 3 ? 255 : (x * 37 + y * 91 + c * 53) % 256;
  const rgb = (rgba: Uint8ClampedArray) => [...rgba].filter((_, index) => index % 4 !== 3);
  // Image.resize((4, 3), Image.Resampling.LANCZOS, box=(1.25, 0.5, 6.75, 5.5)) on the same RGB pixels.
  expect(rgb(core.fitArtwork(source, width, height, [1.25, 0.5, 6.75, 5.5], 4, 3))).toEqual([111, 137, 128, 141, 187, 98, 155, 114, 156, 94, 117, 135, 101, 89, 132, 80, 131, 159, 124, 175, 90, 166, 154, 173, 138, 161, 145, 141, 100, 104, 68, 114, 135, 118, 144, 122]);
  expect(rgb(core.fitArtwork(source, width, height, [0, 0, width, height], width, height))).toEqual(rgb(source));
  const output = core.fitArtwork(source, width, height, [0.5, 0, 7.5, 6], 5, 9);
  expect(output.length).toBe(5 * 9 * 4);
  expect([...output].filter((_, index) => index % 4 === 3).every(alpha => alpha === 255)).toBe(true);
  expect(rgb(output).slice(0, 12)).toEqual([15, 64, 114, 68, 115, 198, 109, 191, 255, 218, 234, 82]);
});

test("the Worker reads only content-addressed bundle files and loads the field modules from its own directory", () => {
  const worker = readFileSync(path.join(runtimeDir, "recognition-worker.js"), "utf8");
  expect(worker).toContain("new URL('./field-runtime-loader.js',self.location.href)");
  expect(worker).toContain("ournotes.browser-cultivation-assets/2");
});
