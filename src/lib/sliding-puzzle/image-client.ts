import type { PuzzleSize } from "./model";
import { createPuzzleReferenceSamples, type PixelSize, type PuzzleReferenceSample } from "./sampling";

export interface PuzzleArtwork extends PixelSize {
  readonly rgba: ArrayBuffer;
  readonly sourceUrl: string;
  readonly size: PuzzleSize;
  readonly tiles: readonly (PuzzleReferenceSample & { readonly url: string })[];
}

/** Decode the complete source without cover-cropping; CORS failure is an error, never a guessed artwork. */
export async function loadPuzzleArtwork(sourceUrl: string, size: PuzzleSize, signal: AbortSignal): Promise<PuzzleArtwork> {
  signal.throwIfAborted();
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const source = new Image();
    source.crossOrigin = "anonymous";
    const clean = () => { source.onload = null; source.onerror = null; signal.removeEventListener("abort", abort); };
    const abort = () => { clean(); source.src = ""; reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
    source.onload = () => { clean(); resolve(source); };
    source.onerror = () => { clean(); reject(new Error("Puzzle artwork load failed")); };
    signal.addEventListener("abort", abort, { once: true });
    source.src = sourceUrl;
  });
  signal.throwIfAborted();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width > 4096 || height > 4096) throw new RangeError("Puzzle artwork is too large");
  const samples = createPuzzleReferenceSamples(size, { width, height });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Puzzle artwork canvas is unavailable");
  try {
    canvas.width = width; canvas.height = height;
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, width, height).data.buffer as ArrayBuffer;
    const tiles = samples.map(sample => {
      signal.throwIfAborted();
      const { x, y, width: tileWidth, height: tileHeight } = sample.rect;
      canvas.width = tileWidth; canvas.height = tileHeight;
      context.drawImage(image, x, y, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
      return Object.freeze({ ...sample, url: canvas.toDataURL("image/png") });
    });
    return Object.freeze({ sourceUrl, size, width, height, rgba, tiles: Object.freeze(tiles) });
  } finally { canvas.width = 0; canvas.height = 0; }
}
