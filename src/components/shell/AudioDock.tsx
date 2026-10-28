"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { storageKeys } from "@/config/storage";
import { t } from "@/i18n";
import { next, pause, play, previous, removeFromQueue, restore, seek, setMode, setVolume, stop, type AudioTrack, type PlaybackMode } from "@/lib/audio/player";
import { useAudioPlayer } from "@/lib/audio/use-audio-player";
import { safeGetLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

interface Props {
  locale: AppLocale;
}

const MODES: readonly PlaybackMode[] = ["sequential", "repeat-all", "repeat-one", "shuffle"];
const STORAGE_KEY = storageKeys.audioDock;

interface SavedDock {
  queue: AudioTrack[];
  queueIndex: number;
  currentTime: number;
  duration: number;
  mode: PlaybackMode;
  volume: number;
}

function isTrack(value: unknown): value is AudioTrack {
  const track = value as AudioTrack | null;
  return Boolean(track && typeof track.id === "string" && typeof track.src === "string" && typeof track.title === "string");
}

function readSaved(): SavedDock | null {
  try {
    const raw = JSON.parse(safeGetLocalStorage(STORAGE_KEY) ?? "null") as Partial<SavedDock> | null;
    if (!raw || !Array.isArray(raw.queue)) return null;
    const queue = raw.queue.filter(isTrack);
    if (!queue.length) return null;
    return {
      queue,
      queueIndex: typeof raw.queueIndex === "number" ? raw.queueIndex : 0,
      currentTime: typeof raw.currentTime === "number" ? raw.currentTime : 0,
      duration: typeof raw.duration === "number" ? raw.duration : 0,
      mode: MODES.includes(raw.mode as PlaybackMode) ? (raw.mode as PlaybackMode) : "sequential",
      volume: typeof raw.volume === "number" ? Math.max(0, Math.min(1, raw.volume)) : 1,
    };
  } catch {
    return null;
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The site-wide mini player: an M3 surface fixed to the bottom while the audio player has a track. It keeps the queue,
 * track and position across page loads (without playing on its own) and answers the system's media keys.
 */
function AudioDock({ locale }: Props) {
  const state = useAudioPlayer();
  const [showQueue, setShowQueue] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const restored = useRef(false);

  // Restore the last session's queue once, before anything else plays.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readSaved();
    if (saved) restore(saved);
  }, []);

  // Remember the queue and position (time updates are throttled to whole seconds).
  const savedSecond = useRef(-1);
  useEffect(() => {
    if (!restored.current) return;
    if (!state.track && state.queue.length === 0) {
      safeRemoveLocalStorage(STORAGE_KEY);
      return;
    }
    const second = Math.floor(state.currentTime);
    if (second === savedSecond.current && state.status === "playing") return;
    savedSecond.current = second;
    const queue = state.queue.length ? [...state.queue] : state.track ? [state.track] : [];
    const queueIndex = state.queue.length ? state.queueIndex : 0;
    safeSetLocalStorage(STORAGE_KEY, JSON.stringify({ queue, queueIndex, currentTime: state.currentTime, duration: state.duration, mode: state.mode, volume: state.volume } satisfies SavedDock));
  }, [state]);

  // System media controls (keyboard media keys, lock screen).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => play()],
      ["pause", () => pause()],
      ["previoustrack", () => previous()],
      ["nexttrack", () => next()],
      ["stop", () => stop()],
      ["seekto", (details) => { if (typeof details.seekTime === "number") seek(details.seekTime); }],
    ];
    for (const [action, handler] of handlers) {
      try { session.setActionHandler(action, handler); } catch { /* unsupported action */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { session.setActionHandler(action, null); } catch { /* unsupported action */ }
      }
    };
  }, []);

  const track = state.track;
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = track ? new MediaMetadata({ title: track.title, artist: track.subtitle ?? "", artwork: track.artwork ? [{ src: track.artwork }] : [] }) : null;
  }, [track]);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = state.status === "playing" ? "playing" : track ? "paused" : "none";
  }, [state.status, track]);

  // Leave room for the dock at the bottom of the page (and lift the scroll-to-top button above it).
  useEffect(() => {
    const root = document.documentElement;
    if (track) root.dataset.audioDock = "open";
    else delete root.dataset.audioDock;
    return () => { delete root.dataset.audioDock; };
  }, [track]);

  if (!track) return null;

  const playing = state.status === "playing" || state.status === "loading";
  const duration = state.duration || 0;
  const time = dragTime ?? state.currentTime;
  const modeIndex = MODES.indexOf(state.mode);
  const nextMode = MODES[(modeIndex + 1) % MODES.length]!;
  const modeLabel = t(locale, "audio.dock.mode", { mode: t(locale, `audio.modes.${state.mode}`) });
  const close = () => {
    stop();
    // Closing forgets the queue too: the dock is gone until something plays again.
    restore({ queue: [], queueIndex: -1 });
    safeRemoveLocalStorage(STORAGE_KEY);
    setShowQueue(false);
  };
  const commitSeek = () => {
    if (dragTime !== null) {
      seek(dragTime);
      setDragTime(null);
    }
  };

  return (
    <section
      aria-label={t(locale, "audio.dock.label")}
      className="mn-audio-dock mn-shell-offset fixed inset-x-2 bottom-2 z-40 mx-auto max-w-3xl overflow-hidden rounded-shape-lg bg-surface-container-high text-on-surface shadow-elevation-3 md:left-[calc(var(--mn-sidebar-offset,17rem)+1rem)]"
    >
      {showQueue && (
        <div className="max-h-[40vh] overflow-y-auto border-b border-outline-variant py-2">
          <h2 className="px-4 pb-1 text-title-small text-on-surface-variant">{t(locale, "audio.dock.queue")}</h2>
          {state.queue.length === 0 ? (
            <p className="px-4 py-3 text-body-medium text-on-surface-variant">{t(locale, "audio.dock.queueEmpty")}</p>
          ) : (
            <ol>
              {state.queue.map((entry, index) => {
                const current = index === state.queueIndex;
                return (
                  <li key={`${entry.id}-${index}`} className={`flex items-center gap-2 pr-2 ${current ? "bg-secondary-container text-on-secondary-container" : ""}`}>
                    <button type="button" onClick={() => play(entry)} aria-current={current ? "true" : undefined} className="md3-state flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 text-left">
                      {entry.artwork ? <img src={entry.artwork} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-shape-sm object-cover" /> : <span className="h-10 w-10 shrink-0 rounded-shape-sm bg-surface-container-highest" />}
                      <span className="min-w-0">
                        <span className="block truncate text-body-large">{entry.title}</span>
                        {entry.subtitle && <span className={`block truncate text-body-small ${current ? "" : "text-on-surface-variant"}`}>{entry.subtitle}</span>}
                      </span>
                    </button>
                    <DockButton label={t(locale, "audio.dock.remove", { title: entry.title })} onClick={() => removeFromQueue(index)} small><path d="M6 6l12 12M18 6 6 18" /></DockButton>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 p-2 pl-3">
        {track.artwork ? <img src={track.artwork} alt="" className="h-12 w-12 shrink-0 rounded-shape-sm object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-shape-sm bg-surface-container-highest" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-title-small">{track.title}</p>
          {track.subtitle && <p className="truncate text-body-small text-on-surface-variant">{track.subtitle}</p>}
          <div className="flex items-center gap-3 text-label-small tabular-nums text-on-surface-variant">
            <span>{formatTime(time)}</span>
            <Slider
              size="small"
              min={0}
              max={duration || 1}
              step={0.1}
              value={Math.min(time, duration || 1)}
              disabled={!duration}
              aria-label={t(locale, "audio.dock.seek")}
              onChange={(_, value) => setDragTime(value as number)}
              onChangeCommitted={commitSeek}
              className="!py-2"
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <DockButton label={t(locale, "audio.previous")} onClick={previous} className="max-sm:!hidden"><path d="M7 6v12M18 6l-8 6 8 6z" /></DockButton>
          <DockButton label={t(locale, playing ? "audio.pause" : "audio.play")} onClick={() => (playing ? pause() : play())} primary>
            {playing ? <path d="M9 6v12M15 6v12" /> : <path d="M8 5.5v13l10-6.5z" />}
          </DockButton>
          <DockButton label={t(locale, "audio.next")} onClick={next}><path d="M17 6v12M6 6l8 6-8 6z" /></DockButton>
          <DockButton label={modeLabel} onClick={() => setMode(nextMode)} pressed={state.mode !== "sequential"} className="max-sm:!hidden">
            <ModeIcon mode={state.mode} />
          </DockButton>
          <div className="hidden w-24 items-center px-2 md:flex">
            <Slider size="small" min={0} max={1} step={0.05} value={state.volume} onChange={(_, value) => setVolume(value as number)} aria-label={t(locale, "audio.dock.volume")} />
          </div>
          <DockButton label={t(locale, showQueue ? "audio.dock.collapse" : "audio.dock.expand")} onClick={() => setShowQueue((value) => !value)} pressed={showQueue}><path d="M4 6h16M4 12h16M4 18h10" /></DockButton>
          <DockButton label={t(locale, "audio.dock.close")} onClick={close}><path d="M6 6l12 12M18 6 6 18" /></DockButton>
        </div>
      </div>
    </section>
  );
}

function ModeIcon({ mode }: { mode: PlaybackMode }) {
  if (mode === "shuffle") return <><path d="M4 7h3l10 10h3M4 17h3l10-10h3" /><path d="m18 4 3 3-3 3M18 14l3 3-3 3" /></>;
  if (mode === "repeat-one") return <><path d="M4 11V9a3 3 0 0 1 3-3h13l-3-3M20 13v2a3 3 0 0 1-3 3H4l3 3" /><path d="M12 10v5" /></>;
  if (mode === "repeat-all") return <path d="M4 11V9a3 3 0 0 1 3-3h13l-3-3M20 13v2a3 3 0 0 1-3 3H4l3 3" />;
  return <path d="M4 7h12M4 12h12M4 17h8M18 14v6l3-3" />;
}

/** M3 icon button: standard, filled (play/pause) or toggle (`pressed`). */
function DockButton({ label, onClick, children, primary = false, small = false, pressed, className = "" }: { label: string; onClick: () => void; children: ReactNode; primary?: boolean; small?: boolean; pressed?: boolean; className?: string }) {
  return (
    <Tooltip title={label}>
      <IconButton
        onClick={onClick}
        aria-label={label}
        size={small ? "small" : "medium"}
        className={className}
        data-variant={primary ? "filled" : pressed ? "tonal" : undefined}
        {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
      </IconButton>
    </Tooltip>
  );
}

export default withMd3(AudioDock);
