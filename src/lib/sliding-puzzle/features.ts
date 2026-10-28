import type { PixelRect, PixelSize } from "./sampling";

export const PUZZLE_FEATURE_SIDE = 24;
export interface PuzzlePixelImage extends PixelSize {
  readonly rgba: ArrayBuffer | Uint8Array | Uint8ClampedArray;
}
export interface PuzzleTileFeature {
  readonly mean: readonly number[];
  readonly texture: readonly number[];
  readonly edges: readonly number[];
  readonly contrast: number;
  readonly coverage: number;
}
export interface PuzzlePairMeasure {
  readonly cost: number;
  readonly textureCorrelation: number;
  readonly edgeCorrelation: number;
  readonly colorDistance: number;
}

export function puzzlePixelBytes(image: PuzzlePixelImage): Uint8Array {
  const pixels = image.width * image.height;
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0 || pixels > 24_000_000) throw new RangeError("Invalid puzzle pixel dimensions");
  const value = image.rgba;
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
    : (value instanceof Uint8Array || value instanceof Uint8ClampedArray) && value.buffer instanceof ArrayBuffer
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;
  if (!bytes || bytes.byteLength !== pixels * 4) throw new RangeError("Invalid puzzle RGBA buffer");
  return bytes;
}

function unit(values: number[]): readonly number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return Object.freeze(values.map(value => norm > 1e-12 ? value / norm : 0));
}

/** Area resampling reads only the inner cell, preserving fractional coverage without mixing adjacent tiles. */
export function extractPuzzleFeature(image: PuzzlePixelImage, rect: PixelRect): PuzzleTileFeature {
  const bytes = puzzlePixelBytes(image);
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) || rect.x < 0 || rect.y < 0
    || rect.width <= 0 || rect.height <= 0 || rect.x > image.width - rect.width || rect.y > image.height - rect.height) throw new RangeError("Invalid puzzle feature region");
  const side = PUZZLE_FEATURE_SIDE, count = side * side;
  const rgb: number[] = [], mean = [0, 0, 0], gray: number[] = [];
  let coverage = 0;
  for (let row = 0; row < side; row++) for (let column = 0; column < side; column++) {
    const left = rect.x + column * rect.width / side, right = rect.x + (column + 1) * rect.width / side;
    const top = rect.y + row * rect.height / side, bottom = rect.y + (row + 1) * rect.height / side;
    const area = (right - left) * (bottom - top);
    const sample = [0, 0, 0];
    for (let y = Math.floor(top); y < Math.ceil(bottom); y++) for (let x = Math.floor(left); x < Math.ceil(right); x++) {
      const weight = (Math.min(x + 1, right) - Math.max(x, left)) * (Math.min(y + 1, bottom) - Math.max(y, top)) / area;
      const offset = (y * image.width + x) * 4, alpha = bytes[offset + 3]! / 255;
      coverage += weight * alpha / count;
      for (let channel = 0; channel < 3; channel++) sample[channel]! += weight * (bytes[offset + channel]! / 255 * alpha + 0.5 * (1 - alpha));
    }
    for (let channel = 0; channel < 3; channel++) { rgb.push(sample[channel]!); mean[channel]! += sample[channel]! / count; }
    gray.push((sample[0]! + sample[1]! + sample[2]!) / 3);
  }
  const centered = rgb.map((value, index) => value - mean[index % 3]!);
  const contrast = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0) / centered.length);
  const edges: number[] = [];
  for (let y = 1; y < side - 1; y++) for (let x = 1; x < side - 1; x++) {
    edges.push(gray[y * side + x + 1]! - gray[y * side + x - 1]!, gray[(y + 1) * side + x]! - gray[(y - 1) * side + x]!);
  }
  return Object.freeze({ mean: Object.freeze(mean), texture: unit(centered), edges: unit(edges), contrast, coverage: Math.min(1, Math.max(0, coverage)) });
}

const dot = (a: readonly number[], b: readonly number[]) => Math.max(-1, Math.min(1, a.reduce((sum, value, index) => sum + value * b[index]!, 0)));

/** Bounded dissimilarities, not probabilities. Centered RGB and gradients tolerate brightness and scale changes. */
export function comparePuzzleFeatures(a: PuzzleTileFeature, b: PuzzleTileFeature): PuzzlePairMeasure {
  const textureCorrelation = dot(a.texture, b.texture), edgeCorrelation = dot(a.edges, b.edges);
  const colorDistance = Math.sqrt(a.mean.reduce((sum, value, index) => sum + (value - b.mean[index]!) ** 2, 0) / 3);
  const cost = Math.min(1, Math.max(0, 0.75 * (1 - textureCorrelation) / 2 + 0.15 * (1 - edgeCorrelation) / 2 + 0.1 * colorDistance));
  return Object.freeze({ cost, textureCorrelation, edgeCorrelation, colorDistance });
}
