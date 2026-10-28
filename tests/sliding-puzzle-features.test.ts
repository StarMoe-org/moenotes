import { describe, expect, test } from "bun:test";
import { comparePuzzleFeatures, extractPuzzleFeature, puzzlePixelBytes, type PuzzlePixelImage } from "../src/lib/sliding-puzzle/features";

function raster(width: number, height: number, color: (x: number, y: number) => readonly number[]): PuzzlePixelImage {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const values = color(x, y), offset = (y * width + x) * 4;
    rgba.set([values[0]!, values[1]!, values[2]!, values[3] ?? 255], offset);
  }
  return { width, height, rgba };
}

describe("puzzle image features", () => {
  test("area sampling covers each pixel without leaking neighboring tiles", () => {
    const image = raster(53, 41, (x, y) => x >= 7 && x < 46 && y >= 9 && y < 33 ? [30, 70, 150] : [255, 0, 0]);
    const feature = extractPuzzleFeature(image, { x: 7, y: 9, width: 39, height: 24 });
    expect(feature.mean[0]).toBeCloseTo(30 / 255, 12);
    expect(feature.mean[1]).toBeCloseTo(70 / 255, 12);
    expect(feature.mean[2]).toBeCloseTo(150 / 255, 12);
    expect(feature.contrast).toBeLessThan(1e-12);
    expect(feature.texture.every(value => value === 0)).toBe(true);
  });
  test("is stable across proportional resizing and affine brightness changes", () => {
    const a = raster(48, 48, (x, y) => [30 + x * 3, 40 + y * 2, 50 + ((x * 2 + y) % 30) * 3]);
    const b = raster(144, 144, (x, y) => [30 + Math.floor(x / 3) * 3, 40 + Math.floor(y / 3) * 2, 50 + ((Math.floor(x / 3) * 2 + Math.floor(y / 3)) % 30) * 3].map(v => 20 + v * 0.8));
    const pair = comparePuzzleFeatures(extractPuzzleFeature(a, { x: 0, y: 0, width: 48, height: 48 }), extractPuzzleFeature(b, { x: 0, y: 0, width: 144, height: 144 }));
    expect(pair.textureCorrelation).toBeGreaterThan(0.999);
    expect(pair.edgeCorrelation).toBeGreaterThan(0.999);
    expect(pair.cost).toBeLessThan(0.01);
  });
  test("keeps constant and transparent images finite and marks their lack of information", () => {
    for (const alpha of [0, 128, 255]) {
      const image = raster(1, 1, () => [30, 40, 50, alpha]);
      const feature = extractPuzzleFeature(image, { x: 0, y: 0, width: 1, height: 1 });
      const pair = comparePuzzleFeatures(feature, feature);
      expect(Number.isFinite(pair.cost)).toBe(true);
      expect(feature.contrast).toBeLessThan(1e-12);
      expect(feature.coverage).toBeCloseTo(alpha / 255, 10);
      expect(pair.cost).toBeGreaterThan(0.4);
    }
  });
  test("supports offset RGBA views and snapshots immutable feature arrays", () => {
    const storage = new Uint8Array(80).fill(255), rgba = storage.subarray(8, 72);
    const image = { width: 4, height: 4, rgba };
    expect(puzzlePixelBytes(image).byteLength).toBe(64);
    const feature = extractPuzzleFeature(image, { x: 0, y: 0, width: 4, height: 4 });
    rgba.fill(0);
    for (const value of feature.mean) expect(value).toBeCloseTo(1, 12);
    expect(Object.isFrozen(feature)).toBe(true);
    expect(Object.isFrozen(feature.texture)).toBe(true);
    expect(Object.isFrozen(feature.edges)).toBe(true);
  });
  test("rejects mismatched buffers, huge images and invalid source rectangles", () => {
    for (const image of [{ width: 0, height: 1, rgba: new ArrayBuffer(0) }, { width: 2, height: 2, rgba: new ArrayBuffer(4) }, { width: 5000, height: 5000, rgba: new ArrayBuffer(0) }]) expect(() => puzzlePixelBytes(image)).toThrow(RangeError);
    const image = raster(4, 4, () => [1, 2, 3]);
    for (const rect of [{ x: -1, y: 0, width: 3, height: 3 }, { x: 0.5, y: 0, width: 3, height: 3 }, { x: 0, y: 0, width: 0, height: 3 }, { x: 3, y: 0, width: 3, height: 3 }]) expect(() => extractPuzzleFeature(image, rect)).toThrow(RangeError);
  });
});
