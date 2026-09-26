import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import type { AssetStore, ModelPlayer } from "ournotes-player/live2d";
import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { loadCubismCore, loadLive2DModelAssets } from "@/lib/live2d/client";
import { IDENTITY_VIEW, MAX_ZOOM, attachLive2DView, clampView, toNdc, zoomAbout, type Live2DView } from "@/lib/live2d/view";
import BrandLogo from "@/components/shared/BrandLogo";

type StageStatus =
  | { kind: "booting" }
  | { kind: "loading"; loaded: number; total: number }
  | { kind: "ready" }
  | { kind: "unsupported" }
  | { kind: "error"; detail: string };

interface Live2DStageProps {
  locale: AppLocale;
  modelId: string;
  /** Called once the model is up, with the player of that model. */
  onReady?: (player: ModelPlayer) => void;
}

/** The Live2D model viewer (ournotes-player's model player) with the Moenotes signature; the frame goes fullscreen. */
export default function Live2DStage({ locale, modelId, onReady }: Live2DStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<StageStatus>({ kind: "booting" });
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [view, setView] = useState<Live2DView>(IDENTITY_VIEW);
  const applyView = useRef<((next: Live2DView) => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!supportsLive2D()) {
      setStatus({ kind: "unsupported" });
      return;
    }
    const controller = new AbortController();
    let player: ModelPlayer | null = null;
    const fail = (error: unknown) => {
      if (!controller.signal.aborted) setStatus({ kind: "error", detail: error instanceof Error ? error.message : String(error) });
    };
    setStatus({ kind: "booting" });
    // Cubism Core first (the page must have it before a model is created), then the model's files, then the player.
    loadCubismCore(assetConfig.cubismCore)
      .then(() => {
        if (controller.signal.aborted) return null;
        setStatus({ kind: "loading", loaded: 0, total: 0 });
        return loadLive2DModelAssets(modelId, controller.signal, (loaded, total) => {
          if (!controller.signal.aborted) setStatus({ kind: "loading", loaded, total });
        });
      })
      .then(async (assets: AssetStore | null) => {
        if (!assets || controller.signal.aborted) return null;
        const { ModelPlayer } = await import("ournotes-player/live2d");
        if (controller.signal.aborted) return null;
        return ModelPlayer.create(host, { assets, signal: controller.signal, pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
      })
      .then((created) => {
        if (!created) return;
        if (controller.signal.aborted) {
          void created.dispose();
          return;
        }
        player = created;
        created.addEventListener("error", (event) => fail(event.detail.error));
        applyView.current = attachLive2DView(created);
        setView(IDENTITY_VIEW);
        setStatus({ kind: "ready" });
        onReady?.(created);
      }, fail);
    return () => {
      controller.abort();
      applyView.current = null;
      if (player) void player.dispose();
    };
    // onReady may be a fresh closure each render; the model id (and a retry) is what reloads the stage.
  }, [modelId, attempt]);

  useEffect(() => applyView.current?.(view), [view]);
  useLive2DGestures(hostRef, status.kind === "ready", setView);

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
      aria-label={t(locale, "live2d.stageLabel")}
      className={`overflow-hidden bg-[linear-gradient(180deg,var(--mn-cream-deep),var(--mn-paper))] ${fullscreen
        ? ""
        : "rounded-2xl border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)]"}`}
    >
      {/* Models are 2:3; the player fits the canvas into whatever box this is. */}
      <div className={`relative ${fullscreen ? "h-screen w-screen" : "aspect-[3/4] max-h-[80vh] w-full @lg:aspect-square"}`}>
        <div ref={hostRef} className="absolute inset-0" />
        <StageSignature />

        {canFullscreen && status.kind === "ready" && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={t(locale, fullscreen ? "live2d.exitFullscreen" : "live2d.fullscreen")}
            title={t(locale, fullscreen ? "live2d.exitFullscreen" : "live2d.fullscreen")}
            className="mn-focus absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white/85 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {fullscreen
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
        )}

        {status.kind === "ready" && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-full bg-black/45 p-1 text-white/85 backdrop-blur-sm">
            <ZoomButton label={t(locale, "live2d.zoomOut")} disabled={view.zoom <= 1} onClick={() => setView((current) => zoomAbout(current, 1 / 1.25, 0, 0))}>
              <path d="M5 12h14" />
            </ZoomButton>
            <button
              type="button"
              onClick={() => setView(IDENTITY_VIEW)}
              title={t(locale, "live2d.zoomReset")}
              aria-label={t(locale, "live2d.zoomReset")}
              className="mn-focus min-w-12 rounded-full px-2 py-1 text-center font-mono text-[11px] font-bold transition hover:bg-white/15"
            >
              {Math.round(view.zoom * 100)}%
            </button>
            <ZoomButton label={t(locale, "live2d.zoomIn")} disabled={view.zoom >= MAX_ZOOM} onClick={() => setView((current) => zoomAbout(current, 1.25, 0, 0))}>
              <path d="M12 5v14M5 12h14" />
            </ZoomButton>
          </div>
        )}

        {status.kind === "booting" && (
          <StageMessage>
            <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "live2d.preparing")}</p>
          </StageMessage>
        )}

        {status.kind === "loading" && (
          <StageMessage>
            <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "live2d.loading")}</p>
            {status.total > 0 && (
              <>
                <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--mn-border)_25%,transparent)]">
                  <div className="h-full rounded-full bg-[var(--mn-accent)] transition-[width]" style={{ width: `${Math.min(100, Math.round((status.loaded / status.total) * 100))}%` }} />
                </div>
                <p className="mt-2 font-mono text-[10px] text-[var(--mn-text-muted)]">
                  {formatBytes(status.loaded)} / {formatBytes(status.total)}
                </p>
              </>
            )}
          </StageMessage>
        )}

        {(status.kind === "error" || status.kind === "unsupported") && (
          <StageMessage>
            <h3 className="font-[var(--mn-font-display)] text-lg text-[var(--mn-text)] sm:text-xl">
              {t(locale, status.kind === "unsupported" ? "live2d.unsupportedTitle" : "live2d.loadErrorTitle")}
            </h3>
            <p className="mt-2 max-w-md text-xs font-medium leading-6 text-[var(--mn-text-muted)] sm:text-sm">
              {t(locale, status.kind === "unsupported" ? "live2d.unsupportedDescription" : "live2d.loadErrorDescription")}
            </p>
            {status.kind === "error" && (
              <>
                <p className="mt-2 max-w-md break-all font-mono text-[10px] text-[var(--mn-text-muted)]">{status.detail}</p>
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="mn-focus mn-stamp-press mt-4 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
                >
                  {t(locale, "live2d.retry")}
                </button>
              </>
            )}
          </StageMessage>
        )}
      </div>
    </div>
  );
}

function ZoomButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="mn-focus grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/15 disabled:opacity-35"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">{children}</svg>
    </button>
  );
}

/**
 * Zoom and pan on the stage: the wheel zooms about the cursor, a drag pans once zoomed in, two fingers pinch-zoom and
 * pan, a double click or double tap resets. Before zooming in, one finger still scrolls the page (touch-action pan-y).
 */
function useLive2DGestures(hostRef: RefObject<HTMLDivElement | null>, enabled: boolean, setView: Dispatch<SetStateAction<Live2DView>>) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; x: number; y: number } | null = null;
    let zoomed = false;
    let lastTap = 0;
    const track = (next: Live2DView) => {
      zoomed = next.zoom > 1;
      host.style.touchAction = zoomed ? "none" : "pan-y";
      host.style.cursor = zoomed ? "grab" : "";
      return next;
    };
    const update = (change: (current: Live2DView) => Live2DView) => setView((current) => track(change(current)));
    host.style.touchAction = "pan-y";

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const [px, py] = toNdc(event.clientX, event.clientY, host.getBoundingClientRect());
      // a notch of a mouse wheel (about 100 px) zooms about 1.2x; trackpads send many small deltas
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0018));
      update((current) => zoomAbout(current, factor, px, py));
    };
    const midpoint = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) pinch = midpoint();
      if (pointers.size === 1 && event.pointerType !== "mouse") {
        const now = performance.now();
        if (now - lastTap < 300) update(() => IDENTITY_VIEW);
        lastTap = now;
      }
      if (zoomed || pointers.size === 2) host.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const rect = host.getBoundingClientRect();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2 && pinch) {
        const next = midpoint();
        if (!next || pinch.distance <= 0) return;
        const factor = next.distance / pinch.distance;
        const [px, py] = toNdc(next.x, next.y, rect);
        const dx = ((next.x - pinch.x) / rect.width) * 2, dy = (-(next.y - pinch.y) / rect.height) * 2;
        update((current) => zoomAbout(clampView({ ...current, x: current.x + dx, y: current.y + dy }), factor, px, py));
        pinch = next;
        event.preventDefault();
      } else if (zoomed && pointers.size === 1) {
        const dx = ((event.clientX - previous.x) / rect.width) * 2, dy = (-(event.clientY - previous.y) / rect.height) * 2;
        update((current) => clampView({ ...current, x: current.x + dx, y: current.y + dy }));
        host.style.cursor = "grabbing";
        event.preventDefault();
      }
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (zoomed) host.style.cursor = "grab";
    };
    const onDoubleClick = () => update(() => IDENTITY_VIEW);

    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);
    host.addEventListener("dblclick", onDoubleClick);
    return () => {
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("dblclick", onDoubleClick);
      host.style.touchAction = "";
      host.style.cursor = "";
    };
  }, [hostRef, enabled, setView]);
}

/** Watermark over the stage; it stays on the model in fullscreen. */
export function StageSignature() {
  return (
    <div className="pointer-events-none absolute left-3 top-2 z-10 w-20 select-none opacity-85 sm:left-4 sm:top-3 sm:w-28">
      <BrandLogo />
    </div>
  );
}

function StageMessage({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">{children}</div>;
}

/** WebGL2 and Custom Elements, which the model player needs (it draws one model, so no audio). */
function supportsLive2D(): boolean {
  if (typeof customElements === "undefined" || typeof WebGL2RenderingContext === "undefined") return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    // Browsers cap live WebGL contexts per page; release the probe right away.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
