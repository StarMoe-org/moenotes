import { assertPuzzleSize, type PuzzleSize } from "./model";
import { createPuzzleSamplingGrid, PuzzleSamplingError, type PixelRect, type PixelSize, type PuzzleCellSample } from "./sampling";

export interface PuzzlePoint { readonly x: number; readonly y: number }
export interface PuzzleDisplayRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
export type PuzzleCropFields = Readonly<Record<"x" | "y" | "width" | "height", string>>;
export type PuzzleCropResult = { readonly ok: true; readonly crop: PixelRect; readonly cells: readonly PuzzleCellSample[] }
  | { readonly ok: false; readonly code: "invalidCrop" | "gridTooSmall" };

function assertImage(image: PixelSize): void {
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0) throw new RangeError("Invalid puzzle image dimensions");
}
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

export function puzzleCropFields(rect: PixelRect): PuzzleCropFields {
  return Object.freeze({ x: String(rect.x), y: String(rect.y), width: String(rect.width), height: String(rect.height) });
}

export function fullPuzzleCropFields(image: PixelSize): PuzzleCropFields {
  assertImage(image);
  return puzzleCropFields({ x: 0, y: 0, ...image });
}

/** Drafts may be empty/invalid while editing. Never clamp them into a different, apparently valid selection. */
export function readPuzzleCrop(size: PuzzleSize, image: PixelSize, fields: PuzzleCropFields): PuzzleCropResult {
  assertPuzzleSize(size); assertImage(image);
  if (!Object.values(fields).every(value => /^\d+$/.test(value.trim()))) return { ok: false, code: "invalidCrop" };
  const crop = Object.freeze({ x: Number(fields.x), y: Number(fields.y), width: Number(fields.width), height: Number(fields.height) });
  try { return Object.freeze({ ok: true, crop, cells: createPuzzleSamplingGrid(size, image, { crop }) }); }
  catch (error) {
    if (error instanceof PuzzleSamplingError && (error.code === "invalidCrop" || error.code === "gridTooSmall")) return { ok: false, code: error.code };
    throw error;
  }
}

/** The display frame is the actual image bounds, without object-fit letterboxing. Source coordinates stay fractional until selection rounding. */
export function puzzleImagePoint(point: PuzzlePoint, frame: PuzzleDisplayRect, image: PixelSize): PuzzlePoint {
  assertImage(image);
  if (![point.x, point.y, frame.left, frame.top, frame.width, frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0) throw new RangeError("Invalid puzzle display bounds");
  return Object.freeze({ x: clamp((point.x - frame.left) / frame.width, 1) * image.width, y: clamp((point.y - frame.top) / frame.height, 1) * image.height });
}

/** A click without a drag yields an invalid zero-sized draft; it must not confirm the previous region. */
export function puzzleCropFromPoints(image: PixelSize, a: PuzzlePoint, b: PuzzlePoint): PuzzleCropFields {
  assertImage(image);
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) throw new RangeError("Invalid puzzle selection points");
  const x1 = Math.round(clamp(a.x, image.width)), x2 = Math.round(clamp(b.x, image.width));
  const y1 = Math.round(clamp(a.y, image.height)), y2 = Math.round(clamp(b.y, image.height));
  return puzzleCropFields({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
}

export function movePuzzleCrop(image: PixelSize, crop: PixelRect, delta: PuzzlePoint): PuzzleCropFields {
  assertImage(image);
  if (![delta.x, delta.y].every(Number.isFinite) || ![crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger)
    || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x > image.width - crop.width || crop.y > image.height - crop.height) throw new RangeError("Invalid puzzle crop movement");
  return puzzleCropFields({ ...crop, x: clamp(crop.x + Math.round(delta.x), image.width - crop.width), y: clamp(crop.y + Math.round(delta.y), image.height - crop.height) });
}

export interface PuzzleObservation {
  readonly sourceId: string;
  readonly size: PuzzleSize;
  readonly image: PixelSize;
  readonly crop: PixelRect;
  /** null means unassigned, never an inferred bottom-right blank. No target tile IDs exist yet. */
  readonly blankIndex: number | null;
  readonly cells: readonly PuzzleCellSample[];
}

export function confirmPuzzleObservation(sourceId: string, size: PuzzleSize, image: PixelSize, fields: PuzzleCropFields, blankIndex: number | null): PuzzleObservation {
  if (!sourceId || sourceId.length > 1024 || (blankIndex !== null && (!Number.isInteger(blankIndex) || blankIndex < 0 || blankIndex >= size * size))) throw new RangeError("Invalid puzzle observation binding");
  const parsed = readPuzzleCrop(size, image, fields);
  if (!parsed.ok) throw new RangeError(parsed.code);
  return Object.freeze({ sourceId, size, image: Object.freeze({ width: image.width, height: image.height }), crop: parsed.crop, blankIndex, cells: parsed.cells });
}
