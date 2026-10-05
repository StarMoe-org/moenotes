import { expect, test } from "bun:test";
import path from "node:path";

// The Worker's pure pipeline steps on synthetic inputs.
const core = await import(path.join(import.meta.dir, "..", "public", "recognition", "pipeline.mjs"));
type Tensor = { data: Float32Array; dims: number[] };

const file = (digit: string, ext = "onnx") => ({ file: `${digit.repeat(64)}.${ext}`, sha256: digit.repeat(64), bytes: 10 });
function models() {
  const classifier = (input: number[], classes: number, confidence: number) => ({ model: file("4"), input, classes, edge: 2, confidence, margin: 0.5 });
  return {
    format: "moenotes.recognition-models/1",
    runtime: { glue: file("1", "js"), module: file("2", "mjs"), wasm: file("3", "wasm") },
    tiles: { member: [224, 294], snap: [326, 184] },
    locator: { model: file("5"), classes: ["member", "snap"], longEdge: 640, multiple: 32, pad: 128, stride: 4, threshold: 0.4, maxPeaks: 400, maxDetections: 200, overlap: 0.5, minVisible: 0.5 },
    encoders: { member: { model: file("6"), input: [160, 128], inset: 6, similarity: 0.88, margin: 0.15 }, snap: { model: file("7"), input: [128, 224], inset: 6, similarity: 0.81, margin: 0.16 } },
    fields: {
      member: { ...classifier([56, 144], 106, 0.9994), left: -6, bottom: 56, width: 144, height: 56 },
      snap: { ...classifier([56, 144], 101, 0.995), left: -6, bottom: 56, width: 144, height: 56 },
    },
    ranks: {
      member: { ...classifier([48, 48], 6, 0.9998), center: [194.5, 267.2], size: 96, icon: [64, 59.6078] },
      snap: { ...classifier([48, 48], 6, 0.995), center: [306.1, 153.8], size: 96, icon: [64, 59.6078] },
    },
  };
}
function gradient(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) rgba[(y * width + x) * 4 + c] = c === 3 ? 255 : (x * 37 + y * 91 + c * 53) % 256;
  return rgba;
}

test("canonical JSON sorts keys at every depth and keeps JSON number spelling", () => {
  expect(core.canonicalJson({ b: [1, { d: 0.5, c: "x" }], a: null })).toBe('{"a":null,"b":[1,{"c":"x","d":0.5}]}');
});

test("the models manifest names every stage's model and parameters", () => {
  expect(() => core.parseModels(models())).not.toThrow();
  expect(() => core.parseModels({ ...models(), format: "moenotes.recognition-models/0" })).toThrow("invalidModelsFormat");
  const broken = [
    (m: ReturnType<typeof models>) => { m.locator.classes = ["snap", "member"]; },
    (m: ReturnType<typeof models>) => { m.encoders.snap.model = { ...m.encoders.snap.model, file: `${"8".repeat(64)}.onnx` }; },
    (m: ReturnType<typeof models>) => { m.fields.member.confidence = 1.5; },
    (m: ReturnType<typeof models>) => { (m.ranks.snap as { icon: unknown }).icon = [64]; },
    (m: ReturnType<typeof models>) => { delete (m.runtime as Record<string, unknown>).wasm; },
  ];
  for (const change of broken) { const m = models(); change(m); expect(() => core.parseModels(m)).toThrow("invalidModelsManifest"); }
});

test("the gallery's embeddings belong to the manifest's encoders and have the declared shape", () => {
  const m = models();
  const section = (kind: "member" | "snap", cards: number[]) => ({ encoder: { ...m.encoders[kind].model }, dimension: 2, cards,
    buffer: { file: `${"9".repeat(64)}.bin`, sha256: "9".repeat(64), bytes: 8 * cards.length, shape: [cards.length, 2] } });
  const gallery = { format: "moenotes.embedding-gallery/1", galleryId: "a".repeat(64), catalog: [],
    cards: [{ kind: "member", id: "1", levelLimit: 60 }, { kind: "snap", id: "2", levelLimit: 40 }], embeddings: { member: section("member", [0]), snap: section("snap", [1]) } };
  expect(() => core.parseGallery(gallery, m)).not.toThrow();
  expect(() => core.parseGallery({ ...gallery, embeddings: { ...gallery.embeddings, snap: section("snap", [0]) } }, m)).toThrow("invalidGallery");
  expect(() => core.parseGallery({ ...gallery, embeddings: { ...gallery.embeddings, member: { ...section("member", [0]), encoder: file("7") } } }, m)).toThrow("galleryEncoderMismatch");
  expect(() => core.parseGallery({ ...gallery, cards: [...gallery.cards, { kind: "member", id: "1", levelLimit: 60 }] }, m)).toThrow("invalidGallery");
  expect(core.embeddingRows(gallery.embeddings.member, new Float32Array([0.6, 0.8]).buffer)).toEqual(new Float32Array([0.6, 0.8]));
  expect(() => core.embeddingRows(gallery.embeddings.member, new Float32Array([NaN, 1]).buffer)).toThrow("invalidGalleryBuffer");
});

test("screenshots shrink by area averaging exactly as OpenCV's INTER_AREA", () => {
  const rgba = gradient(8, 6);
  // cv2.resize(rgb, size, interpolation=cv2.INTER_AREA) on the same RGB pixels.
  expect([...core.resizeRgb(rgba, 8, 6, 3, 2)]).toEqual([102, 123, 123, 124, 146, 145, 115, 136, 136, 119, 140, 140, 110, 130, 130, 132, 153, 121]);
  expect([...core.resizeRgb(rgba, 8, 6, 5, 4)]).toEqual([44, 97, 150, 100, 153, 142, 160, 170, 180, 145, 145, 91, 83, 72, 125, 166, 155, 101, 93, 103, 92, 110, 121, 131,
    96, 138, 191, 141, 194, 140, 61, 114, 167, 117, 159, 159, 134, 144, 112, 152, 162, 87, 100, 89, 142, 183, 172, 118, 110, 110, 109, 85, 95, 148, 102, 155, 166, 158, 211, 93]);
  expect([...core.resizeRgb(rgba, 8, 6, 8, 6)]).toEqual([...rgba].filter((_, index) => index % 4 !== 3));
});

test("the locator input keeps the aspect ratio on a grey canvas padded to the stride multiple", () => {
  const locator = models().locator;
  expect(core.letterboxGeometry(1920, 1080, locator)).toMatchObject({ resizedWidth: 640, resizedHeight: 360, inputWidth: 640, inputHeight: 384 });
  expect(core.letterboxGeometry(2532, 1170, locator)).toMatchObject({ resizedWidth: 640, resizedHeight: 296, inputHeight: 320 });
  const input = core.letterbox(new Uint8ClampedArray(1280 * 720 * 4).fill(255), 1280, 720, locator);
  expect(input.dims).toEqual([1, 3, 384, 640]); expect(input.scale).toBe(0.5);
  expect(input.data[359 * 640]).toBe(1); expect(input.data[360 * 640]).toBeCloseTo(128 / 255, 6);
});

test("locator peaks become tiles in screenshot pixels; clipped and overlapping tiles are dropped", () => {
  const locator = models().locator, h = 8, w = 8, plane = h * w;
  const heatmap: Tensor = { data: new Float32Array(2 * plane), dims: [1, 2, h, w] };
  const size: Tensor = { data: new Float32Array(2 * plane).fill(20), dims: [1, 2, h, w] };
  const offset: Tensor = { data: new Float32Array(2 * plane).fill(0.5), dims: [1, 2, h, w] };
  heatmap.data[2 * w + 2] = 0.9; // member at cell (2, 2)
  heatmap.data[2 * w + 3] = 0.8; // its neighbour: not a local maximum
  heatmap.data[plane + 2 * w + 4] = 0.7; // snap overlapping the member by more than half of the smaller box
  heatmap.data[plane + 6 * w + 6] = 0.6; // snap at cell (6, 6)
  heatmap.data[0] = 0.95; // a tile mostly outside the screenshot
  heatmap.data[7 * w] = 0.3; // below the threshold
  const tiles = core.decodeLocator(heatmap, size, offset, locator, { scale: 0.5, imageWidth: 64, imageHeight: 64 });
  expect(tiles.map((tile: { kind: string; bbox: number[] }) => [tile.kind, tile.bbox])).toEqual([["member", [0, 0, 40, 40]], ["snap", [32, 32, 40, 40]]]);
  expect(tiles[0].score).toBeCloseTo(0.9, 6);
  expect(() => core.decodeLocator(heatmap, { ...size, dims: [1, 2, h, w + 1] }, offset, locator, { scale: 1, imageWidth: 64, imageHeight: 64 })).toThrow("invalidLocatorOutput");
  const order = core.readingOrder([{ bbox: [200, 10, 100, 100] }, { bbox: [0, 300, 100, 100] }, { bbox: [0, 30, 100, 100] }]);
  expect(order.map((item: { bbox: number[] }) => item.bbox[0] + ":" + item.bbox[1])).toEqual(["0:30", "200:10", "0:300"]);
});

test("crop regions follow each kind's tile layout", () => {
  const m = models(), tile = [100, 50, 448, 588];
  expect(core.artWindow(m, "member", tile)).toEqual([112, 62, 424, 564]);
  expect(core.fieldRegion(m, "member", tile)).toEqual([88, 526, 288, 112]);
  expect(core.rankRegion(m, "member", tile)).toEqual([393, 488.4, 192, 192]);
  expect(core.insideImage(core.fieldRegion(m, "member", tile), 1000, 1000, 2)).toBe(true);
  expect(core.insideImage([1, 10, 10, 10], 1000, 1000, 2)).toBe(false);
});

test("crops sample bilinearly at output pixel origins, with a black or replicated border", () => {
  const rgba = gradient(4, 4), at = (x: number, y: number, c: number) => rgba[(y * 4 + x) * 4 + c]! / 255;
  const same = core.sampleRect(rgba, 4, 4, [0, 0, 4, 4], 4, 4, "zero");
  expect(same[1 * 4 + 2]).toBeCloseTo(at(2, 1, 0), 6); expect(same[16 + 3 * 4]).toBeCloseTo(at(0, 3, 1), 6);
  const half = core.sampleRect(rgba, 4, 4, [0.5, 0, 1, 1], 1, 1, "zero");
  expect(half[0]).toBeCloseTo(Math.round((rgba[0]! + rgba[4]!) / 2) / 255, 6);
  const outside = [-2, -2, 1, 1];
  expect(core.sampleRect(rgba, 4, 4, outside, 1, 1, "zero")[0]).toBe(0);
  expect(core.sampleRect(rgba, 4, 4, outside, 1, 1, "replicate")[0]).toBeCloseTo(at(0, 0, 0), 6);
});

test("identity needs both the similarity and the lead over the second nearest reference of the allowed rows", () => {
  const references = new Float32Array([1, 0, 0.8, 0.6, 0, 1]), rule = { similarity: 0.88, margin: 0.15 };
  const matches = core.nearest(references, 2, new Float32Array([1, 0]), [0, 1, 2]);
  expect(matches.map((match: { row: number }) => match.row)).toEqual([0, 1, 2]);
  const accepted = core.decideIdentity(matches, rule);
  expect(accepted).toMatchObject({ accepted: true, row: 0, similarity: 1 }); expect(accepted.margin).toBeCloseTo(0.2, 6);
  expect(core.decideIdentity(core.nearest(references, 2, new Float32Array([0.9, Math.sqrt(1 - 0.81)]), [0, 1, 2]), rule)).toMatchObject({ accepted: false, row: 1 });
  expect(core.decideIdentity(core.nearest(references, 2, new Float32Array([-1, 0]), [0, 1, 2]), rule).accepted).toBe(false);
  expect(core.decideIdentity(core.nearest(references, 2, new Float32Array([1, 0]), [1, 2]), rule)).toMatchObject({ accepted: false, row: 1 });
  expect(core.decideIdentity(core.nearest(references, 2, new Float32Array([1, 0]), [0]), rule)).toMatchObject({ accepted: true, margin: 2 });
  expect(core.decideIdentity([], rule)).toMatchObject({ accepted: false, row: null });
});

test("field and rank readers accept only a confident class within the card's limits", () => {
  const rule = { confidence: 0.99, margin: 0.5 }, logits = (classes: number, top: number) => Array.from({ length: classes }, (_, k) => k === top ? 20 : 0);
  expect(core.decideField("member", logits(106, 42), rule, 60)).toMatchObject({ displayMode: "level", level: { value: 42 }, awake: { value: null, reason: "notShown" } });
  expect(core.decideField("member", logits(106, 103), rule, 60)).toMatchObject({ displayMode: "training", level: { value: null }, awake: { value: 3 } });
  expect(core.decideField("member", logits(106, 0), rule, 60)).toMatchObject({ displayMode: "other", level: { value: null, reason: "otherParameter" } });
  expect(core.decideField("member", logits(106, 61), rule, 60)).toMatchObject({ displayMode: "unknown", level: { reason: "aboveLevelLimit" } });
  expect(core.decideField("member", logits(106, 61), rule, Infinity)).toMatchObject({ displayMode: "level", level: { value: 61 } });
  expect(core.decideField("snap", [...logits(101, 30).slice(0, 30), 20, ...logits(101, 30).slice(31)].map((v, k) => k === 31 ? 20 : v), rule, 60)).toMatchObject({ displayMode: "unknown", level: { reason: "ambiguous" } });
  expect(core.decideRank(logits(6, 4), rule)).toMatchObject({ value: 4 });
  expect(core.decideRank(logits(6, 0), rule)).toMatchObject({ value: null, reason: "noIcon" });
  expect(() => core.softmax([0, NaN])).toThrow("nonFiniteLogits");
});
