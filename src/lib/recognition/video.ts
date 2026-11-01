import type {
  RecognitionBinding,
  RecognitionResult,
  RecognizedCard,
  RecognizedValue,
} from "./protocol";

export const VIDEO_FRAME_STEP_SECONDS = 0.25;
export const VIDEO_MAX_FRAMES = 600;
export const VIDEO_MAX_SIDE = 4096;
export const VIDEO_MIN_IDENTITY_SIMILARITY = 0.8;
export const VIDEO_MIN_AGREEMENT_FRAMES = 2;

export interface ExtractedVideoFrame {
  readonly frame: Blob;
  readonly width: number;
  readonly height: number;
  readonly index: number;
  readonly total: number;
}

export interface VideoFrameRecognitionEntry {
  readonly result: RecognitionResult;
  readonly frame: Blob;
  readonly width: number;
  readonly height: number;
}

export interface ConsolidatedVideoRecognition {
  readonly result: RecognitionResult;
  readonly previewFrame: Blob | null;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly totalFrames: number;
  readonly recognizedFrames: number;
}

export function isVideoImportFile(file: { readonly type?: string; readonly name?: string }): boolean {
  if (typeof file.type === "string" && file.type.startsWith("video/")) return true;
  if (typeof file.name === "string" && /\.(mp4|webm|mov|m4v)$/i.test(file.name)) return true;
  return false;
}

export async function sha256BlobHex(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function waitVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadeddata" | "seeked",
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const cleanup = () => {
      video.removeEventListener(eventName, onDone);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("video-decode"));
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    video.addEventListener(eventName, onDone, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Samples JPEG frames every `0.25s` from a screen-recorded Box video locally in the browser.
 * No video bytes leave the device.
 */
export async function* extractVideoFrames(
  file: Blob,
  signal: AbortSignal,
  stepSeconds = VIDEO_FRAME_STEP_SECONDS,
): AsyncGenerator<ExtractedVideoFrame> {
  signal.throwIfAborted();
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;
  try {
    await waitVideoEvent(video, "loadeddata", signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error("video-decode");
    }
    const total = Math.max(1, Math.ceil(video.duration / stepSeconds));
    if (total > VIDEO_MAX_FRAMES) {
      throw new RangeError("video-too-long");
    }
    const scale = Math.min(1, VIDEO_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("video-canvas");

    for (let index = 0; index < total; index++) {
      signal.throwIfAborted();
      const targetTime = Math.min(index * stepSeconds, Math.max(0, video.duration - 0.001));
      if (Math.abs(video.currentTime - targetTime) > 1e-4) {
        const seeked = waitVideoEvent(video, "seeked", signal);
        video.currentTime = targetTime;
        await seeked;
      }
      context.drawImage(video, 0, 0, width, height);
      const frame = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("video-frame"))), "image/jpeg", 0.92);
      });
      signal.throwIfAborted();
      yield { frame, width, height, index: index + 1, total };
    }
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

interface ValueTallies {
  count: number;
  best: RecognizedValue;
}

function recordReading(map: Map<number, ValueTallies>, reading: RecognizedValue): void {
  if (reading.value === null) return;
  const existing = map.get(reading.value);
  if (!existing) {
    map.set(reading.value, { count: 1, best: reading });
    return;
  }
  existing.count += 1;
  if ((reading.confidence ?? 0) > (existing.best.confidence ?? 0)) {
    existing.best = reading;
  }
}

function resolveConsensusValue(
  map: Map<number, ValueTallies>,
  minFrames = VIDEO_MIN_AGREEMENT_FRAMES,
): RecognizedValue {
  const ranked = [...map.entries()].sort(
    (a, b) => b[1].count - a[1].count || (b[1].best.confidence ?? 0) - (a[1].best.confidence ?? 0),
  );
  const first = ranked[0];
  const second = ranked[1];
  if (first && first[1].count >= minFrames && (!second || first[1].count > second[1].count)) {
    return first[1].best;
  }
  return { value: null, reason: "unread-or-disagreeing" };
}

/**
 * Consolidates per-frame `RecognitionResult`s from a scrolled Box video into one consensus `RecognitionResult`:
 * - Keeps cards matched in `>= 2` frames with peak `identitySimilarity >= 0.80` (eliminating mid-scroll artifacts).
 * - Assigns `level`, `card_rank`, and `awake_count` only when `>= 2` frames agree strictly ahead of any runner-up.
 */
export function consolidateVideoRecognitionResults(
  entries: readonly VideoFrameRecognitionEntry[],
  binding: RecognitionBinding,
  sourceId: string,
  totalFrames = entries.length,
): ConsolidatedVideoRecognition {
  interface SeenCard {
    frames: number;
    bestSimilarity: number;
    bestCard: RecognizedCard;
    bestEntry: VideoFrameRecognitionEntry;
    levels: Map<number, ValueTallies>;
    ranks: Map<number, ValueTallies>;
    awakes: Map<number, ValueTallies>;
  }

  const seen = new Map<string, SeenCard>();
  let templateScope: RecognitionResult["scope"] | undefined;
  let totalElapsedMs = 0;
  let fallbackPreview: VideoFrameRecognitionEntry | null = null;

  for (const entry of entries) {
    totalElapsedMs += entry.result.elapsedMs;
    if (entry.result.status !== "complete") continue;
    if (!templateScope && entry.result.scope) templateScope = entry.result.scope;
    if (!fallbackPreview) fallbackPreview = entry;

    const seenInThisFrame = new Set<string>();
    for (const card of entry.result.cards) {
      const key = `${card.kind}:${card.id}`;
      if (seenInThisFrame.has(key)) continue;
      seenInThisFrame.add(key);

      let state = seen.get(key);
      if (!state) {
        state = {
          frames: 0,
          bestSimilarity: card.identitySimilarity,
          bestCard: card,
          bestEntry: entry,
          levels: new Map(),
          ranks: new Map(),
          awakes: new Map(),
        };
        seen.set(key, state);
      }
      state.frames += 1;
      if (card.identitySimilarity > state.bestSimilarity) {
        state.bestSimilarity = card.identitySimilarity;
        state.bestCard = card;
        state.bestEntry = entry;
      }
      recordReading(state.levels, card.level);
      recordReading(state.ranks, card.card_rank);
      recordReading(state.awakes, card.awake_count);
    }
  }

  const cards: RecognizedCard[] = [];
  let previewEntry: VideoFrameRecognitionEntry | null = fallbackPreview;
  for (const state of seen.values()) {
    if (state.frames < VIDEO_MIN_AGREEMENT_FRAMES || state.bestSimilarity < VIDEO_MIN_IDENTITY_SIMILARITY) {
      continue;
    }
    if (previewEntry === fallbackPreview) previewEntry = state.bestEntry;
    cards.push({
      ...state.bestCard,
      level: resolveConsensusValue(state.levels),
      card_rank: resolveConsensusValue(state.ranks),
      awake_count: resolveConsensusValue(state.awakes),
    });
  }

  const result: RecognitionResult = {
    type: "result",
    binding,
    status: templateScope ? "complete" : "failed",
    cards,
    unidentified: [],
    sourceId,
    elapsedMs: totalElapsedMs,
    ...(templateScope ? { scope: templateScope } : { error: "No valid video frames were recognized" }),
  };

  return {
    result,
    previewFrame: previewEntry?.frame ?? null,
    previewWidth: previewEntry?.width ?? 0,
    previewHeight: previewEntry?.height ?? 0,
    totalFrames,
    recognizedFrames: entries.length,
  };
}
