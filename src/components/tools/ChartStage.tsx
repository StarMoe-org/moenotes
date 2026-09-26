import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChartPlayer, LiveSettingsInput } from "ournotes-player";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import {
  exitElementFullscreen,
  FULLSCREEN_CHANGE_EVENTS,
  getFullscreenElement,
  lockLandscape,
  requestElementFullscreen,
} from "@/lib/browser/fullscreen";
import { loadLiveSettings, offeredLiveSettings, saveLiveSettings } from "@/lib/music/chart-live-settings";
import { usePageLock } from "@/lib/overlay/page-lock";
import BrandLogo from "@/components/shared/BrandLogo";
import { customizeControls, type StageControls } from "@/components/tools/chart-player-controls";

type StageStatus =
  | { kind: "booting" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unsupported" }
  | { kind: "error"; missing: boolean; detail: string };

/** `native`: the Fullscreen API; `page`: the frame covers the viewport where there is none (iPhone Safari). */
type FullscreenMode = "off" | "native" | "page";

interface ChartStageProps {
  locale: AppLocale;
  /** ournotes-player chart manifest; changing it loads that chart. */
  manifestUrl: string;
}

/** Playback speed and the music / sound effect switches, carried from one chart to the next. */
interface ViewerState {
  speed: number;
  music: boolean;
  se: boolean;
}

const FRAME_CLASSES: Record<FullscreenMode, string> = {
  off: "overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-black shadow-[var(--mn-shadow-stamp)]",
  native: "flex items-center justify-center bg-black",
  page: "fixed inset-0 z-[1000] m-0 flex items-center justify-center bg-black",
};
// Fullscreen, the stage keeps 16:9 inside the safe area (notch, home indicator).
const PAGE_PADDING = "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
const FULLSCREEN_WIDTH = "min(100%, calc((100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)) * 16 / 9))";
const UNLOCK_HINT_MS = 2500;

/** The 3D chart player (ournotes-player) with the Moenotes signature; the frame is what goes fullscreen. */
export default function ChartStage({ locale, manifestUrl }: ChartStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const unlockRef = useRef<HTMLButtonElement>(null);
  const playerRef = useRef<ChartPlayer | null>(null);
  const controlsRef = useRef<StageControls | null>(null);
  const viewerRef = useRef<ViewerState>({ speed: 1, music: true, se: true });
  const unlockTimerRef = useRef(0);
  const [status, setStatus] = useState<StageStatus>({ kind: "booting" });
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState<FullscreenMode>("off");
  const [locked, setLocked] = useState(false);
  const [unlockShown, setUnlockShown] = useState(false);
  const lockActive = locked && status.kind === "ready";
  const fullscreenRef = useRef(fullscreen);
  const lockedRef = useRef(lockActive);

  const toggleFullscreen = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (getFullscreenElement()) exitElementFullscreen();
    else if (fullscreenRef.current === "page") setFullscreen("off");
    else requestElementFullscreen(frame).catch(() => setFullscreen("page"));
  }, []);

  const revealUnlock = useCallback(() => {
    setUnlockShown(true);
    window.clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = window.setTimeout(() => setUnlockShown(false), UNLOCK_HINT_MS);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!supportsChartPlayer()) {
      setStatus({ kind: "unsupported" });
      return;
    }
    const controller = new AbortController();
    let player: ChartPlayer | null = null;
    let controls: StageControls | null = null;
    const fail = (error: unknown) => {
      if (!controller.signal.aborted) setStatus(describeFailure(error));
    };
    setStatus({ kind: "booting" });
    // The player (WebGL2 + WebAudio) only runs in the browser and is split into its own chunk.
    import("ournotes-player")
      .then(async ({ ChartPlayer, LiveSettingsError }) => {
        if (controller.signal.aborted) return null;
        setStatus({ kind: "loading" });
        const create = (settings: LiveSettingsInput | null) => ChartPlayer.create(host, {
          src: manifestUrl,
          autoplay: true,
          signal: controller.signal,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          lang: locale,
          settings,
          ...viewerRef.current,
        });
        const saved = loadLiveSettings();
        try {
          return await create(saved);
        } catch (error) {
          if (!(error instanceof LiveSettingsError) || controller.signal.aborted) throw error;
          // A saved choice this chart's data lacks: load it with the defaults (the assets come from the HTTP cache),
          // then apply the saved options it offers.
          const created = await create(null);
          const offered = offeredLiveSettings(created, saved);
          if (Object.keys(offered).length) void created.setSettings(offered).catch(() => undefined);
          return created;
        }
      })
      .then((created) => {
        if (!created) return;
        if (controller.signal.aborted) {
          void created.dispose();
          return;
        }
        player = created;
        created.addEventListener("error", (event) => fail(event.detail.error));
        created.addEventListener("settingschange", (event) => saveLiveSettings(created, event.detail.changed));
        controls = customizeControls(created, {
          lock: t(locale, "chartPreview3d.lock"),
          fullscreen: t(locale, "chartPreview3d.fullscreen"),
          exitFullscreen: t(locale, "chartPreview3d.exitFullscreen"),
        }, {
          onLock: () => setLocked(true),
          onFullscreen: toggleFullscreen,
        });
        controls.setFullscreen(fullscreenRef.current !== "off");
        playerRef.current = created;
        controlsRef.current = controls;
        setStatus({ kind: "ready" });
        created.root.focus({ preventScroll: true });
      }, fail);
    return () => {
      controller.abort();
      controls?.dispose();
      playerRef.current = null;
      controlsRef.current = null;
      if (player) {
        viewerRef.current = { speed: player.speed, music: player.music, se: player.se };
        void player.dispose();
      }
    };
  }, [manifestUrl, attempt, locale, toggleFullscreen]);

  useEffect(() => {
    fullscreenRef.current = fullscreen;
    controlsRef.current?.setFullscreen(fullscreen !== "off");
  }, [fullscreen]);

  useEffect(() => {
    const onChange = () => {
      const native = getFullscreenElement() === frameRef.current;
      if (native) lockLandscape();
      setFullscreen((mode) => (native ? "native" : mode === "native" ? "off" : mode));
    };
    for (const type of FULLSCREEN_CHANGE_EVENTS) document.addEventListener(type, onChange);
    return () => {
      for (const type of FULLSCREEN_CHANGE_EVENTS) document.removeEventListener(type, onChange);
    };
  }, []);

  useEffect(() => {
    if (fullscreen !== "page") return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const viewport = meta?.content ?? "";
    // Lets the frame reach under the notch and home indicator; its padding keeps the stage in the safe area.
    if (meta && !viewport.includes("viewport-fit")) meta.content = `${viewport}, viewport-fit=cover`;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !lockedRef.current) setFullscreen("off");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (meta) meta.content = viewport;
    };
  }, [fullscreen]);

  // Back (iOS Safari's edge swipe, Android's back button) leaves the page fullscreen rather than the page, and does
  // nothing while the stage is locked.
  const guardHistory = fullscreen === "page" || lockActive;
  useEffect(() => {
    if (!guardHistory) return;
    let pushed = false;
    const push = () => {
      window.history.pushState({ modal: true }, "");
      pushed = true;
    };
    const onPopState = () => {
      if (lockedRef.current) push();
      else setFullscreen((mode) => (mode === "page" ? "off" : mode));
    };
    if (!window.history.state?.modal) push();
    const raf = requestAnimationFrame(() => window.addEventListener("popstate", onPopState));
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("popstate", onPopState);
      if (pushed && window.history.state?.modal) window.history.back();
    };
  }, [guardHistory]);

  useEffect(() => {
    lockedRef.current = lockActive;
    const player = playerRef.current;
    player?.root.classList.toggle("locked", lockActive);
    if (lockActive) {
      unlockRef.current?.focus({ preventScroll: true });
      revealUnlock();
    } else {
      player?.root.focus({ preventScroll: true });
    }
  }, [lockActive, revealUnlock]);

  useEffect(() => () => window.clearTimeout(unlockTimerRef.current), []);

  usePageLock(lockActive ? "locked" : fullscreen === "off" ? "off" : "fullscreen", frameRef);

  const still = lockActive || fullscreen !== "off";
  return (
    <>
      {/* Holds the stage's place in the page while the frame covers the viewport. */}
      {fullscreen === "page" && <div className="aspect-video w-full" aria-hidden="true" />}
      <div
        ref={frameRef}
        role="region"
        aria-label={t(locale, "chartPreview3d.stageLabel")}
        className={`${FRAME_CLASSES[fullscreen]} touch-manipulation [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] ${still ? "select-none" : ""}`}
        style={fullscreen === "page" ? { padding: PAGE_PADDING } : undefined}
      >
        <div className="relative aspect-video w-full" style={fullscreen === "off" ? undefined : { width: FULLSCREEN_WIDTH }}>
          <div ref={hostRef} className="absolute inset-0" inert={lockActive} />
          <StageSignature />

          {lockActive && (
            <>
              <div className="absolute inset-0 z-20 touch-none" aria-hidden="true" onPointerDown={revealUnlock} />
              <button
                ref={unlockRef}
                type="button"
                onClick={() => setLocked(false)}
                onFocus={revealUnlock}
                className={`mn-focus absolute bottom-3 right-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm transition-opacity duration-300 hover:opacity-100 ${unlockShown ? "opacity-100" : "opacity-40"}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                {t(locale, "chartPreview3d.unlock")}
              </button>
            </>
          )}

          {status.kind === "booting" && (
            <StageMessage>
              <p className="text-sm font-bold text-white/80">{t(locale, "chartPreview3d.preparing")}</p>
            </StageMessage>
          )}

          {(status.kind === "error" || status.kind === "unsupported") && (
            <StageMessage dim>
              <h3 className="font-[var(--mn-font-display)] text-lg text-white sm:text-xl">
                {t(locale, status.kind === "unsupported" ? "chartPreview3d.unsupportedTitle" : "chartPreview3d.loadErrorTitle")}
              </h3>
              <p className="mt-2 max-w-md text-xs font-medium leading-6 text-white/75 sm:text-sm">
                {t(locale, status.kind === "unsupported"
                  ? "chartPreview3d.unsupportedDescription"
                  : status.missing ? "chartPreview3d.missingDescription" : "chartPreview3d.loadErrorDescription")}
              </p>
              {status.kind === "error" && (
                <>
                  <p className="mt-2 max-w-md break-all font-mono text-[10px] text-white/45">{status.detail}</p>
                  <button
                    type="button"
                    onClick={() => setAttempt((value) => value + 1)}
                    className="mn-focus mn-stamp-press mt-4 rounded-full border border-white/30 bg-white/10 px-5 py-2 text-sm font-bold text-white hover:bg-white/20"
                  >
                    {t(locale, "chartPreview3d.retry")}
                  </button>
                </>
              )}
            </StageMessage>
          )}
        </div>
      </div>
    </>
  );
}

/** Watermark over the stage; it stays on the picture in fullscreen. */
export function StageSignature() {
  return (
    <div className="pointer-events-none absolute left-3 top-2 z-10 w-20 select-none opacity-85 drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)] sm:left-4 sm:top-3 sm:w-28">
      <BrandLogo light />
    </div>
  );
}

function StageMessage({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  return (
    <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center ${dim ? "bg-black/75" : ""}`}>
      {children}
    </div>
  );
}

function supportsChartPlayer(): boolean {
  if (typeof WebGL2RenderingContext === "undefined" || typeof AudioContext === "undefined") return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    // Browsers cap live WebGL contexts per page; release the probe right away.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function describeFailure(error: unknown): StageStatus {
  const detail = error instanceof Error ? error.message : String(error);
  // AssetStore reports a missing manifest as "<url>: HTTP 404".
  return { kind: "error", missing: /HTTP 404\b/.test(detail), detail };
}
