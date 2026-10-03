/**
 * Site-wide audio player: one `HTMLAudioElement` for the whole page, so only one track ever plays (starting another
 * stops the previous one). Components subscribe to its state (AudioPlayButton now, a mini player bar later).
 *
 * Safe to import and call during SSR: without `window`/`Audio` it keeps state but never touches media.
 */

export interface AudioTrack {
  id: string;
  src: string;
  title: string;
  subtitle?: string;
  artwork?: string;
}

export type AudioStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type PlaybackMode = "sequential" | "repeat-all" | "repeat-one" | "shuffle";

export interface AudioPlayerState {
  track: AudioTrack | null;
  status: AudioStatus;
  /** Seconds. */
  currentTime: number;
  duration: number;
  queue: readonly AudioTrack[];
  /** Index of `track` in `queue`, or -1 when it was played on its own. */
  queueIndex: number;
  mode: PlaybackMode;
  volume: number;
}

export type AudioPlayerListener = (state: AudioPlayerState) => void;

const initialState: AudioPlayerState = { track: null, status: "idle", currentTime: 0, duration: 0, queue: [], queueIndex: -1, mode: "sequential", volume: 1 };

let state: AudioPlayerState = initialState;
const listeners = new Set<AudioPlayerListener>();
let audio: HTMLAudioElement | null = null;
/** Shuffle order of queue indices, regenerated when the queue or mode changes. */
let shuffleOrder: number[] = [];
/** Position to start a restored track from on its first play (restore()). */
let pendingSeek = 0;

function setState(patch: Partial<AudioPlayerState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

function element(): HTMLAudioElement | null {
  if (audio) return audio;
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  audio = new Audio();
  audio.preload = "metadata";
  audio.volume = state.volume;
  // Media events only move the state forward from what the calls above set (a source switch can fire stray events).
  const media = audio;
  media.addEventListener("waiting", () => { if (state.status === "playing") setState({ status: "loading" }); });
  media.addEventListener("playing", () => { if (state.track) setState({ status: "playing" }); });
  media.addEventListener("pause", () => { if (state.status === "playing" && !media.ended) setState({ status: "paused" }); });
  media.addEventListener("timeupdate", () => { if (state.track) setState({ currentTime: media.currentTime }); });
  media.addEventListener("durationchange", () => { if (state.track) setState({ duration: Number.isFinite(media.duration) ? media.duration : 0 }); });
  media.addEventListener("error", () => { if (state.track && media.getAttribute("src")) setState({ status: "error" }); });
  media.addEventListener("ended", () => handleEnded());
  return media;
}

function shuffled(length: number, first: number): number[] {
  const rest = Array.from({ length }, (_, index) => index).filter((index) => index !== first);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return first >= 0 && first < length ? [first, ...rest] : rest;
}

function load(track: AudioTrack, queueIndex: number): void {
  const media = element();
  // A restored track resumes where it was left (restore()); anything else starts from the top.
  const from = pendingSeek;
  pendingSeek = 0;
  setState({ track, queueIndex, status: media ? "loading" : "idle", currentTime: from, duration: 0 });
  if (!media) return;
  media.src = track.src;
  media.currentTime = from;
  media.play().catch((error: unknown) => {
    // A newer play()/pause() interrupting this one is not a failure.
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (state.track?.id === track.id) setState({ status: error instanceof DOMException && error.name === "NotAllowedError" ? "paused" : "error" });
  });
}

/** Index after (delta 1) or before (delta -1) the current one under the playback mode, or -1 at the end. */
export function adjacentQueueIndex(queueLength: number, index: number, delta: 1 | -1, mode: PlaybackMode, order: readonly number[] = []): number {
  if (queueLength === 0) return -1;
  if (mode === "shuffle" && order.length === queueLength) {
    const position = order.indexOf(index);
    const next = position + delta;
    if (next >= 0 && next < order.length) return order[next]!;
    return -1;
  }
  const next = index + delta;
  if (next >= 0 && next < queueLength) return next;
  if (mode === "repeat-all") return (next + queueLength) % queueLength;
  return -1;
}

function handleEnded(): void {
  if (state.mode === "repeat-one" && state.track) {
    load(state.track, state.queueIndex);
    return;
  }
  const nextIndex = state.queueIndex < 0 ? -1 : adjacentQueueIndex(state.queue.length, state.queueIndex, 1, state.mode, shuffleOrder);
  const next = nextIndex >= 0 ? state.queue[nextIndex] : undefined;
  if (next) load(next, nextIndex);
  else setState({ status: "paused", currentTime: 0 });
}

export function getState(): AudioPlayerState {
  return state;
}

/** Calls `listener` now and on every change; returns the unsubscribe function. */
export function subscribe(listener: AudioPlayerListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => { listeners.delete(listener); };
}

/** Plays `track` (resuming it when it is the paused current track), stopping anything else. */
export function play(track?: AudioTrack): void {
  const target = track ?? state.track;
  if (!target) return;
  if (state.track?.id === target.id && state.track.src === target.src && state.status !== "error") {
    const media = element();
    if (!media) return;
    if (state.status === "paused" || state.status === "idle") {
      if (!media.getAttribute("src")) { load(target, state.queueIndex); return; }
      setState({ status: "loading" });
      media.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    }
    return;
  }
  const queueIndex = state.queue.findIndex((entry) => entry.id === target.id);
  load(target, queueIndex);
}

export function pause(): void {
  if (state.status === "playing" || state.status === "loading") {
    audio?.pause();
    setState({ status: "paused" });
  }
}

/** Stops playback and forgets the current track (the queue stays). */
export function stop(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  setState({ track: null, status: "idle", currentTime: 0, duration: 0, queueIndex: -1 });
}

/** Pause when `track` is playing (or loading), play it otherwise. */
export function toggle(track: AudioTrack): void {
  const isCurrent = state.track?.id === track.id;
  if (isCurrent && (state.status === "playing" || state.status === "loading")) pause();
  else play(track);
}

export function seek(seconds: number): void {
  const media = element();
  if (!media || !state.track) return;
  media.currentTime = Math.max(0, Math.min(seconds, state.duration || seconds));
  setState({ currentTime: media.currentTime });
}

export function setVolume(volume: number): void {
  const value = Math.max(0, Math.min(1, volume));
  if (audio) audio.volume = value;
  setState({ volume: value });
}

/** Replaces the queue and plays `startIndex` (pass `autoplay: false` to only line it up). */
export function setQueue(tracks: readonly AudioTrack[], startIndex = 0, options: { autoplay?: boolean } = {}): void {
  const queue = [...tracks];
  const index = queue.length ? Math.min(Math.max(startIndex, 0), queue.length - 1) : -1;
  shuffleOrder = shuffled(queue.length, index);
  setState({ queue, queueIndex: index });
  const track = queue[index];
  if (track && options.autoplay !== false) load(track, index);
  else if (track) setState({ track, status: "idle", currentTime: 0, duration: 0 });
}

export function next(): void {
  const index = adjacentQueueIndex(state.queue.length, state.queueIndex, 1, state.mode === "repeat-one" ? "repeat-all" : state.mode, shuffleOrder);
  const track = index >= 0 ? state.queue[index] : undefined;
  if (track) load(track, index);
}

/** Back to the previous track; past the first few seconds, back to the start of the current one. */
export function previous(): void {
  if (state.currentTime > 3 && state.track) {
    seek(0);
    return;
  }
  const index = adjacentQueueIndex(state.queue.length, state.queueIndex, -1, state.mode === "repeat-one" ? "repeat-all" : state.mode, shuffleOrder);
  const track = index >= 0 ? state.queue[index] : undefined;
  if (track) load(track, index);
}

export function setMode(mode: PlaybackMode): void {
  if (mode === "shuffle" && state.mode !== "shuffle") shuffleOrder = shuffled(state.queue.length, state.queueIndex);
  setState({ mode });
}

/** Test hook: forget everything (does not touch listeners). */
export function resetAudioPlayer(): void {
  if (audio) audio.pause();
  audio = null;
  shuffleOrder = [];
  pendingSeek = 0;
  state = initialState;
  for (const listener of listeners) listener(state);
}

/** Drops a queue entry; removing the current track stops it (the rest of the queue stays). */
export function removeFromQueue(index: number): void {
  if (index < 0 || index >= state.queue.length) return;
  const queue = state.queue.filter((_, position) => position !== index);
  shuffleOrder = shuffleOrder.filter((position) => position !== index).map((position) => (position > index ? position - 1 : position));
  if (index === state.queueIndex) {
    setState({ queue });
    stop();
    return;
  }
  setState({ queue, queueIndex: state.queueIndex > index ? state.queueIndex - 1 : state.queueIndex });
}

/**
 * Lines up a saved queue, track and position without playing (after a page load): play() then resumes from
 * `currentTime`. Does nothing while something is already loaded.
 */
export function restore(saved: { queue: readonly AudioTrack[]; queueIndex: number; currentTime?: number; duration?: number; mode?: PlaybackMode; volume?: number }): void {
  if (state.track) return;
  const queue = [...saved.queue];
  const queueIndex = saved.queueIndex >= 0 && saved.queueIndex < queue.length ? saved.queueIndex : -1;
  const track = queueIndex >= 0 ? queue[queueIndex]! : null;
  const mode = saved.mode ?? state.mode;
  shuffleOrder = shuffled(queue.length, queueIndex);
  if (saved.volume !== undefined) setVolume(saved.volume);
  setState({ queue, queueIndex, track, mode, status: "idle", currentTime: track ? saved.currentTime ?? 0 : 0, duration: track ? saved.duration ?? 0 : 0 });
  pendingSeek = track ? saved.currentTime ?? 0 : 0;
}

