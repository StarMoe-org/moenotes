import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { StoryPlayer } from "ournotes-player/story";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { loadStoryRuntimes, type StoryRuntimes } from "@/lib/story/player-client";
import { formatMegabytes, getStoryManifestUrl, type StoryLanguage } from "@/lib/story/player-data";
import { StageSignature } from "@/components/tools/Live2DStage";

type StageStatus =
  | { kind: "booting" }
  | { kind: "loading"; loaded: number; total: number }
  | { kind: "ready" }
  | { kind: "unsupported" }
  | { kind: "refused"; detail: string }
  | { kind: "error"; detail: string };

interface StoryStageProps {
  locale: AppLocale;
  /** The manifest path of the story site's index (`stories/<advId>.json`). */
  manifest: string;
  /** The language the story starts in; later changes go through the player (`setLanguage`), not a reload. */
  language: StoryLanguage;
  /** The language of the player's control bar. */
  controlsLanguage: StoryLanguage;
  title: string;
  /** Called once the story is ready, with its player and the optional scripts the page has. */
  onReady?: (player: StoryPlayer, runtimes: StoryRuntimes) => void;
}

/**
 * The story player (ournotes-player's StoryPlayer with its own control bar) with the Moenotes signature; the frame goes
 * fullscreen. Remount it per story: a new manifest is a new player.
 */
export default function StoryStage({ locale, manifest, language, controlsLanguage, title, onReady }: StoryStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<StageStatus>({ kind: "booting" });
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  // The control bar's height (it wraps onto a second row on narrow stages), so that the story screen stays 13:6.
  const [barHeight, setBarHeight] = useState(44);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!supportsWebGL2()) {
      setStatus({ kind: "unsupported" });
      return;
    }
    const controller = new AbortController();
    let player: StoryPlayer | null = null;
    let barObserver: ResizeObserver | null = null;
    // A language switch loads again with progress events, under the player's own status line: not the stage's.
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
        player = await StoryPlayer.create(host, {
          src: getStoryManifestUrl(manifest),
          lang: language,
          uiLang: controlsLanguage,
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
        void player.dispose();
        return;
      }
      player.addEventListener("error", (event) => {
        if (!controller.signal.aborted) setStatus({ kind: "error", detail: event.detail.error instanceof Error ? event.detail.error.message : String(event.detail.error) });
      });
      loaded = true;
      const bar = player.root.shadowRoot?.querySelector<HTMLElement>(".bar");
      if (bar) {
        barObserver = new ResizeObserver(() => setBarHeight(bar.offsetHeight || 44));
        barObserver.observe(bar);
      }
      setStatus({ kind: "ready" });
      onReady?.(player, runtimes);
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) setStatus({ kind: "error", detail: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      controller.abort();
      barObserver?.disconnect();
      if (player) void player.dispose();
      host.replaceChildren();
    };
    // The language only matters for the first load (later changes are the player's); onReady may be a fresh closure.
  }, [manifest, attempt]);

  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.requestFullscreen().catch(() => undefined);
  }, []);

  return (
    <div
      ref={frameRef}
      role="region"
      data-state={status.kind}
      aria-label={t(locale, "storyPlayer.stageLabel")}
      className={`overflow-hidden bg-black [container-type:inline-size] ${fullscreen ? "" : "rounded-2xl border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)]"}`}
    >
      {/* The story screen is 13:6 (the game's ADV viewport) above the player's control bar. */}
      <div
        className={`relative ${fullscreen ? "h-screen w-screen" : "w-full"}`}
        style={fullscreen ? undefined : { height: `min(calc(100cqw * 6 / 13 + ${barHeight}px), 85vh)` }}
      >
        <div ref={hostRef} className="absolute inset-0" />
        <StageSignature light />

        {canFullscreen && status.kind === "ready" && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={t(locale, fullscreen ? "storyPlayer.exitFullscreen" : "storyPlayer.fullscreen")}
            title={t(locale, fullscreen ? "storyPlayer.exitFullscreen" : "storyPlayer.fullscreen")}
            className="mn-focus absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white/85 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {fullscreen
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
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
  return <div className="absolute inset-0 z-10 grid place-items-center bg-black/85 px-6 text-center"><div>{children}</div></div>;
}

function supportsWebGL2(): boolean {
  try {
    return typeof WebGL2RenderingContext !== "undefined" && Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
