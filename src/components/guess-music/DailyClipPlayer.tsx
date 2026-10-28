"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { pause as pauseSitePlayer } from "@/lib/audio/player";
import GuessIcon from "./GuessIcon";

/** 10 ms of silence: playing it tells whether the page may play sound, and a tap that plays it lets this element play later. */
const SILENCE =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

export interface DailyClipPlayerProps {
  locale: AppLocale;
  /** Object URL of the opened clip; null while it downloads or waits for its key. */
  src: string | null;
  clipSeconds: number;
  failed: boolean;
  /** How much of the sealed clip has arrived (0-1), when its length is known. */
  loadProgress?: number | undefined;
  onRetry: () => void;
  /** Play as soon as the clip opens (falls back to a button when the browser refuses). */
  autoPlay: boolean;
  /**
   * Set while the clip is downloaded but sealed. Its key starts the round timer, so this is called only once the page
   * may play sound: right away when the browser allows it, else from the player's tap.
   */
  onUnlock?: (() => void) | undefined;
}

/** The daily round's clip: the server cut it, so it always plays from 0; it can be replayed at will. */
export default function DailyClipPlayer({ locale, src, clipSeconds, failed, loadProgress, onRetry, autoPlay, onUnlock }: DailyClipPlayerProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const audioRef = useRef<HTMLAudioElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(clipSeconds);

  // A new clip starts from a clean slate.
  const [prevSrc, setPrevSrc] = useState(src);
  if (prevSrc !== src) {
    setPrevSrc(src);
    setPosition(0);
    setPlaying(false);
    setBlocked(false);
  }

  // Progress in tenths while playing: plenty for the label, far below the frame rate.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const audio = audioRef.current;
      if (audio) setPosition(Math.floor(audio.currentTime * 10) / 10);
    }, 100);
    return () => clearInterval(timer);
  }, [playing]);

  const isSilence = () => audioRef.current?.getAttribute("src") === SILENCE;

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audio.src || audio.getAttribute("src") === SILENCE) return;
    audio.currentTime = 0;
    setPosition(0);
    try {
      await audio.play();
      setBlocked(false);
    } catch (error) {
      if ((error as { name?: string })?.name === "NotAllowedError") setBlocked(true);
    }
  }, []);

  /** Plays the silence on this element; resolves false when the browser wants a tap first. */
  const playSilence = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;
    audio.src = SILENCE;
    try {
      await audio.play();
      return true;
    } catch (error) {
      return (error as { name?: string })?.name !== "NotAllowedError";
    } finally {
      // The clip may have taken the element over meanwhile (its key came back first): leave it playing.
      if (audio.getAttribute("src") === SILENCE) audio.pause();
    }
  }, []);

  const unlockRef = useRef(onUnlock);
  useEffect(() => {
    unlockRef.current = onUnlock;
  });
  const locked = Boolean(onUnlock) && !src && !failed;

  // A sealed clip opens as soon as this element may play: autoplay allowed, or an earlier tap let it.
  useEffect(() => {
    if (!locked) return;
    let cancelled = false;
    void playSilence().then((allowed) => {
      if (cancelled) return;
      if (allowed) unlockRef.current?.();
      else setBlocked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [locked, playSilence]);

  // Read when the clip loads only: the reveal turning autoplay off must not restart it.
  const autoPlayRef = useRef(autoPlay);
  useEffect(() => {
    autoPlayRef.current = autoPlay;
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!src) {
      if (!isSilence()) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      return;
    }
    audio.src = src;
    audio.load();
    if (autoPlayRef.current) {
      audio.play().catch((error: { name?: string }) => {
        if (error?.name === "NotAllowedError") setBlocked(true);
      });
    }
    return () => audio.pause();
  }, [src]);

  // Autoplay refused: the button is the only way on, so give it the focus nobody else holds.
  useEffect(() => {
    if (!blocked) return;
    const focused = document.activeElement;
    if (!focused || focused === document.body) buttonRef.current?.focus({ preventScroll: true });
  }, [blocked]);

  // In the tap itself: playing the silence there lets this element play the clip once its key is in.
  const onButton = () => {
    if (failed) {
      onRetry();
    } else if (locked) {
      setBlocked(false);
      void playSilence();
      unlockRef.current?.();
    } else {
      void play();
    }
  };

  const ready = Boolean(src) && !failed;
  const waitingForTap = locked && blocked;
  const loading = !failed && !ready && !waitingForTap;
  const total = duration > 0 ? duration : clipSeconds;
  const fraction = loading ? (loadProgress ?? 0) : total > 0 ? Math.min(1, position / total) : 0;
  const label = failed
    ? "player.failed"
    : waitingForTap
      ? "player.tapToStart"
      : loading
        ? "player.loading"
        : blocked
          ? "player.tapToPlay"
          : playing
            ? "player.playing"
            : position > 0
              ? "player.ended"
              : "player.ready";

  return (
    <section className="gm-panel gm-player" aria-label={tr("player.label")}>
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => {
          if (isSilence()) return;
          // The site's music player would play over the clip.
          pauseSitePlayer();
          setPlaying(true);
          setBlocked(false);
        }}
        onPause={() => {
          if (!isSilence()) setPlaying(false);
        }}
        onEnded={() => {
          if (isSilence()) return;
          setPlaying(false);
          setPosition(total);
        }}
        // load() stops playback without a pause event.
        onEmptied={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (!isSilence() && Number.isFinite(value) && value > 0) setDuration(value);
        }}
      />
      {loading ? (
        <span className="gm-spinner" role="img" aria-label={tr("player.loading")} />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className={`gm-play md3-state${playing ? " is-playing" : ""}${blocked ? " is-waiting" : ""}`}
          onClick={onButton}
          aria-label={tr(failed ? "player.retry" : playing || position > 0 ? "player.replay" : "player.play")}
        >
          <GuessIcon name={failed ? "refresh" : playing ? "playing" : position > 0 ? "replay" : "play"} size={30} />
        </button>
      )}
      <div className="gm-player-body">
        <div className="gm-between">
          <span className="gm-player-state" aria-live="polite">{tr(label)}</span>
          {!loading && <span className="gm-muted gm-num">{tr("player.position", { elapsed: Math.min(position, total).toFixed(1), total: clipSeconds })}</span>}
        </div>
        <div className="gm-bar" role="progressbar" aria-label={tr(loading ? "player.loading" : "player.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
          <span style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>
    </section>
  );
}
