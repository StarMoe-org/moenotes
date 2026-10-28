import { type PuzzleRegionCandidate, type PuzzleRegionSuggestions } from "./detection";
import { puzzlePixelBytes, type PuzzlePixelImage } from "./features";
import { assertPuzzleSize, type PuzzleSize } from "./model";
import type { PixelSize } from "./sampling";
import { isPuzzleRecord, parsePuzzleBinding, PUZZLE_WORKER_PROTOCOL, PuzzleProtocolError, samePuzzleBinding, validPuzzleBudget, type PuzzleTaskBinding, type PuzzleWorkerFailureCode } from "./worker-protocol";

export const PUZZLE_NO_ARTWORK = "none";
export type PuzzleDetectWorkerResult = { readonly status: "suggestions"; readonly suggestions: PuzzleRegionSuggestions } | { readonly status: "invalid" }
  | { readonly status: "failed"; readonly code: PuzzleWorkerFailureCode } | { readonly status: "timeLimit" };
export interface PuzzleDetectInput {
  readonly size: PuzzleSize; readonly screenshot: PuzzlePixelImage;
  readonly artworkSourceId: string; readonly artwork: PuzzlePixelImage | null;
}
export interface PuzzleDetectContext {
  readonly size: PuzzleSize; readonly screenshot: PixelSize; readonly artworkSourceId: string; readonly artwork: PixelSize | null;
}
export interface PuzzleDetectRequest {
  readonly protocol: typeof PUZZLE_WORKER_PROTOCOL; readonly type: "detect"; readonly requestId: number;
  readonly binding: PuzzleTaskBinding; readonly input: PuzzleDetectInput; readonly timeLimitMs: number;
}
export interface PuzzleDetectReply {
  readonly protocol: typeof PUZZLE_WORKER_PROTOCOL; readonly type: "detectResult"; readonly requestId: number;
  readonly binding: PuzzleTaskBinding; readonly result: PuzzleDetectWorkerResult;
}

/** Snapshots metadata and copies only owned pixel views; the source bytes stay with the caller. */
export function preparePuzzleDetect(input: PuzzleDetectInput, copyPixels = true): { context: PuzzleDetectContext; input: PuzzleDetectInput; transfer: Transferable[] } {
  assertPuzzleSize(input.size);
  if (input.artworkSourceId === PUZZLE_NO_ARTWORK) {
    if (input.artwork !== null) throw new RangeError("Artwork needs a source id");
  } else if (typeof input.artworkSourceId !== "string" || !input.artworkSourceId || input.artworkSourceId.length > 1024 || input.artwork === null) {
    throw new RangeError("Invalid artwork source");
  }
  const screenshotBytes = puzzlePixelBytes(input.screenshot);
  if (input.screenshot.width < input.size || input.screenshot.height < input.size) throw new RangeError("Screenshot is smaller than the board");
  const artworkBytes = input.artwork ? puzzlePixelBytes(input.artwork) : null;
  if (input.artwork && (input.artwork.width < input.size || input.artwork.height < input.size)) throw new RangeError("Artwork is smaller than the board");
  const pixels = (image: PuzzlePixelImage, bytes: Uint8Array) => Object.freeze({ width: image.width, height: image.height, rgba: copyPixels ? bytes.slice().buffer : bytes });
  const screenshot = pixels(input.screenshot, screenshotBytes), artwork = input.artwork && artworkBytes ? pixels(input.artwork, artworkBytes) : null;
  const context = Object.freeze({ size: input.size, screenshot: Object.freeze({ width: screenshot.width, height: screenshot.height }), artworkSourceId: input.artworkSourceId,
    artwork: artwork ? Object.freeze({ width: artwork.width, height: artwork.height }) : null });
  return { context, input: Object.freeze({ size: input.size, screenshot, artworkSourceId: input.artworkSourceId, artwork }),
    transfer: copyPixels ? [screenshot.rgba as ArrayBuffer, ...(artwork ? [artwork.rgba as ArrayBuffer] : [])] : [] };
}

export function readPuzzleDetectRequest(value: unknown): PuzzleDetectRequest | null {
  if (!isPuzzleRecord(value) || value.protocol !== PUZZLE_WORKER_PROTOCOL || value.type !== "detect" || !Number.isSafeInteger(value.requestId)
    || (value.requestId as number) <= 0 || !validPuzzleBudget(value.timeLimitMs) || !isPuzzleRecord(value.input)) return null;
  const binding = parsePuzzleBinding(value.binding);
  if (!binding) return null;
  return { protocol: PUZZLE_WORKER_PROTOCOL, type: "detect", requestId: value.requestId as number, binding, input: value.input as unknown as PuzzleDetectInput, timeLimitMs: value.timeLimitMs };
}

const fail = (): never => { throw new PuzzleProtocolError(); };
const numeric = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min - 1e-8 && value <= max + 1e-8;
const whole = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && numeric(value, min, max);

function candidate(value: unknown, context: PuzzleDetectContext): PuzzleRegionCandidate {
  if (!isPuzzleRecord(value) || !isPuzzleRecord(value.crop)) return fail();
  const crop = value.crop;
  if (!whole(crop.x, 0, context.screenshot.width) || !whole(crop.y, 0, context.screenshot.height)
    || !whole(crop.width, context.size, context.screenshot.width) || !whole(crop.height, context.size, context.screenshot.height)
    || crop.x + crop.width > context.screenshot.width || crop.y + crop.height > context.screenshot.height) return fail();
  const ratio = crop.width / crop.height, evidence = value.evidence;
  if (ratio < 0.85 || ratio > 1.17 || !numeric(value.score, 0, 1)) return fail();
  if (evidence !== "grid" && evidence !== "weakGrid" && evidence !== "artwork") return fail();
  if (evidence === "artwork" && !context.artwork) return fail();
  return Object.freeze({ crop: Object.freeze({ x: crop.x, y: crop.y, width: crop.width, height: crop.height }), score: value.score, evidence });
}

/** Bounded receiving-realm validation: crops, scores and labels only; detection is never re-run here. */
export function validatePuzzleDetectReply(value: unknown, requestId: number, binding: PuzzleTaskBinding, context: PuzzleDetectContext): PuzzleDetectWorkerResult {
  if (!isPuzzleRecord(value) || value.protocol !== PUZZLE_WORKER_PROTOCOL || value.type !== "detectResult" || value.requestId !== requestId) return fail();
  const received = parsePuzzleBinding(value.binding);
  if (!received || !samePuzzleBinding(received, binding) || !isPuzzleRecord(value.result)) return fail();
  const result = value.result;
  if (result.status === "invalid") return Object.freeze({ status: "invalid" });
  if (result.status === "timeLimit") return Object.freeze({ status: "timeLimit" });
  if (result.status === "failed") {
    if (!["protocol", "worker", "message", "runtime", "scope"].includes(String(result.code))) return fail();
    return Object.freeze({ status: "failed", code: result.code as PuzzleWorkerFailureCode });
  }
  if (result.status !== "suggestions" || !isPuzzleRecord(result.suggestions) || result.suggestions.reviewRequired !== true
    || !Array.isArray(result.suggestions.candidates) || result.suggestions.candidates.length > 5) return fail();
  const candidates = result.suggestions.candidates.map(item => candidate(item, context));
  if (candidates.some((item, index) => index > 0 && item.score > candidates[index - 1]!.score + 1e-8)) return fail();
  return Object.freeze({ status: "suggestions", suggestions: Object.freeze({ reviewRequired: true as const, candidates: Object.freeze(candidates) }) });
}
