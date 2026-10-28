import { assertPuzzleSize, type PuzzleSize } from "./model";

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/** Integer source-image coordinates; right/bottom (x+width/y+height) are exclusive. */
export interface PixelRect extends PixelSize {
  readonly x: number;
  readonly y: number;
}

export interface PuzzleCellSample {
  readonly index: number;
  readonly row: number;
  readonly column: number;
  /** Complete cell, including its edge; suitable for rendering the numbered artwork. */
  readonly rect: PixelRect;
  /** Inner region for feature extraction, excluding grid lines and tile borders. */
  readonly sampleRect: PixelRect;
}

export interface PuzzleReferenceSample extends PuzzleCellSample {
  readonly tileId: number;
}

export interface PuzzleSamplingOptions {
  /** Explicit source crop; rectangular crops are preserved without a silent center crop. */
  readonly crop?: PixelRect;
  /** Fraction removed at each edge, in [0, 0.5). Defaults to 0.07. */
  readonly inset?: number;
}

export class PuzzleSamplingError extends RangeError {
  constructor(readonly code: "invalidImageSize" | "invalidCrop" | "gridTooSmall" | "invalidInset") {
    super(code);
    this.name = "PuzzleSamplingError";
  }
}

const positiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

/** Rounding and clamping preserve at least one source pixel even for tiny valid cells. */
function insetRect(rect: PixelRect, inset: number): PixelRect {
  const dx = Math.min(Math.round(rect.width * inset), Math.floor((rect.width - 1) / 2));
  const dy = Math.min(Math.round(rect.height * inset), Math.floor((rect.height - 1) / 2));
  return Object.freeze({ x: rect.x + dx, y: rect.y + dy, width: rect.width - dx * 2, height: rect.height - dy * 2 });
}

/**
 * Geometry only: no DOM, decoding, resizing or image downloads. Use independently for artwork and screenshot
 * crops. Shared rounded edges cover the crop exactly, including dimensions not divisible by the grid size.
 */
export function createPuzzleSamplingGrid(
  size: PuzzleSize,
  image: PixelSize,
  options: PuzzleSamplingOptions = {},
): readonly PuzzleCellSample[] {
  assertPuzzleSize(size);
  if (!image || !positiveInteger(image.width) || !positiveInteger(image.height)) {
    throw new PuzzleSamplingError("invalidImageSize");
  }
  const crop = options.crop ?? { x: 0, y: 0, width: image.width, height: image.height };
  if (!Number.isSafeInteger(crop.x) || !Number.isSafeInteger(crop.y) || crop.x < 0 || crop.y < 0
    || !positiveInteger(crop.width) || !positiveInteger(crop.height)
    || crop.x > image.width - crop.width || crop.y > image.height - crop.height) {
    throw new PuzzleSamplingError("invalidCrop");
  }
  if (crop.width < size || crop.height < size) throw new PuzzleSamplingError("gridTooSmall");
  const inset = options.inset ?? 0.07;
  if (!Number.isFinite(inset) || inset < 0 || inset >= 0.5) throw new PuzzleSamplingError("invalidInset");

  const columns = Array.from({ length: size + 1 }, (_, i) => crop.x + Math.round(crop.width * (i / size)));
  const rows = Array.from({ length: size + 1 }, (_, i) => crop.y + Math.round(crop.height * (i / size)));
  return Object.freeze(Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    const x = columns[column]!;
    const y = rows[row]!;
    const rect = Object.freeze({ x, y, width: columns[column + 1]! - x, height: rows[row + 1]! - y });
    return Object.freeze({ index, row, column, rect, sampleRect: insetRect(rect, inset) });
  }));
}

/** Artwork references are numbered 1..size²-1; the removed bottom-right image never becomes a blank sample. */
export function createPuzzleReferenceSamples(
  size: PuzzleSize,
  image: PixelSize,
  options: PuzzleSamplingOptions = {},
): readonly PuzzleReferenceSample[] {
  return Object.freeze(createPuzzleSamplingGrid(size, image, options).slice(0, -1)
    .map((cell) => Object.freeze({ ...cell, tileId: cell.index + 1 })));
}
