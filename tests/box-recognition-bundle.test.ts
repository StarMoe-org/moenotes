import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assetConfig } from "../src/config/assets";
import galleryArtIdentity from "../src/lib/recognition/gallery-art-identity.json";

const jp = assetConfig.boxRecognition.jp;
const bundleUrl = jp.workerUrl.replace(/\/browser\/recognition-worker\.js$/, "");
const bundleDir = path.join(import.meta.dir, "..", "public", ...bundleUrl.split("/").filter(Boolean));
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const core = await import(path.join(bundleDir, "browser", "detector-core.mjs")) as {
  artworkRecord: (card: unknown) => unknown;
  fitArtwork: (rgba: Uint8ClampedArray, width: number, height: number, box: number[], outWidth: number, outHeight: number) => Uint8ClampedArray;
};

test("the default JP configuration names the bundled gallery, field reader and art identity directory", () => {
  const galleryBytes = readFileSync(path.join(bundleDir, "assets", "gallery-manifest.json"));
  expect(sha(galleryBytes)).toBe(jp.manifestSha256);
  expect(jp.manifestUrl).toBe(`${bundleUrl}/assets/gallery-manifest.json`);
  expect(sha(readFileSync(path.join(bundleDir, "fields", "field-manifest.json")))).toBe(jp.fieldManifestSha256);
  expect(jp.artworkBaseUrl).toBe(`${assetConfig.api}/`);
  const gallery = JSON.parse(galleryBytes.toString("utf8")) as { galleryId: string; format: string };
  const { galleryId, ...content } = gallery;
  expect(sha(canonical(content))).toBe(galleryId);
  expect(galleryArtIdentity.galleryId).toBe(galleryId);
  expect(galleryArtIdentity.galleryManifestSha256).toBe(jp.manifestSha256);
});

test("the bundle directory is named by the canonical digest of its file list", () => {
  const manifest = JSON.parse(readFileSync(path.join(bundleDir, "bundle-manifest.json"), "utf8")) as { bundleSHA: string; files: { path: string; sha256: string; bytes: number }[] };
  const actual = files(bundleDir).map(file => path.relative(bundleDir, file).split(path.sep).join("/")).filter(file => file !== "bundle-manifest.json").sort();
  expect(manifest.files.map(file => file.path)).toEqual(actual);
  for (const file of manifest.files) {
    const bytes = readFileSync(path.join(bundleDir, ...file.path.split("/")));
    expect({ path: file.path, sha256: sha(bytes), bytes: bytes.length }).toEqual(file);
  }
  expect(sha(canonical(manifest.files))).toBe(manifest.bundleSHA);
  expect(path.basename(bundleDir)).toBe(manifest.bundleSHA);
  expect(actual.every(file => !/\.(png|webp|jpe?g)$/.test(file))).toBe(true);
});

test("every gallery card references an immutable asset-service file with its size, digest and derivation", () => {
  const gallery = JSON.parse(readFileSync(path.join(bundleDir, "assets", "gallery-manifest.json"), "utf8")) as {
    cards: { kind: string; id: string; width: number; height: number; art: { file: string; assetPath: string; bytes: number; sha256: string; width: number; height: number; derive: { method: string; box?: number[] } } }[];
  };
  const identity = new Map(galleryArtIdentity.cards.map(card => [`${card.kind}:${card.id}`, card]));
  for (const card of gallery.cards) {
    expect(() => core.artworkRecord(card)).not.toThrow();
    expect(identity.get(`${card.kind}:${card.id}`)?.artSha256).toBe(card.art.sha256);
    expect(card.art.file).toMatch(/^files\/[a-f0-9]{64}$/);
    if (card.kind === "member") {
      expect(card.art.assetPath).toBe(`zh-Hans/MemberCard/${identity.get(`member:${card.id}`)!.assetId}/member_thumbnail/square.webp`);
      expect([card.width, card.height, card.art.derive.method]).toEqual([212, 282, "fit"]);
      const [left, top, right, bottom] = card.art.derive.box!;
      expect(top).toBe(0); expect(bottom).toBe(card.art.height);
      expect((right! - left!) / (bottom! - top!)).toBeCloseTo(212 / 282, 12);
      expect(left! + right!).toBeCloseTo(card.art.width, 9);
    } else {
      expect(card.art.assetPath).toBe(`zh-Hans/SupportCard/${identity.get(`snap:${card.id}`)!.assetId}/snap_thumbnail/snap_thumbnail.webp`);
      expect([card.art.width, card.art.height, card.art.derive.method]).toEqual([card.width, card.height, "direct"]);
    }
  }
  const member = gallery.cards.find(card => card.kind === "member")!;
  for (const art of [{ ...member.art, file: "../x.webp" }, { ...member.art, sha256: "x" }, { ...member.art, derive: { method: "fit", box: [0, 0, 999, 1], filter: "lanczos3" } }, { ...member.art, derive: { method: "stretch" } }])
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
