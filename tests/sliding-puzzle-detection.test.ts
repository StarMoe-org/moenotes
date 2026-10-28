import { describe, expect, test } from "bun:test";
import { PUZZLE_SIZES, type PuzzleSize } from "../src/lib/sliding-puzzle/model";
import { suggestPuzzleRegions } from "../src/lib/sliding-puzzle/detection";

type Image = { width: number; height: number; rgba: Uint8Array };
type Rect = { x: number; y: number; width: number; height: number };
type Paint = (x: number, y: number) => readonly [number, number, number, number?];

const hash = (x: number, y: number, salt: number) => {
  let value = Math.imul(x + salt * 101, 374761393) ^ Math.imul(y - salt * 37, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};
const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const makeImage = (width: number, height: number, paint: Paint): Image => {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a = 255] = paint(x, y), offset = (y * width + x) * 4;
    rgba[offset] = byte(r); rgba[offset + 1] = byte(g); rgba[offset + 2] = byte(b); rgba[offset + 3] = a;
  }
  return { width, height, rgba };
};
const palette = [[210, 60, 70], [60, 150, 210], [80, 180, 90], [220, 170, 60], [150, 80, 200], [60, 200, 190], [220, 110, 180], [120, 120, 220]];
const tint = (x: number, y: number, salt: number) => (hash(x, y, salt) - 0.5) * 26;

/** Draws an axis-aligned board with dark seams; one cell is left dark to act as the blank. */
function drawBoard(image: Image, board: Rect, size: PuzzleSize, options: { gap?: number; seam?: number; blank?: number; tile?: (u: number, v: number, index: number) => readonly [number, number, number] } = {}): void {
  const gap = options.gap ?? 2, seam = options.seam ?? 12, blank = options.blank ?? size * size - 1;
  const onSeam = (local: number, extent: number) => {
    const cell = local * size / extent, fraction = cell - Math.floor(cell);
    return Math.min(fraction, 1 - fraction) * extent / size <= gap;
  };
  for (let y = Math.max(0, board.y); y < Math.min(image.height, board.y + board.height); y++) for (let x = Math.max(0, board.x); x < Math.min(image.width, board.x + board.width); x++) {
    const localX = x - board.x, localY = y - board.y;
    const column = Math.min(size - 1, Math.floor(localX * size / board.width)), row = Math.min(size - 1, Math.floor(localY * size / board.height));
    const index = row * size + column, color = palette[index % palette.length]!, offset = (y * image.width + x) * 4;
    const edge = onSeam(localX, board.width) || onSeam(localY, board.height);
    const u = localX * size / board.width - column, v = localY * size / board.height - row, shade = index === blank ? [30, 30, 34] as const : color;
    const tile = options.tile?.(u, v, index) ?? [tint(x, y, 3), tint(x, y, 5), tint(x, y, 7)];
    image.rgba[offset] = byte(edge ? seam : shade[0]! + tile[0]);
    image.rgba[offset + 1] = byte(edge ? seam : shade[1]! + tile[1]);
    image.rgba[offset + 2] = byte(edge ? seam : shade[2]! + tile[2]);
    image.rgba[offset + 3] = 255;
  }
}
const screenshot = (width: number, height: number, board: Rect, size: PuzzleSize, options: { gap?: number; seam?: number; blank?: number; tile?: (u: number, v: number, index: number) => readonly [number, number, number] } = {}): Image => {
  const image = makeImage(width, height, (x, y) => {
    const wave = Math.sin(x / 37) * 18 + Math.cos(y / 23) * 14;
    return [52 + wave + hash(x, y, 11) * 24, 46 + wave * 0.8 + hash(x, y, 13) * 22, 58 + wave * 0.6 + hash(x, y, 17) * 20];
  });
  drawBoard(image, board, size, options);
  return image;
};
const area = (rect: Rect) => rect.width * rect.height;
const intersection = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const iou = (a: Rect, b: Rect) => intersection(a, b) / (area(a) + area(b) - intersection(a, b));
const cover = (a: Rect, b: Rect) => intersection(a, b) / Math.min(area(a), area(b));
const inside = (rect: Rect, image: { width: number; height: number }) => [rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)
  && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0
  && rect.x + rect.width <= image.width && rect.y + rect.height <= image.height;
const best = (candidates: readonly { crop: Rect }[], board: Rect) => Math.max(...candidates.map(candidate => iou(candidate.crop, board)));

describe("automatic board region suggestions", () => {
  test("locates a generated full-screen board without touching the real screenshot requirement", () => {
    const board = { x: 649, y: 70, width: 704, height: 707 }, image = screenshot(1920, 864, board, 3);
    const result = suggestPuzzleRegions(image, 3);
    expect(result.reviewRequired).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(5);
    const top = result.candidates[0]!;
    expect(iou(top.crop, board)).toBeGreaterThan(0.9);
    expect(top.evidence).toBe("grid");
    expect(top.score).toBeGreaterThan(0.8);
    for (const candidate of result.candidates) {
      expect(inside(candidate.crop, image)).toBe(true);
      expect(candidate.score).toBeGreaterThan(0);
      expect(candidate.score).toBeLessThanOrEqual(1);
    }
    expect(result.candidates.map(candidate => candidate.score)).toEqual([...result.candidates.map(candidate => candidate.score)].sort((a, b) => b - a));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.candidates)).toBe(true);
    expect(Object.isFrozen(result.candidates[0]!.crop)).toBe(true);
  });

  test("recognises an already-cropped board at every supported size instead of returning nothing", () => {
    for (const size of PUZZLE_SIZES) {
      const board = { x: 0, y: 0, width: 720, height: 720 }, image = screenshot(720, 720, board, size);
      const result = suggestPuzzleRegions(image, size);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(iou(result.candidates[0]!.crop, board)).toBeGreaterThan(0.9);
    }
  });

  test("keeps faint one-pixel seams reviewable rather than stamping them as a solved board", () => {
    const board = { x: 120, y: 100, width: 420, height: 420 }, image = screenshot(640, 640, board, 3, { gap: 1, seam: 96 });
    const result = suggestPuzzleRegions(image, 3);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(iou(result.candidates[0]!.crop, board)).toBeGreaterThan(0.85);
    expect(result.reviewRequired).toBe(true);
    for (const candidate of result.candidates) expect(inside(candidate.crop, image)).toBe(true);
  });

  test("reports two similar boards separately and suppresses shifted copies of one board", () => {
    const left = { x: 80, y: 120, width: 480, height: 480 }, right = { x: 720, y: 150, width: 450, height: 450 };
    const image = screenshot(1280, 720, left, 3, { blank: 4 });
    drawBoard(image, right, 3, { blank: 8 });
    const result = suggestPuzzleRegions(image, 3);
    expect(result.candidates.some(candidate => iou(candidate.crop, left) > 0.9)).toBe(true);
    expect(result.candidates.some(candidate => iou(candidate.crop, right) > 0.9)).toBe(true);
    for (let i = 0; i < result.candidates.length; i++) for (let j = i + 1; j < result.candidates.length; j++) {
      expect(cover(result.candidates[i]!.crop, result.candidates[j]!.crop)).toBeLessThan(0.6);
    }
  });

  test("returns no candidate for textured noise or a smooth gradient", () => {
    const textured = makeImage(640, 640, (x, y) => [hash(x, y, 23) * 255, hash(x, y, 29) * 255, hash(x, y, 31) * 255]);
    const gradient = makeImage(900, 700, (x, y) => [60 + x / 15, 80 + y / 12, 120 - x / 20]);
    expect(suggestPuzzleRegions(textured, 3).candidates).toHaveLength(0);
    expect(suggestPuzzleRegions(gradient, 3).candidates).toHaveLength(0);
  });

  test("stays bounded and reviewable when the requested size does not match the screenshot", () => {
    const board = { x: 300, y: 80, width: 600, height: 600 }, image = screenshot(1200, 800, board, 3);
    for (const size of [4, 5] as const) {
      const result = suggestPuzzleRegions(image, size);
      expect(result.reviewRequired).toBe(true);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates.length).toBeLessThanOrEqual(5);
      for (const candidate of result.candidates) expect(inside(candidate.crop, image)).toBe(true);
      expect(best(result.candidates, board)).toBeGreaterThan(0.4);
    }
  });

  test("does not treat a scaled board as the artwork ranker without an artwork reference", () => {
    const board = { x: 180, y: 120, width: 540, height: 540 }, image = screenshot(1000, 800, board, 3);
    for (const candidate of suggestPuzzleRegions(image, 3).candidates) expect(candidate.evidence).not.toBe("artwork");
  });

  test("ranks the matching artwork region when a reference is supplied", () => {
    const board = { x: 180, y: 120, width: 540, height: 540 };
    const tile = (u: number, v: number) => [Math.sin(u * 6) * 32 + Math.cos(v * 5) * 20, Math.cos(u * 5) * 28, Math.sin((u - v) * 8) * 26] as const;
    const artwork = makeImage(300, 300, (x, y) => {
      const column = Math.min(2, Math.floor(x / 100)), row = Math.min(2, Math.floor(y / 100));
      const color = palette[(row * 3 + column) % palette.length]!, u = x / 100 - column, v = y / 100 - row, shade = tile(u, v);
      return [color[0]! + shade[0], color[1]! + shade[1], color[2]! + shade[2]];
    });
    const image = screenshot(1000, 800, board, 3, { tile });
    const result = suggestPuzzleRegions(image, 3, artwork);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.evidence).toBe("artwork");
    expect(iou(result.candidates[0]!.crop, board)).toBeGreaterThan(0.95);
  });

  test("rejects unsupported sizes and malformed pixel buffers", () => {
    const image = screenshot(200, 200, { x: 20, y: 20, width: 160, height: 160 }, 3);
    expect(() => suggestPuzzleRegions(image, 2 as PuzzleSize)).toThrow();
    expect(() => suggestPuzzleRegions(image, 9 as PuzzleSize)).toThrow();
    expect(() => suggestPuzzleRegions({ width: 0, height: 200, rgba: image.rgba }, 3)).toThrow();
    expect(() => suggestPuzzleRegions({ width: 200, height: 200, rgba: image.rgba.slice(4) }, 3)).toThrow();
  });
});
