import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChartPlayer } from "ournotes-player";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BrandLogo from "@/components/shared/BrandLogo";

type StageStatus =
  | { kind: "booting" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unsupported" }
  | { kind: "error"; missing: boolean; detail: string };

interface ChartStageProps {
  locale: AppLocale;
  /** ournotes-player chart manifest; changing it loads that chart. */
  manifestUrl: string;
}

/** The 3D chart player (ournotes-player) with the Moenotes signature; the frame is what goes fullscreen. */
export default function ChartStage({ locale, manifestUrl }: ChartStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<StageStatus>({ kind: "booting" });
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!supportsChartPlayer()) {
      setStatus({ kind: "unsupported" });
      return;
    }
    const controller = new AbortController();
    let player: ChartPlayer | null = null;
    const fail = (error: unknown) => {
      if (!controller.signal.aborted) setStatus(describeFailure(error));
    };
    setStatus({ kind: "booting" });
    // The player (WebGL2 + WebAudio) only runs in the browser and is split into its own chunk.
    import("ournotes-player")
      .then(({ ChartPlayer }) => {
        if (controller.signal.aborted) return null;
        setStatus({ kind: "loading" });
        return ChartPlayer.create(host, {
          src: manifestUrl,
          autoplay: true,
          signal: controller.signal,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        });
      })
      .then((created) => {
        if (!created) return;
        if (controller.signal.aborted) {
          void created.dispose();
          return;
        }
        player = created;
        created.addEventListener("error", (event) => fail(event.detail.error));
        setStatus({ kind: "ready" });
        created.root.focus({ preventScroll: true });
      }, fail);
    return () => {
      controller.abort();
      if (player) void player.dispose();
    };
  }, [manifestUrl, attempt]);

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
      aria-label={t(locale, "chartPreview3d.stageLabel")}
      className={fullscreen
        ? "flex items-center justify-center bg-black"
        : "overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-black shadow-[var(--mn-shadow-stamp)]"}
    >
      <div className={`relative aspect-video ${fullscreen ? "w-[min(100vw,calc(100vh*16/9))]" : "w-full"}`}>
        <div ref={hostRef} className="absolute inset-0" />
        <StageSignature />

        {canFullscreen && status.kind === "ready" && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={t(locale, fullscreen ? "chartPreview3d.exitFullscreen" : "chartPreview3d.fullscreen")}
            title={t(locale, fullscreen ? "chartPreview3d.exitFullscreen" : "chartPreview3d.fullscreen")}
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
