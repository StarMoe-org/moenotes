import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { StoryPlayer } from "ournotes-player/story";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import {
  exitElementFullscreen,
  FULLSCREEN_CHANGE_EVENTS,
  getFullscreenElement,
  isElementFullscreenAvailable,
  lockLandscape,
  requestElementFullscreen,
} from "@/lib/browser/fullscreen";
import { loadStoryRuntimes, storyPlayerFetch, type StoryRuntimes } from "@/lib/story/player-client";
import { formatMegabytes, type StoryLanguage } from "@/lib/story/player-data";
import { loadStoryVolumes, storyPlayerVolumes } from "@/lib/story/player-settings";
import { StageSignature } from "@/components/tools/Live2DStage";
import StoryControls from "@/components/tools/StoryControls";

type StageStatus =
  | { kind: "booting" }
  | { kind: "loading"; loaded: number; total: number }
  | { kind: "ready" }
  | { kind: "unsupported" }
  | { kind: "refused"; detail: string }
  | { kind: "error"; detail: string };

interface StoryStageProps {
  locale: AppLocale;
  /** The story's manifest URL (its site's `stories/<advId>.json`). */
  manifest: string;
  /** The language the story starts in; later changes go through the player (`setLanguage`), not a reload. */
  language: StoryLanguage;
  title: string;
  /** An Overlay episode (playbackMode 1): the game's simple player, without auto and fast-forward. */
  simple: boolean;
  /** The next episode's title, offered when the story ends. */
  nextEpisode: string | null;
  onNextEpisode: () => void;
  /** Called once the story is ready, with its player and the optional scripts the page has. */
  onReady?: (player: StoryPlayer, runtimes: StoryRuntimes) => void;
}

/**
 * The story player (ournotes-player's StoryPlayer without its own control bar) with Moenotes' controls over it and the
 * signature; the frame goes fullscreen. Remount it per story: a new manifest is a new player.
 */
export default function StoryStage({ locale, manifest, language, title, simple, nextEpisode, onNextEpisode, onReady }: StoryStageProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<StageStatus>({ kind: "booting" });
  const [player, setPlayer] = useState<StoryPlayer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  const attachFrame = useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    setFrame(node);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!supportsWebGL2()) {
      setStatus({ kind: "unsupported" });
      return;
    }
    const controller = new AbortController();
    let created: StoryPlayer | null = null;
    // A language switch loads again with progress events: the stage's loading screen is for the first load only.
    let loaded = false;
    setStatus({ kind: "booting" });
    (async () => {
      // The page's scripts first (Cubism Core must be there before a story is created), then the player bundle.
      const runtimes = await loadStoryRuntimes();
      if (controller.signal.aborted) return;
      const { StoryPlayer, StoryCommandError } = await import("ournotes-player/story");
      if (controller.signal.aborted) return;
      setStatus({ kind: "loading", loaded: 0, total: 0 });
      try {
        created = await StoryPlayer.create(host, {
          src: manifest,
          lang: language,
          controls: false,
          volumes: storyPlayerVolumes(loadStoryVolumes()),
          fetch: storyPlayerFetch,
          signal: controller.signal,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          on: {
            progress: (event) => {
              if (!loaded && !controller.signal.aborted) setStatus({ kind: "loading", loaded: event.detail.loaded, total: event.detail.total });
            },
          },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        // A story that needs what the player has not reproduced yet is refused before loading, naming it.
        const detail = error instanceof Error ? error.message : String(error);
        setStatus(error instanceof StoryCommandError ? { kind: "refused", detail } : { kind: "error", detail });
        return;
      }
      if (controller.signal.aborted) {
        void created.dispose();
        return;
      }
      created.addEventListener("error", (event) => {
        if (!controller.signal.aborted) setStatus({ kind: "error", detail: event.detail.error instanceof Error ? event.detail.error.message : String(event.detail.error) });
      });
      loaded = true;
      setPlayer(created);
      setStatus({ kind: "ready" });
      onReady?.(created, runtimes);
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) setStatus({ kind: "error", detail: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      controller.abort();
      setPlayer(null);
      if (created) void created.dispose();
      host.replaceChildren();
    };
    // The language only matters for the first load (later changes are the player's); onReady may be a fresh closure.
  }, [manifest, attempt]);

  useEffect(() => {
    setCanFullscreen(isElementFullscreenAvailable());
    const onChange = () => {
      const on = getFullscreenElement() === frameRef.current;
      if (on) lockLandscape();
      setFullscreen(on);
    };
    for (const type of FULLSCREEN_CHANGE_EVENTS) document.addEventListener(type, onChange);
    return () => {
      for (const type of FULLSCREEN_CHANGE_EVENTS) document.removeEventListener(type, onChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = frameRef.current;
    if (!element) return;
    if (getFullscreenElement()) exitElementFullscreen();
    else void requestElementFullscreen(element).catch(() => undefined);
  }, []);

  return (
    <div
      ref={attachFrame}
      role="region"
      data-state={status.kind}
      aria-label={t(locale, "storyPlayer.stageLabel")}
      className={`overflow-hidden bg-black [container-type:inline-size] [-webkit-tap-highlight-color:transparent] ${fullscreen ? "" : "rounded-2xl border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)]"}`}
    >
      {/* The story screen is 13:6 (the game's ADV viewport); the controls lie over its bottom and hide while it plays. */}
      <div
        className={`relative select-none ${fullscreen ? "h-screen w-screen" : "w-full"}`}
        style={fullscreen ? undefined : { height: "min(calc(100cqw * 6 / 13), 85vh)" }}
      >
        <div ref={hostRef} className="absolute inset-0" />
        <StageSignature light />

        {player && frame && status.kind === "ready" && (
          <StoryControls
            locale={locale}
            player={player}
            surface={frame}
            simple={simple}
            fullscreen={fullscreen}
            onFullscreen={canFullscreen ? toggleFullscreen : null}
            nextEpisode={nextEpisode}
            onNextEpisode={onNextEpisode}
          />
        )}

        {status.kind === "booting" && (
          <StageMessage>
            <p className="text-sm font-bold text-white/75">{t(locale, "storyPlayer.preparing")}</p>
          </StageMessage>
        )}

        {status.kind === "loading" && (
          <StageMessage>
            {title && <p className="max-w-md font-[var(--mn-font-display)] text-base text-white sm:text-lg">{title}</p>}
            <p className="mt-2 text-xs font-bold text-white/70">{t(locale, "storyPlayer.loading")}</p>
            {status.total > 0 && (
              <>
                <div className="mx-auto mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-[var(--mn-accent)] transition-[width]" style={{ width: `${Math.min(100, Math.round((status.loaded / status.total) * 100))}%` }} />
                </div>
                <p className="mt-2 font-mono text-[10px] text-white/60">{formatMegabytes(status.loaded)} / {formatMegabytes(status.total)}</p>
              </>
            )}
          </StageMessage>
        )}

        {(status.kind === "error" || status.kind === "unsupported" || status.kind === "refused") && (
          <StageMessage>
            <h3 className="font-[var(--mn-font-display)] text-lg text-white sm:text-xl">{t(locale, `storyPlayer.${status.kind}Title`)}</h3>
            <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-6 text-white/70 sm:text-sm">{t(locale, `storyPlayer.${status.kind}Description`)}</p>
            {status.kind !== "unsupported" && <p className="mx-auto mt-2 max-w-md break-all font-mono text-[10px] text-white/50">{status.detail}</p>}
            {status.kind === "error" && (
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="mn-focus mn-stamp-press mt-4 rounded-full border-[1.5px] border-white/30 bg-white/10 px-5 py-2 text-sm font-bold text-white hover:bg-white/20"
              >
                {t(locale, "storyPlayer.retry")}
              </button>
            )}
          </StageMessage>
        )}
      </div>
    </div>
  );
}

function StageMessage({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-black/85 px-6 py-4 text-center"><div>{children}</div></div>;
}

function supportsWebGL2(): boolean {
  try {
    return typeof WebGL2RenderingContext !== "undefined" && Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
