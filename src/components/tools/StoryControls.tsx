import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { StoryPlayer } from "ournotes-player/story";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import {
  loadStoryVolumes,
  nextStorySpeed,
  saveStoryVolumes,
  STORY_SPEEDS,
  STORY_VOLUME_CATEGORIES,
  storySpeedLabel,
  storyVolumeLevel,
  type StoryVolume,
  type StoryVolumeCategory,
  type StoryVolumes,
} from "@/lib/story/player-settings";
import {
  AutoIcon,
  CloseIcon,
  ControlsIcon,
  FastForwardIcon,
  FullscreenIcon,
  NextLineIcon,
  PauseIcon,
  PlayIcon,
  ReplayIcon,
  SettingsIcon,
  SkipIcon,
  SpeakerIcon,
  VolumeCategoryIcon,
} from "@/components/tools/story-icons";

/** How long the bar stays after the pointer last moved over the stage while the story plays. */
const IDLE_MS = 2500;

/** What the controls show of the player, read on its events and a few times a second (videos, session swaps). */
interface PlayerState {
  /** A session that has not ended (none while a seek or a language switch replaces it). */
  live: boolean;
  started: boolean;
  paused: boolean;
  ended: boolean;
  auto: boolean;
  speed: number;
  line: number;
  lineCount: number;
  video: { time: number; duration: number; seekable: boolean } | null;
}

type Panel = "none" | "settings" | "skip";

export interface StoryControlsProps {
  locale: AppLocale;
  player: StoryPlayer;
  /** The stage frame: its pointer shows the bar, its keys are the shortcuts. */
  surface: HTMLElement;
  /** An Overlay episode (the game's simple player: home spot and post-live talks) has no auto and no fast-forward. */
  simple: boolean;
  fullscreen: boolean;
  /** null: the browser has no element fullscreen. */
  onFullscreen: (() => void) | null;
  /** The next episode's title, offered when the story ends. */
  nextEpisode: string | null;
  onNextEpisode: () => void;
}

/**
 * Moenotes' controls of a StoryPlayer created without its own bar: the story menu's items with the game's semantics
 * (next line, auto, fast-forward ×1 -> ×1.5 -> ×1.7 -> ×2, skip with its confirmation), play / pause and the line bar
 * (a seek restarts at that line) with a video bar while a movie or clip plays; the volumes and the speed in a settings
 * panel. The bar hides while the story plays and the pointer rests; a tap on the story screen is the next line.
 * Keys (focus on the stage): Space / Enter next line, A auto, F fast-forward, K play / pause, Esc closes a panel.
 */
export default function StoryControls({ locale, player, surface, simple, fullscreen, onFullscreen, nextEpisode, onNextEpisode }: StoryControlsProps) {
  const [state, refresh] = usePlayerState(player);
  const [awake, setAwake] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [volumes, setVolumes] = useState<StoryVolumes>(loadStoryVolumes);
  // A bar held by the pointer (or moved by keys) shows its value until it is released; a seek shows its line until done.
  const [drag, setDrag] = useState<{ bar: "line" | "video"; value: number } | null>(null);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const idleRef = useRef(0);
  const seekRef = useRef<{ want: number | null; running: boolean }>({ want: null, running: false });

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => setAwake(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => window.clearTimeout(idleRef.current);
  }, [wake]);

  // The skip confirmation holds the playback and a playing video (the game's dialog pause).
  const holdForDialog = useCallback((open: boolean, resume = true) => {
    const session = player.session;
    if (session && typeof session.setDialogOpen === "function") session.setDialogOpen(open, resume);
  }, [player]);

  const changePanel = useCallback((next: Panel) => {
    setPanel((previous) => {
      if (previous === "skip" && next !== "skip") holdForDialog(false);
      if (next === "skip" && previous !== "skip") holdForDialog(true);
      return next;
    });
  }, [holdForDialog]);

  const togglePlay = () => {
    if (!player.session) return;
    if (!state.started || player.paused) player.play();
    else player.pause();
    refresh();
  };
  const nextLine = () => {
    if (player.session) player.next();
  };
  const toggleAuto = () => {
    player.setAuto(!player.auto);
    refresh();
  };
  const fastForward = () => {
    player.setSpeed(nextStorySpeed(player.speed));
    refresh();
  };
  const confirmSkip = () => {
    setPanel("none");
    holdForDialog(false, false);
    if (player.session) player.skip();
    refresh();
  };

  // Seeks run one at a time; one asked for meanwhile replaces the one waiting.
  const seekLine = useCallback((line: number) => {
    const job = seekRef.current;
    job.want = line;
    setSeekTarget(line);
    if (job.running) return;
    job.running = true;
    void (async () => {
      try {
        while (job.want !== null) {
          const target = job.want;
          job.want = null;
          try {
            await player.seekToLine(target);
          } catch {
            break; // reported by the player's error event
          }
        }
      } finally {
        job.running = false;
        job.want = null;
        setSeekTarget(null);
        refresh();
      }
    })();
  }, [player, refresh]);

  const seekVideo = useCallback((seconds: number) => {
    void player.seekVideo(seconds).catch(() => false).finally(refresh);
  }, [player, refresh]);

  const dragRef = useRef(drag);
  dragRef.current = drag;
  const commitDrag = () => {
    const held = dragRef.current;
    if (!held) return;
    setDrag(null);
    if (held.bar === "line") seekLine(held.value);
    else seekVideo(held.value);
  };

  const changeVolume = (category: StoryVolumeCategory, patch: Partial<StoryVolume>) => {
    const next = { ...volumes, [category]: { ...volumes[category], ...patch } };
    setVolumes(next);
    player.setVolume(category, storyVolumeLevel(next[category]));
    saveStoryVolumes(next);
  };

  // Keys and the story screen's taps read the latest state through these.
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keyRef.current = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : null;
    const onControl = Boolean(target?.closest("button, input, select, textarea, a"));
    if (event.key === "Escape") {
      if (panel !== "none") {
        event.preventDefault();
        changePanel("none");
      }
      return;
    }
    if (panel === "skip") return;
    if (event.key === " " || event.key === "Enter") {
      if (onControl) return;
      event.preventDefault();
      nextLine();
    } else if ((event.key === "a" || event.key === "A") && !simple && state.live) {
      toggleAuto();
      wake();
    } else if ((event.key === "f" || event.key === "F") && !simple && state.live) {
      fastForward();
      wake();
    } else if (event.key === "k" || event.key === "K") {
      togglePlay();
      wake();
    }
  };
  const tapRef = useRef<(event: PointerEvent) => void>(() => undefined);
  tapRef.current = (event) => {
    if (event.button !== 0) return;
    // A tap beside an open panel closes it rather than moving the story on.
    if (panel !== "none") {
      if (panel === "settings") changePanel("none");
      return;
    }
    nextLine();
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && (event.movementX !== 0 || event.movementY !== 0)) wake();
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      window.clearTimeout(idleRef.current);
      setAwake(false);
    };
    const onKey = (event: KeyboardEvent) => keyRef.current(event);
    const onTap = (event: PointerEvent) => tapRef.current(event);
    const canvas = player.canvas;
    surface.addEventListener("pointermove", onMove);
    surface.addEventListener("pointerleave", onLeave);
    surface.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onTap);
    return () => {
      surface.removeEventListener("pointermove", onMove);
      surface.removeEventListener("pointerleave", onLeave);
      surface.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onTap);
    };
  }, [surface, player, wake]);

  // A mouse click on a control hands the keys back to the stage; keyboard users keep their place.
  const refocus = (event: { detail: number }) => {
    if (event.detail > 0) player.root.focus({ preventScroll: true });
  };

  const visible = awake || hovered || focused || panel !== "none" || drag !== null || !state.started || state.paused || state.ended;

  useEffect(() => {
    player.root.style.cursor = visible ? "" : "none";
  }, [player, visible]);

  const lastLine = Math.max(0, state.lineCount - 1);
  const lineValue = Math.min(lastLine, drag?.bar === "line" ? drag.value : seekTarget ?? state.line);
  const lineText = state.lineCount ? t(locale, "story.ui.line", { current: lineValue + 1, total: state.lineCount }) : "";
  const video = state.video;
  const videoValue = drag?.bar === "video" ? drag.value : video?.time ?? 0;
  const label = (key: string) => t(locale, `storyPlayer.controls.${key}`);

  return (
    <>
      {!state.started && state.live && (
        <button
          type="button"
          onClick={(event) => {
            togglePlay();
            refocus(event);
          }}
          className="mn-focus group absolute inset-0 z-10 grid place-items-center bg-black/30"
        >
          <span className="flex flex-col items-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--mn-accent)] text-white shadow-[0_6px_24px_rgba(0,0,0,0.45)] transition group-hover:scale-105 @2xl:h-16 @2xl:w-16">
              <PlayIcon className="h-7 w-7 translate-x-0.5" />
            </span>
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white">{label("start")}</span>
          </span>
        </button>
      )}

      {state.ended && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 px-6 text-center">
          <div className="min-w-0">
            <p className="font-[var(--mn-font-display)] text-base text-white @2xl:text-xl">{label("ended")}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 @2xl:mt-4">
              <button type="button" onClick={() => seekLine(0)} className={`${GLASS_PILL} bg-white/12 hover:bg-white/22`}>
                <ReplayIcon className="h-4 w-4" />
                {label("replay")}
              </button>
              {nextEpisode && (
                <button type="button" onClick={onNextEpisode} className={`${GLASS_PILL} max-w-full bg-[var(--mn-accent)] hover:bg-[var(--mn-accent-deep)]`}>
                  <NextLineIcon className="h-4 w-4 shrink-0" />
                  <span className="shrink-0">{label("nextEpisode")}</span>
                  <span className="min-w-0 truncate font-semibold opacity-80">{nextEpisode}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {panel === "skip" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/45 px-4" role="alertdialog" aria-label={label("skipConfirm")}>
          <div className="rounded-2xl border border-white/15 bg-black/80 p-4 text-center text-white shadow-xl backdrop-blur-md">
            <p className="text-sm font-bold">{label("skipConfirm")}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" onClick={confirmSkip} autoFocus className={`${GLASS_PILL} bg-[var(--mn-accent)] hover:bg-[var(--mn-accent-deep)]`}>
                <SkipIcon className="h-4 w-4" />
                {label("skip")}
              </button>
              <button type="button" onClick={() => changePanel("none")} className={`${GLASS_PILL} bg-white/12 hover:bg-white/22`}>{label("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {panel === "settings" && (
        <SettingsPanel
          locale={locale}
          simple={simple}
          volumes={volumes}
          speed={state.speed}
          onVolume={changeVolume}
          onSpeed={(speed) => {
            player.setSpeed(speed);
            refresh();
          }}
          onClose={() => changePanel("none")}
        />
      )}

      {/* Touch screens have no hover: this brings the bar back. */}
      {!visible && (
        <button
          type="button"
          onClick={wake}
          aria-label={label("show")}
          title={label("show")}
          className="mn-focus absolute right-2 top-2 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm [@media(hover:hover)]:hidden"
        >
          <ControlsIcon className="h-4 w-4" />
        </button>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 z-20 transition duration-300 ${visible ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => {
          setFocused(true);
          wake();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <div className="bg-gradient-to-t from-black/85 via-black/55 to-transparent px-2 pb-1 pt-5 @2xl:px-3 @2xl:pb-2 @2xl:pt-10">
          <div className="flex items-center gap-3 px-1.5">
            <input
              type="range"
              min={0}
              max={lastLine}
              step={1}
              value={lineValue}
              aria-label={label("position")}
              aria-valuetext={lineText}
              disabled={state.lineCount < 2 || panel === "skip" || (!state.live && seekTarget === null)}
              onChange={(event) => setDrag({ bar: "line", value: Number(event.target.value) })}
              onPointerUp={commitDrag}
              onKeyUp={commitDrag}
              onBlur={commitDrag}
              className={RANGE}
            />
            {video && (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <VolumeCategoryIcon category="Movie" className="h-4 w-4 shrink-0 text-white/70" />
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/70">{formatTime(videoValue)} / {formatTime(video.duration)}</span>
                <input
                  type="range"
                  min={0}
                  max={video.duration}
                  step="any"
                  value={videoValue}
                  aria-label={label("video")}
                  aria-valuetext={`${formatTime(videoValue)} / ${formatTime(video.duration)}`}
                  disabled={!video.seekable || panel === "skip"}
                  onChange={(event) => setDrag({ bar: "video", value: Number(event.target.value) })}
                  onPointerUp={commitDrag}
                  onKeyUp={commitDrag}
                  onBlur={commitDrag}
                  className={RANGE}
                />
              </div>
            )}
          </div>

          <div className="mt-0.5 flex items-center gap-0.5 @2xl:mt-1 @2xl:gap-1">
            <BarButton label={label(!state.started || state.paused ? "play" : "pause")} disabled={!state.live} onClick={(event) => { togglePlay(); refocus(event); }}>
              {!state.started || state.paused ? <PlayIcon /> : <PauseIcon />}
            </BarButton>
            <BarButton label={label("next")} disabled={!state.live} onClick={(event) => { nextLine(); refocus(event); }}>
              <NextLineIcon />
            </BarButton>
            {!simple && (
              <>
                <BarButton label={label("auto")} pressed={state.auto} disabled={!state.live} onClick={(event) => { toggleAuto(); refocus(event); }}>
                  <AutoIcon />
                </BarButton>
                <BarButton label={`${label("fastForward")} ${storySpeedLabel(state.speed)}`} pressed={state.speed !== 10} disabled={!state.live} onClick={(event) => { fastForward(); refocus(event); }}>
                  <FastForwardIcon />
                  {state.speed !== 10 && <span className="font-mono text-[11px] font-bold tabular-nums">{storySpeedLabel(state.speed)}</span>}
                </BarButton>
              </>
            )}
            <BarButton label={label("skip")} disabled={!state.live} onClick={() => changePanel("skip")}>
              <SkipIcon />
            </BarButton>
            {state.lineCount > 0 && (
              <span className="ml-1.5 hidden font-mono text-[11px] tabular-nums text-white/70 @md:inline">{lineValue + 1} / {state.lineCount}</span>
            )}
            <span className="flex-1" />
            <BarButton label={label("settings")} pressed={panel === "settings"} onClick={() => changePanel(panel === "settings" ? "none" : "settings")}>
              <SettingsIcon />
            </BarButton>
            {onFullscreen && (
              <BarButton label={t(locale, fullscreen ? "storyPlayer.exitFullscreen" : "storyPlayer.fullscreen")} onClick={onFullscreen}>
                <FullscreenIcon exit={fullscreen} />
              </BarButton>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Volumes (with their mute switches) and the fast-forward speed. A sheet over small stages, a card over large ones. */
function SettingsPanel({ locale, simple, volumes, speed, onVolume, onSpeed, onClose }: {
  locale: AppLocale;
  simple: boolean;
  volumes: StoryVolumes;
  speed: number;
  onVolume: (category: StoryVolumeCategory, patch: Partial<StoryVolume>) => void;
  onSpeed: (speed: typeof STORY_SPEEDS[number]) => void;
  onClose: () => void;
}) {
  const title = t(locale, "storyPlayer.controls.settings");
  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute inset-0 z-30 overflow-y-auto overscroll-contain bg-black/85 p-3 text-white backdrop-blur-md @2xl:inset-auto @2xl:bottom-[4.75rem] @2xl:right-3 @2xl:max-h-[calc(100%-6rem)] @2xl:w-80 @2xl:rounded-2xl @2xl:border @2xl:border-white/15 @2xl:shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black">{title}</p>
        <button type="button" onClick={onClose} aria-label={t(locale, "actions.close")} title={t(locale, "actions.close")} className="mn-focus grid h-7 w-7 place-items-center rounded-full text-white/75 hover:bg-white/15 hover:text-white">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-white/55">{t(locale, "storyPlayer.volume.title")}</p>
      <div className="mt-1.5 space-y-1.5">
        {STORY_VOLUME_CATEGORIES.map((category) => {
          const volume = volumes[category];
          const name = t(locale, `storyPlayer.volume.${category}`);
          const toggle = t(locale, volume.muted ? "storyPlayer.volume.unmute" : "storyPlayer.volume.mute", { name });
          return (
            <div key={category} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onVolume(category, { muted: !volume.muted })}
                aria-pressed={volume.muted}
                aria-label={toggle}
                title={toggle}
                className={`mn-focus grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${volume.muted ? "bg-white/10 text-white/45" : "text-white/85 hover:bg-white/15"}`}
              >
                {volume.muted ? <SpeakerIcon muted className="h-4 w-4" /> : <VolumeCategoryIcon category={category} className="h-4 w-4" />}
              </button>
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <span className="w-12 shrink-0 truncate text-xs font-bold">{name}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume.level}
                  onChange={(event) => onVolume(category, { level: Number(event.target.value), muted: false })}
                  className={RANGE}
                />
              </label>
              <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/60">{storyVolumeLevel(volume) === 0 ? 0 : Math.round(volume.level * 100)}%</span>
            </div>
          );
        })}
      </div>

      {!simple && (
        <>
          <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-white/55">{t(locale, "storyPlayer.controls.speed")}</p>
          <div role="radiogroup" aria-label={t(locale, "storyPlayer.controls.speed")} className="mt-1.5 grid grid-cols-4 gap-1.5">
            {STORY_SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={speed === value}
                onClick={() => onSpeed(value)}
                className={`mn-focus rounded-full py-1.5 font-mono text-xs font-bold transition ${speed === value ? "bg-[var(--mn-accent)] text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
              >
                {storySpeedLabel(value)}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-white/50">{t(locale, "storyPlayer.controls.speedHint")}</p>
        </>
      )}
    </div>
  );
}

function BarButton({ label, pressed, disabled = false, onClick, children }: {
  label: string;
  /** Set for the toggles (auto, fast-forward, the settings panel). */
  pressed?: boolean;
  disabled?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`mn-focus inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 transition disabled:cursor-default disabled:opacity-35 @2xl:h-9 @2xl:min-w-9 ${
        pressed ? "bg-[var(--mn-accent)] text-white" : "text-white/85 enabled:hover:bg-white/15 enabled:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

const GLASS_PILL = "mn-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white transition @2xl:text-sm";
const RANGE = "h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--mn-accent)] disabled:cursor-default disabled:opacity-40";

/** The player's state for the controls; `refresh` after a call that emits no event (auto, speed). */
function usePlayerState(player: StoryPlayer): [PlayerState, () => void] {
  const [state, setState] = useState<PlayerState>(() => readState(player, null));
  const currentRef = useRef(state);
  const refresh = useCallback(() => {
    const next = readState(player, currentRef.current);
    if (sameState(currentRef.current, next)) return;
    currentRef.current = next;
    setState(next);
  }, [player]);

  useEffect(() => {
    const types = ["ready", "play", "pause", "line", "ended", "error"] as const;
    for (const type of types) player.addEventListener(type, refresh);
    const timer = window.setInterval(refresh, 250);
    refresh();
    return () => {
      for (const type of types) player.removeEventListener(type, refresh);
      window.clearInterval(timer);
    };
  }, [player, refresh]);

  return [state, refresh];
}

function readState(player: StoryPlayer, previous: PlayerState | null): PlayerState {
  const session = player.session;
  const video = player.video;
  return {
    live: Boolean(session) && !player.ended,
    // While a seek replaces the session, the story stays started and keeps its line count.
    started: session ? session.started : previous?.started ?? false,
    paused: player.paused,
    ended: player.ended,
    auto: player.auto,
    speed: player.speed,
    line: session ? Math.max(0, player.line) : previous?.line ?? 0,
    lineCount: player.lineCount || previous?.lineCount || 0,
    video: video ? { time: video.time, duration: video.duration, seekable: video.seekable } : null,
  };
}

function sameState(a: PlayerState, b: PlayerState): boolean {
  return a.live === b.live && a.started === b.started && a.paused === b.paused && a.ended === b.ended && a.auto === b.auto
    && a.speed === b.speed && a.line === b.line && a.lineCount === b.lineCount
    && (a.video === b.video || (a.video !== null && b.video !== null && a.video.time === b.video.time
      && a.video.duration === b.video.duration && a.video.seekable === b.video.seekable));
}

/** seconds -> m:ss */
function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds + 1e-6));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
