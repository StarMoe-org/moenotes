import { describe, expect, test } from "bun:test";
import { matchPuzzleFragments, type PuzzleFragmentMatchInput } from "../src/lib/sliding-puzzle/matching";
import { confirmPuzzleObservation, puzzleCropFields } from "../src/lib/sliding-puzzle/crop";
import { PUZZLE_SIZES, analyzePuzzleBoard, createPuzzleBoard, type PuzzleSize } from "../src/lib/sliding-puzzle/model";
import type { PuzzlePixelImage } from "../src/lib/sliding-puzzle/features";

const raster = (width: number, height: number): PuzzlePixelImage & { rgba: Uint8Array } => ({ width, height, rgba: new Uint8Array(width * height * 4).fill(255) });
const bounds = (width: number, height: number, size: number, index: number) => {
  const row = Math.floor(index / size), column = index % size;
  const x = Math.round(column * width / size), y = Math.round(row * height / size);
  return { x, y, width: Math.round((column + 1) * width / size) - x, height: Math.round((row + 1) * height / size) - y };
};

/** Smooth random color patches: no digits, hidden IDs or text overlays in the images. */
function artwork(size: PuzzleSize, seed = 1, duplicate = false): PuzzlePixelImage & { rgba: Uint8Array } {
  const image = raster(size * 37 + 3, size * 35 + 5);
  for (let index = 0; index < size * size; index++) {
    let random = ((duplicate ? 1 : index + 1) * 83492791 ^ seed * 32452843) >>> 0;
    const vertices = Array.from({ length: 5 * 5 * 3 }, () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return 25 + random % 205; });
    const rect = bounds(image.width, image.height, size, index);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const u = (x + 0.5) / rect.width * 4, v = (y + 0.5) / rect.height * 4;
      const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
      for (let channel = 0; channel < 3; channel++) {
        const top = vertices[(y0 * 5 + x0) * 3 + channel]! * (1 - fx) + vertices[(y0 * 5 + x0 + 1) * 3 + channel]! * fx;
        const bottom = vertices[((y0 + 1) * 5 + x0) * 3 + channel]! * (1 - fx) + vertices[((y0 + 1) * 5 + x0 + 1) * 3 + channel]! * fx;
        image.rgba[((rect.y + y) * image.width + rect.x + x) * 4 + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return image;
}

function fixture(size: PuzzleSize, options: { seed?: number; cells?: number[]; degraded?: boolean; duplicate?: boolean; blankLooksLike?: number } = {}) {
  const art = artwork(size, options.seed ?? 1, options.duplicate);
  const cells = options.cells ?? Array.from({ length: size * size }, (_, index) => (index * 5 + 3) % (size * size));
  // Use a true permutation for sizes whose cell count shares a factor with 5.
  if (!options.cells && new Set(cells).size !== cells.length) cells.splice(0, cells.length, ...Array.from({ length: size * size }, (_, i) => (i + 7) % (size * size)));
  const crop = { x: 11, y: 13, width: size * 49 + 5, height: size * 46 + 7 };
  const screenshot = raster(crop.width + 29, crop.height + 37);
  for (let index = 0; index < cells.length; index++) {
    const id = cells[index]!, rect = bounds(crop.width, crop.height, size, index);
    const source = id === 0 && options.blankLooksLike !== undefined ? bounds(art.width, art.height, size, options.blankLooksLike - 1)
      : id ? bounds(art.width, art.height, size, id - 1) : null;
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const output = ((crop.y + rect.y + y) * screenshot.width + crop.x + rect.x + x) * 4;
      const sx = source ? source.x + Math.min(source.width - 1, Math.floor((x + 0.5) / rect.width * source.width)) : 0;
      const sy = source ? source.y + Math.min(source.height - 1, Math.floor((y + 0.5) / rect.height * source.height)) : 0;
      for (let channel = 0; channel < 3; channel++) {
        const value = source ? art.rgba[(sy * art.width + sx) * 4 + channel]! : [28, 29, 48][channel]!;
        const noise = (x * 13 + y * 7 + channel * 3) % 7 - 3;
        screenshot.rgba[output + channel] = options.degraded ? Math.round(Math.max(0, Math.min(255, value * 0.87 + 17 + noise)) / 4) * 4 : value;
      }
    }
  }
  const input: PuzzleFragmentMatchInput = { artworkSourceId: "server:song:artwork", artwork: art, screenshot,
    observation: confirmPuzzleObservation("screenshot-hash", size, screenshot, puzzleCropFields(crop), cells.indexOf(0)) };
  return { input, cells, art, screenshot };
}

describe("fragment image matching", () => {
  for (const size of PUZZLE_SIZES) test(`${size}x${size} matches scaled fragments globally with a supplied or inferred blank`, () => {
    const { input, cells } = fixture(size);
    const result = matchPuzzleFragments(input);
    expect(result.draftCells).toEqual(cells);
    expect(result.reviewRequired).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.blank.status).toBe("provided");
    expect(new Set(result.cells.map(cell => cell.proposedTileId)).size).toBe(size * size);
    const inferred = matchPuzzleFragments({ ...input, observation: { ...input.observation, blankIndex: null } });
    expect(inferred.blank.index).toBe(cells.indexOf(0));
    expect(inferred.blank.status).toBe("inferred");
    expect(inferred.draftCells).toEqual(cells);
    expect(inferred.artworkSourceId).toBe(input.artworkSourceId);
    expect(inferred.observation.sourceId).toBe(input.observation.sourceId);
  });
  test("keeps the true layout under brightness, noise and color quantization", () => {
    for (const size of [3, 5, 8] as const) {
      const { input, cells } = fixture(size, { degraded: true, seed: 17 });
      expect(matchPuzzleFragments(input).draftCells).toEqual(cells);
    }
  });
  test("does not use solvability to repair a correctly recognized opposite-parity board", () => {
    const cells = [2, 1, 3, 4, 5, 6, 7, 8, 0], { input } = fixture(3, { cells });
    const result = matchPuzzleFragments(input);
    expect(result.draftCells).toEqual(cells);
    expect(analyzePuzzleBoard(createPuzzleBoard(3, result.draftCells as number[])).solvable).toBe(false);
    expect(result.reviewRequired).toBe(true);
  });
  test("infers every blank position and keeps supplied mistakes visible for review", () => {
    for (let blank = 0; blank < 9; blank++) {
      const cells = Array.from({ length: 9 }, (_, index) => index === blank ? 0 : index < blank ? index + 1 : index);
      const { input } = fixture(3, { cells });
      const result = matchPuzzleFragments({ ...input, observation: { ...input.observation, blankIndex: null } });
      expect(result.blank.index).toBe(blank);
      expect(result.draftCells).toEqual(cells);
    }
    const { input } = fixture(3);
    const wrongBlank = (input.observation.blankIndex! + 1) % 9;
    const result = matchPuzzleFragments({ ...input, observation: { ...input.observation, blankIndex: wrongBlank } });
    expect(result.blank.status).toBe("provided");
    expect(result.draftCells[wrongBlank]).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.cells.some(cell => cell.issues.includes("weakMatch"))).toBe(true);
  });
  test("does not pretend identical fragments, flat artwork or transparent pixels are identified", () => {
    const duplicate = fixture(3, { duplicate: true });
    const result = matchPuzzleFragments(duplicate.input);
    expect(result.complete).toBe(false);
    expect(result.cells.some(cell => cell.issues.includes("ambiguousMatch"))).toBe(true);
    expect(new Set(result.cells.map(cell => cell.proposedTileId)).size).toBe(9);
    const flat = fixture(3);
    flat.art.rgba.fill(50); flat.screenshot.rgba.fill(50);
    for (let i = 3; i < flat.art.rgba.length; i += 4) flat.art.rgba[i] = 255;
    for (let i = 3; i < flat.screenshot.rgba.length; i += 4) flat.screenshot.rgba[i] = 255;
    const flatResult = matchPuzzleFragments(flat.input);
    expect(flatResult.cells.filter(cell => cell.issues.includes("lowTexture"))).toHaveLength(8);
    expect(flatResult.draftCells.filter(value => value === null)).toHaveLength(8);
    const transparent = fixture(3);
    for (let i = 3; i < transparent.screenshot.rgba.length; i += 4) transparent.screenshot.rgba[i] = 0;
    expect(matchPuzzleFragments(transparent.input).cells.filter(cell => cell.issues.includes("transparent"))).toHaveLength(8);
  });
  test("retains an uncertain blank when a leftover fragment looks like artwork", () => {
    const { input } = fixture(3, { blankLooksLike: 1 });
    const result = matchPuzzleFragments({ ...input, observation: { ...input.observation, blankIndex: null } });
    expect(result.blank.index).toBeNull();
    expect(result.blank.status).toBe("uncertain");
    expect(result.complete).toBe(false);
    expect(result.draftCells).not.toContain(0);
    expect(result.cells[result.blank.proposedIndex]!.issues).toContain("blankUncertain");
  });
  test("flags a wrong song instead of publishing a forced complete permutation", () => {
    const { input } = fixture(5, { seed: 111 });
    const result = matchPuzzleFragments({ ...input, artwork: artwork(5, 9876) });
    expect(result.complete).toBe(false);
    expect(result.cells.some(cell => cell.issues.includes("weakMatch"))).toBe(true);
    expect(result.draftCells.some(tile => tile === null)).toBe(true);
  });
  test("reconstructs transported sampling and snapshots the match without trusting caller cells", () => {
    const { input, cells } = fixture(3);
    const result = matchPuzzleFragments({ ...input, observation: { ...input.observation, cells: [] } });
    expect(result.draftCells).toEqual(cells);
    expect(result.observation.cells).toHaveLength(9);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cells[0]!.candidates[0])).toBe(true);
    expect(Object.isFrozen(result.draftCells)).toBe(true);
    expect(Object.isFrozen(result.policy)).toBe(true);
  });
  test("rejects stale image dimensions, invalid bindings, buffers, crops and heuristic policies", () => {
    const { input } = fixture(3);
    expect(() => matchPuzzleFragments({ ...input, observation: { ...input.observation, image: { width: 1, height: 1 } } })).toThrow(RangeError);
    expect(() => matchPuzzleFragments({ ...input, artworkSourceId: "" })).toThrow(RangeError);
    expect(() => matchPuzzleFragments({ ...input, screenshot: { ...input.screenshot, rgba: new ArrayBuffer(4) } })).toThrow(RangeError);
    expect(() => matchPuzzleFragments({ ...input, artworkCrop: { x: -1, y: 0, width: 1, height: 1 } })).toThrow();
    for (const value of [-1, NaN, Infinity, 2]) expect(() => matchPuzzleFragments({ ...input, policy: { maxPairCost: value } })).toThrow(RangeError);
  });
});
