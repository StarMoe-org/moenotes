import { describe, expect, test } from "bun:test";
import { PUZZLE_SIZES, PuzzleInputError, type PuzzleSize } from "../src/lib/sliding-puzzle/model";
import {
  PuzzleSamplingError, createPuzzleReferenceSamples, createPuzzleSamplingGrid, type PixelRect,
} from "../src/lib/sliding-puzzle/sampling";

for (const size of PUZZLE_SIZES) {
  describe(`${size}x${size} sampling`, () => {
    test("covers an offset, indivisible crop exactly once and keeps samples inside their cells", () => {
      const crop = { x: 17, y: 31, width: 101, height: 83 };
      const grid = createPuzzleSamplingGrid(size, { width: 140, height: 130 }, { crop });
      expect(grid).toHaveLength(size * size);
      // Enumerate source pixels independently of the production shared-edge calculation.
      const visits = new Map<string, number>();
      for (const cell of grid) {
        const { rect, sampleRect } = cell;
        expect(cell.index).toBe(cell.row * size + cell.column);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(sampleRect.x).toBeGreaterThanOrEqual(rect.x);
        expect(sampleRect.y).toBeGreaterThanOrEqual(rect.y);
        expect(sampleRect.width).toBeGreaterThan(0);
        expect(sampleRect.height).toBeGreaterThan(0);
        expect(sampleRect.x + sampleRect.width).toBeLessThanOrEqual(rect.x + rect.width);
        expect(sampleRect.y + sampleRect.height).toBeLessThanOrEqual(rect.y + rect.height);
        for (let y = rect.y; y < rect.y + rect.height; y += 1) {
          for (let x = rect.x; x < rect.x + rect.width; x += 1) {
            const key = `${x},${y}`;
            visits.set(key, (visits.get(key) ?? 0) + 1);
          }
        }
      }
      expect(visits.size).toBe(crop.width * crop.height);
      for (let y = crop.y; y < crop.y + crop.height; y += 1) {
        for (let x = crop.x; x < crop.x + crop.width; x += 1) expect(visits.get(`${x},${y}`)).toBe(1);
      }
    });

    test("numbers references from 1 and drops only the bottom-right artwork", () => {
      const grid = createPuzzleSamplingGrid(size, { width: 512, height: 512 });
      const references = createPuzzleReferenceSamples(size, { width: 512, height: 512 });
      expect(references.map(sample => sample.tileId)).toEqual(Array.from({ length: size * size - 1 }, (_, i) => i + 1));
      expect(references.map(sample => sample.rect)).toEqual(grid.slice(0, -1).map(cell => cell.rect));
      expect(references.some(sample => sample.tileId === 0)).toBe(false);
      expect(grid.at(-1)).toMatchObject({ row: size - 1, column: size - 1 });
      expect(grid.at(-1)!.rect.x + grid.at(-1)!.rect.width).toBe(512);
      expect(grid.at(-1)!.rect.y + grid.at(-1)!.rect.height).toBe(512);
      expect("tileId" in grid[0]!).toBe(false); // Observation cells do not acquire guessed IDs.
    });

    test("retains at least one pixel at the largest inset and the smallest valid dimensions", () => {
      const grid = createPuzzleSamplingGrid(size, { width: size, height: size }, { inset: 0.499 });
      for (const cell of grid) {
        expect(cell.rect).toEqual({ x: cell.column, y: cell.row, width: 1, height: 1 });
        expect(cell.sampleRect).toEqual(cell.rect);
      }
    });
  });
}

describe("sampling coordinates and validation", () => {
  test("uses the verified 512px jacket layout and a separate screenshot crop", () => {
    const references = createPuzzleReferenceSamples(3, { width: 512, height: 512 });
    expect(references[0]).toEqual({
      tileId: 1, index: 0, row: 0, column: 0,
      rect: { x: 0, y: 0, width: 171, height: 171 },
      sampleRect: { x: 12, y: 12, width: 147, height: 147 },
    });
    expect(references[1]!.rect).toEqual({ x: 171, y: 0, width: 170, height: 171 });
    const screenshot = createPuzzleSamplingGrid(3, { width: 1920, height: 864 }, {
      crop: { x: 649, y: 70, width: 704, height: 707 }, inset: 0,
    });
    // The current blank is still represented as an observation cell, not a removed row/column.
    expect(screenshot[3]!.rect).toEqual({ x: 649, y: 306, width: 235, height: 235 });
    expect(screenshot[3]!.sampleRect).toEqual(screenshot[3]!.rect);
    expect(screenshot[8]!.rect).toEqual({ x: 1118, y: 541, width: 235, height: 236 });
  });

  test("does not silently center-crop rectangular artwork or reuse a mutable crop", () => {
    const image = { width: 700, height: 400 };
    const crop = { x: 10, y: 20, width: 600, height: 300 };
    const grid = createPuzzleSamplingGrid(3, image, { crop, inset: 0 });
    crop.x = 99;
    image.width = 1;
    expect(grid[0]!.rect).toEqual({ x: 10, y: 20, width: 200, height: 100 });
    expect(Object.isFrozen(grid)).toBe(true);
    expect(Object.isFrozen(grid[0]!.rect)).toBe(true);
    expect(Object.isFrozen(grid[0]!.sampleRect)).toBe(true);
  });

  test("rejects unsupported sizes, invalid image dimensions and grids smaller than one pixel per cell", () => {
    expect(() => createPuzzleSamplingGrid(2 as PuzzleSize, { width: 512, height: 512 })).toThrow(PuzzleInputError);
    for (const width of [0, -1, 3.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createPuzzleSamplingGrid(3, { width, height: 512 })).toThrow("invalidImageSize");
      expect(() => createPuzzleSamplingGrid(3, { width: 512, height: width })).toThrow("invalidImageSize");
    }
    expect(() => createPuzzleSamplingGrid(8, { width: 7, height: 512 })).toThrow("gridTooSmall");
    expect(() => createPuzzleSamplingGrid(8, { width: 512, height: 7 })).toThrow("gridTooSmall");
  });

  test("rejects out-of-image, fractional and non-positive crops instead of clamping them", () => {
    const invalid: PixelRect[] = [
      { x: -1, y: 0, width: 30, height: 30 }, { x: 0, y: -1, width: 30, height: 30 },
      { x: 0.5, y: 0, width: 30, height: 30 }, { x: 0, y: 0, width: 30.5, height: 30 },
      { x: 500, y: 0, width: 30, height: 30 }, { x: 0, y: 500, width: 30, height: 30 },
      { x: 0, y: 0, width: 0, height: 30 }, { x: 0, y: 0, width: 30, height: -1 },
      { x: Infinity, y: 0, width: 30, height: 30 }, { x: 0, y: NaN, width: 30, height: 30 },
    ];
    for (const crop of invalid) {
      expect(() => createPuzzleReferenceSamples(3, { width: 512, height: 512 }, { crop })).toThrow(PuzzleSamplingError);
    }
    expect(() => createPuzzleSamplingGrid(8, { width: 512, height: 512 }, {
      crop: { x: 0, y: 0, width: 6, height: 100 },
    })).toThrow("gridTooSmall");
  });

  test("rejects insets that would consume the full cell", () => {
    for (const inset of [-1, 0.5, 1, NaN, Infinity]) {
      expect(() => createPuzzleSamplingGrid(3, { width: 512, height: 512 }, { inset })).toThrow("invalidInset");
    }
  });
});
