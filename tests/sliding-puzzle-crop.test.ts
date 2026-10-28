import { describe, expect, test } from "bun:test";
import { PUZZLE_SIZES } from "../src/lib/sliding-puzzle/model";
import { confirmPuzzleObservation, fullPuzzleCropFields, movePuzzleCrop, puzzleCropFields, puzzleCropFromPoints, puzzleImagePoint, readPuzzleCrop } from "../src/lib/sliding-puzzle/crop";

describe("puzzle crop coordinates", () => {
  test("maps the real screenshot crop independently of its displayed size and offset", () => {
    const image = { width: 1920, height: 864 };
    for (const scale of [0.125, 0.5, 1, 2.3]) {
      const frame = { left: 73, top: 145, width: image.width * scale, height: image.height * scale };
      const from = puzzleImagePoint({ x: frame.left + 649 * scale, y: frame.top + 70 * scale }, frame, image);
      const to = puzzleImagePoint({ x: frame.left + 1353 * scale, y: frame.top + 777 * scale }, frame, image);
      const fields = puzzleCropFromPoints(image, from, to);
      expect(fields).toEqual({ x: "649", y: "70", width: "704", height: "707" });
      expect(puzzleCropFromPoints(image, to, from)).toEqual(fields);
    }
  });
  test("clamps pointer positions at image bounds without silently clamping numeric input", () => {
    const image = { width: 100, height: 80 }, frame = { left: 10, top: 20, width: 200, height: 160 };
    expect(puzzleImagePoint({ x: -100, y: 2000 }, frame, image)).toEqual({ x: 0, y: 80 });
    expect(puzzleCropFromPoints(image, { x: -3, y: -5 }, { x: 999, y: 999 })).toEqual(fullPuzzleCropFields(image));
    expect(readPuzzleCrop(3, image, { x: "-1", y: "0", width: "90", height: "70" }).ok).toBe(false);
    expect(readPuzzleCrop(3, image, { x: "50", y: "0", width: "90", height: "70" }).ok).toBe(false);
  });
  test("keeps a click or tiny drag invalid instead of reusing an old valid selection", () => {
    const image = { width: 100, height: 80 };
    const click = puzzleCropFromPoints(image, { x: 10, y: 10 }, { x: 10, y: 10 });
    expect(readPuzzleCrop(3, image, click).ok).toBe(false);
    expect(readPuzzleCrop(8, image, puzzleCropFromPoints(image, { x: 10, y: 10 }, { x: 15, y: 16 }))).toEqual({ ok: false, code: "gridTooSmall" });
  });
  test("rejects empty, decimal, non-finite, exponent and unsafe numeric coordinate drafts", () => {
    const image = { width: 100, height: 80 };
    for (const value of ["", " ", "1.5", "1e1", "NaN", "Infinity", "-1", "9007199254740993"]) {
      expect(readPuzzleCrop(3, image, { ...fullPuzzleCropFields(image), x: value }).ok).toBe(false);
    }
    expect(() => puzzleImagePoint({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 10 }, image)).toThrow();
    expect(() => puzzleCropFromPoints(image, { x: NaN, y: 0 }, { x: 1, y: 1 })).toThrow();
    expect(() => fullPuzzleCropFields({ width: 0, height: 100 })).toThrow();
  });
  test("moves a valid region by source pixels, preserving its size at all four edges", () => {
    const image = { width: 100, height: 80 }, crop = { x: 20, y: 10, width: 30, height: 40 };
    expect(movePuzzleCrop(image, crop, { x: 1, y: -1 })).toEqual({ x: "21", y: "9", width: "30", height: "40" });
    expect(movePuzzleCrop(image, crop, { x: 999, y: 999 })).toEqual({ x: "70", y: "40", width: "30", height: "40" });
    expect(movePuzzleCrop(image, crop, { x: -999, y: -999 })).toEqual({ x: "0", y: "0", width: "30", height: "40" });
    expect(() => movePuzzleCrop(image, { ...crop, width: 0 }, { x: 1, y: 1 })).toThrow();
    expect(() => movePuzzleCrop(image, crop, { x: Infinity, y: 1 })).toThrow();
  });
});

describe("confirmed screenshot observations", () => {
  for (const size of PUZZLE_SIZES) test(`${size}x${size} preserves every screenshot cell, crop offset and unknown blank`, () => {
    const image = { width: 997, height: 631 };
    const fields = puzzleCropFields({ x: 17, y: 23, width: 763, height: 577 });
    const observation = confirmPuzzleObservation("image-sha256", size, image, fields, null);
    expect(observation.cells).toHaveLength(size * size);
    expect(observation.blankIndex).toBeNull();
    expect(observation.cells.at(-1)!.rect.x + observation.cells.at(-1)!.rect.width).toBe(780);
    expect(observation.cells.at(-1)!.rect.y + observation.cells.at(-1)!.rect.height).toBe(600);
    for (const cell of observation.cells) {
      expect("tileId" in cell).toBe(false);
      expect(cell.row).toBe(Math.floor(cell.index / size));
      expect(cell.column).toBe(cell.index % size);
      expect(cell.sampleRect.x).toBeGreaterThanOrEqual(cell.rect.x);
      expect(cell.sampleRect.y).toBeGreaterThanOrEqual(cell.rect.y);
      expect(cell.sampleRect.x + cell.sampleRect.width).toBeLessThanOrEqual(cell.rect.x + cell.rect.width);
      expect(cell.sampleRect.y + cell.sampleRect.height).toBeLessThanOrEqual(cell.rect.y + cell.rect.height);
    }
    for (let blank = 0; blank < size * size; blank++) expect(confirmPuzzleObservation("same-image", size, image, fields, blank).blankIndex).toBe(blank);
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.image)).toBe(true);
    expect(Object.isFrozen(observation.crop)).toBe(true);
    expect(Object.isFrozen(observation.cells)).toBe(true);
  });
  test("snapshots crop and image metadata and rejects invalid bindings or blank indices", () => {
    const image = { width: 100, height: 100, privatePixels: "not part of the manifest" };
    const fields = { x: "5", y: "5", width: "90", height: "90" };
    const result = confirmPuzzleObservation("source", 3, image, fields, 3);
    fields.x = "7"; image.width = 999;
    expect(result.crop.x).toBe(5);
    expect(result.image).toEqual({ width: 100, height: 100 });
    expect(result.blankIndex).toBe(3);
    for (const blank of [-1, 9, 0.5, NaN]) expect(() => confirmPuzzleObservation("source", 3, image, fields, blank)).toThrow();
    expect(() => confirmPuzzleObservation("", 3, image, fields, null)).toThrow();
    expect(() => confirmPuzzleObservation("x".repeat(1025), 3, image, fields, null)).toThrow();
    expect(() => confirmPuzzleObservation("source", 3, image, { ...fields, width: "0" }, null)).toThrow();
  });
});
