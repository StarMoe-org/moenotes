"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { pause as pauseSitePlayer } from "@/lib/audio/player";
import { ClipAudioEngine, ClipBlockedError, type ClipRequest } from "@/lib/guess-music/clip-audio";
import GuessIcon from "./GuessIcon";

type PlayerStatus = "loading" | "blocked" | "ready" | "playing" | "ended" | "error";

/** The elapsed-time label updates in tenths of a second. */
const LABEL_STEP = 0.1;

export interface ClipPlayerProps {
  locale: AppLocale;
  /** The clip of the current round; null hides the player content. */
  clip: ClipRequest | null;
  /** The next round's clip, preloaded once the current one is ready. */
  nextClip?: ClipRequest | null;
  /** Start playing as soon as the clip is ready. */
  autoPlay: boolean;
  /** Sound started (the round timer starts here). */
  onStarted: (clipStart: number) => void;
  /** The audio could not be loaded. */
  onError: () => void;
}

/**
 * Plays exactly `clipSeconds` of a song from the clip start. Autoplays when it can and falls back to a play button;
 * the clip can be replayed at will. The audio stops when the player unmounts.
 */
export default function ClipPlayer({ locale, clip, nextClip, autoPlay, onStarted, onError }: ClipPlayerProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.player.${key}`, params);
  const engineRef = useRef<ClipAudioEngine | null>(null);
  const clipKey = clip?.key ?? null;
  // State belongs to one clip: a new clip reads as loading until its own state arrives.
  const [player, setPlayer] = useState<{ key: string | null; status: PlayerStatus; progress: number }>({ key: null, status: "loading", progress: 0 });
  const status: PlayerStatus = player.key === clipKey ? player.status : "loading";
  const progress = player.key === clipKey ? player.progress : 0;
  const latest = useRef({ onStarted, onError, autoPlay, clip });
  useEffect(() => {
    latest.current = { onStarted, onError, autoPlay, clip };
  });

  const update = useCallback((key: string, patch: Partial<{ status: PlayerStatus; progress: number }>) => {
    setPlayer((current) => {
      if (current.key !== key) return { key, status: "loading", progress: 0, ...patch };
      const unchanged = (patch.status === undefined || patch.status === current.status) && (patch.progress === undefined || patch.progress === current.progress);
      return unchanged ? current : { ...current, ...patch };
    });
  }, []);

  // One engine per mounted player.
  useEffect(() => {
    const engine = new ClipAudioEngine();
    const currentKey = () => latest.current.clip?.key ?? null;
    engine.setListener({
      onPlaying: (clipStart) => {
        const key = currentKey();
        if (key === null) return;
        // The site's music player would play over the clip.
        pauseSitePlayer();
        update(key, { status: "playing" });
        latest.current.onStarted(clipStart);
      },
      onProgress: (fraction) => {
        const key = currentKey();
        const seconds = latest.current.clip?.clipSeconds ?? 0;
        if (key === null || seconds <= 0) return;
        // Tenths are plenty for the label, and keep re-renders far below the frame rate.
        const steps = seconds / LABEL_STEP;
        update(key, { progress: fraction >= 1 ? 1 : Math.floor(fraction * steps + 1e-6) / steps });
      },
      onEnded: () => {
        const key = currentKey();
        if (key !== null) update(key, { status: "ended" });
      },
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [update]);

  const play = useCallback(async (key: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.play(key);
    } catch (error) {
      if (engineRef.current !== engine) return;
      update(key, { status: error instanceof ClipBlockedError ? "blocked" : "ready" });
    }
  }, [update]);

  useEffect(() => {
    const engine = engineRef.current;
    const request = latest.current.clip;
    if (!engine || !request || clipKey === null) return;
    let cancelled = false;
    engine.stop();
    engine.load(request).then(
      () => {
        if (cancelled) return;
        update(request.key, { status: "ready" });
        if (latest.current.autoPlay) void play(request.key);
      },
      (error: Error) => {
        if (cancelled || error.name === "AbortError") return;
        update(request.key, { status: "error" });
        latest.current.onError();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [clipKey, play, update]);

  // Preload the next round once the current clip no longer competes for bandwidth.
  const nextKey = nextClip?.key ?? null;
  const nextRef = useRef(nextClip);
  useEffect(() => {
    nextRef.current = nextClip;
  });
  const currentLoaded = status !== "loading";
  useEffect(() => {
    const next = nextRef.current;
    if (!currentLoaded || !next || nextKey === null) return;
    engineRef.current?.preload(next);
  }, [currentLoaded, nextKey]);

  // play() must start inside the click handler, before any await: Safari refuses it otherwise.
  const handlePlay = () => {
    if (!clip) return;
    update(clip.key, { progress: 0 });
    void play(clip.key);
  };

  // Autoplay refused: the button is the only way on, so give it the focus nobody else holds.
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (status !== "blocked") return;
    const focused = document.activeElement;
    if (!focused || focused === document.body) buttonRef.current?.focus({ preventScroll: true });
  }, [status]);

  const clipSeconds = clip?.clipSeconds ?? 0;
  const elapsed = Math.min(clipSeconds, progress * clipSeconds);
  const playing = status === "playing";
  const label = status === "blocked" ? "tapToPlay" : status === "error" ? "failed" : playing ? "playing" : status === "ended" ? "ended" : status === "loading" ? "loading" : "ready";

  return (
    <section className="gm-panel gm-player" aria-label={tr("label")}>
      {status === "loading" ? (
        <span className="gm-spinner" role="img" aria-label={tr("loading")} />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className={`gm-play md3-state${playing ? " is-playing" : ""}${status === "blocked" ? " is-waiting" : ""}`}
          onClick={handlePlay}
          disabled={status === "error"}
          aria-label={tr(status === "ended" || playing ? "replay" : "play")}
        >
          <GuessIcon name={playing ? "playing" : status === "ended" ? "replay" : status === "error" ? "warning" : "play"} size={30} />
        </button>
      )}
      <div className="gm-player-body">
        <div className="gm-between">
          <span className="gm-player-state" aria-live="polite">{tr(label)}</span>
          <span className="gm-muted gm-num">{tr("position", { elapsed: elapsed.toFixed(1), total: clipSeconds })}</span>
        </div>
        <div className="gm-bar" role="progressbar" aria-label={tr("progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </section>
  );
}
