import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { assetConfig } from "../src/config/assets";
import { loadRecognitionBundle, recognitionDigest } from "../src/lib/recognition/client";

const runtimeDir = path.join(import.meta.dir, "..", "public", "recognition");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
const digest = (bytes: Uint8Array) => recognitionDigest(bytes.slice().buffer);

test("the default configuration reads the bundle pointer from the recognition site and serves the Worker itself", () => {
  const { site, pointerUrl, workerUrl } = assetConfig.recognition;
  if (!process.env.PUBLIC_RECOGNITION_SITE) expect(site).toBe("https://storage.bdon.moe/moenotes");
  expect(pointerUrl).toBe(`${site}/recognition/current.json`);
  expect(workerUrl).toBe("/recognition/recognition-worker.js");
  for (const file of ["recognition-worker.js", "pipeline.mjs", "ort-runtime-loader.js"])
    expect(statSync(path.join(runtimeDir, file)).isFile()).toBe(true);
});

test("the site carries only its own recognition code, notices and license texts", () => {
  const shipped = files(runtimeDir).map(file => path.relative(runtimeDir, file).split(path.sep).join("/"));
  expect(shipped.filter(file => !/\.(js|mjs|md|txt)$/.test(file))).toEqual([]);
  expect(shipped.filter(file => !file.startsWith("licenses/")).reduce((total, file) => total + statSync(path.join(runtimeDir, file)).size, 0)).toBeLessThan(100_000);
});

/** A synthetic recognition site: pointer -> bundle manifest -> gallery and models manifests. */
async function syntheticSite() {
  const site = "https://recognition.example.invalid/moenotes";
  const gallery = encode({ format: "moenotes.embedding-gallery/1", galleryId: "a".repeat(64), catalog: [{ region: "hk-tw-mo", masterVersion: "synthetic/1" }],
    cards: [{ kind: "member", id: "1", identity: { assetId: "1", characterIds: ["1"], rarity: 2, cardType: 5 }, regions: ["hk-tw-mo"], levelLimit: 60 }], embeddings: {} });
  const models = encode({ format: "moenotes.recognition-models/1" });
  const record = async (bytes: Uint8Array) => { const sha256 = await digest(bytes); return { path: `assets/${sha256}.json`, sha256, bytes: bytes.length, contentType: "application/json" }; };
  const bundle = encode({ format: "moenotes.recognition-bundle/2", entries: { gallery: "gallery/manifest.json", models: "models/manifest.json" },
    files: { "gallery/manifest.json": await record(gallery), "models/manifest.json": await record(models) } });
  const bundleSha = await digest(bundle), gallerySha = await digest(gallery), modelsSha = await digest(models);
  const objects = new Map<string, Uint8Array>([
    [`${site}/recognition/current.json`, encode({ format: "moenotes.recognition-pointer/1", bundle: { sha256: bundleSha, bytes: bundle.length } })],
    [`${site}/assets/${bundleSha}.json`, bundle],
    [`${site}/assets/${gallerySha}.json`, gallery],
    [`${site}/assets/${modelsSha}.json`, models],
  ]);
  return { site, objects, bundleSha, galleryUrl: `${site}/assets/${gallerySha}.json`, gallerySha, modelsSha,
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

test("the loader follows the pointer to verified content-addressed manifests and hands the models manifest to the Worker", async () => {
  const fixture = await syntheticSite();
  await withFetch(fixture.objects, async requests => {
    const loaded = await loadRecognitionBundle(fixture.config, new AbortController().signal);
    expect(loaded.bundleSha256).toBe(fixture.bundleSha);
    expect(loaded.manifest.cards.map(card => `${card.kind}:${card.id}`)).toEqual(["member:1"]);
    expect(loaded.configuration).toEqual({ workerUrl: fixture.config.workerUrl, galleryUrl: fixture.galleryUrl, gallerySha256: fixture.gallerySha,
      modelsUrl: `${fixture.site}/assets/${fixture.modelsSha}.json`, modelsSha256: fixture.modelsSha });
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
  const replaceBundle = async (objects: Map<string, Uint8Array>, value: unknown) => {
    const bundle = encode(value), sha256 = await digest(bundle);
    objects.set(fixture.config.pointerUrl, encode({ format: "moenotes.recognition-pointer/1", bundle: { sha256, bytes: bundle.length } }));
    objects.set(`${fixture.site}/assets/${sha256}.json`, bundle);
  };
  const gallery = { path: `assets/${fixture.gallerySha}.json`, sha256: fixture.gallerySha, bytes: fixture.objects.get(fixture.galleryUrl)!.length, contentType: "application/json" };
  await variant(objects => { objects.delete(fixture.config.pointerUrl); }, { code: "manifestFetch", detail: "HTTP 404" });
  await variant(objects => { objects.set(fixture.config.pointerUrl, encode({ format: "moenotes.recognition-pointer/0", bundle: { sha256: fixture.bundleSha, bytes: 1 } })); }, { code: "manifestFormat" });
  await variant(objects => { objects.set(`${fixture.site}/assets/${fixture.bundleSha}.json`, encode({ tampered: true })); }, { code: "manifestHash" });
  await variant(objects => { objects.set(fixture.galleryUrl, encode({ tampered: true })); }, { code: "manifestHash" });
  await variant(objects => replaceBundle(objects, { format: "moenotes.recognition-bundle/2", entries: { gallery: "gallery/manifest.json", models: "models/manifest.json" },
    files: { "gallery/manifest.json": { ...gallery, path: `assets/${"0".repeat(64)}.json` }, "models/manifest.json": gallery } }), { code: "manifestFormat" });
  await variant(objects => replaceBundle(objects, { format: "moenotes.recognition-bundle/2", entries: { gallery: "gallery/manifest.json" },
    files: { "gallery/manifest.json": gallery } }), { code: "manifestFormat" });
  await variant(objects => replaceBundle(objects, { format: "moenotes.recognition-bundle/1", entries: { gallery: "gallery/manifest.json", models: "gallery/manifest.json" },
    files: { "gallery/manifest.json": gallery } }), { code: "manifestFormat" });
  await expect(loadRecognitionBundle({ ...fixture.config, pointerUrl: "" }, signal)).rejects.toMatchObject({ code: "configuration" });
});

test("the Worker loads its pipeline and the hash-locked runtime loader from its own directory", () => {
  const worker = readFileSync(path.join(runtimeDir, "recognition-worker.js"), "utf8");
  expect(worker).toContain("new URL('./ort-runtime-loader.js', self.location.href)");
  expect(worker).toContain("import('./pipeline.mjs')");
  expect(readFileSync(path.join(runtimeDir, "pipeline.mjs"), "utf8")).toContain("'moenotes.recognition-models/1'");
});
