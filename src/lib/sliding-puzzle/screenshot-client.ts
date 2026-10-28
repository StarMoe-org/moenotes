import { decodeScreenshot } from "../recognition/client";
import { RecognitionError } from "../recognition/errors";

export interface PuzzleScreenshot {
  readonly sourceId: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: ArrayBuffer;
  dispose(): void;
}

/** Reuse the site's screenshot decoder, orientation, hash and limits. Only add an owned, normalized preview URL. */
export async function decodePuzzleScreenshot(file: File, signal: AbortSignal): Promise<PuzzleScreenshot> {
  signal.throwIfAborted();
  const decoded = await decodeScreenshot(file);
  signal.throwIfAborted();
  const canvas = document.createElement("canvas");
  canvas.width = decoded.width; canvas.height = decoded.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new RecognitionError("imageDecode");
    context.putImageData(new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new RecognitionError("imageDecode")), "image/png"));
    signal.throwIfAborted();
    const url = URL.createObjectURL(blob);
    let disposed = false;
    return Object.freeze({ ...decoded, url, dispose: () => { if (!disposed) { disposed = true; URL.revokeObjectURL(url); } } });
  } finally { canvas.width = 0; canvas.height = 0; }
}
