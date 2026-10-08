import { useCallback, useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getFocusableElements, trapFocus } from "@/components/shared/Modal";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { isTopOverlayLayer, pushOverlayLayer, removeOverlayLayer } from "@/lib/overlay/layer-stack";

export interface LightboxImage {
  src: string;
  alt: string;
  caption?: ReactNode;
  /** File name the download button suggests; without one the button is hidden. */
  downloadName?: string;
}

export interface LightboxProps {
  locale: AppLocale;
  images: readonly LightboxImage[];
  /** Image shown (clamped into range). */
  index: number;
  open: boolean;
  onClose: () => void;
  /** Previous/next; without it the arrows are hidden and only one image can be viewed. */
  onIndexChange?: (index: number) => void;
  /** Wrap from the last image to the first (default false). */
  loop?: boolean;
}

interface View { scale: number; x: number; y: number }

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const STEP = 1.5;
const RESET: View = { scale: 1, x: 0, y: 0 };
const SWIPE_DISTANCE = 60;

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Zoom to `scale` around `point` (stage-centred px), keeping the image spot under it in place. */
export function zoomAround(view: View, scale: number, point: { x: number; y: number }): View {
  const next = clampScale(scale);
  if (next === 1) return RESET;
  const ratio = next / view.scale;
  return { scale: next, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio };
}

/**
 * Full-screen image viewer: wheel or pinch to zoom, drag to pan, double-click to zoom in/reset, swipe or arrows for
 * the previous/next image, keyboard (←/→, Esc, +/-, 0), a download button and a caption. Shares the Modal layer stack,
 * body scroll lock and Back-button behaviour, so it can open over a Modal.
 */
export default function Lightbox({ locale, images, index, open, onClose, onIndexChange, loop = false }: LightboxProps) {
  const [mounted, setMounted] = useState(false);
  const reactId = useId();
  const layerKey = `lightbox-${reactId}`;
  const titleId = `${layerKey}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastGestureMoved = useRef(false);
  const [view, setView] = useState<View>(RESET);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startView: View; startDistance: number; startMid: { x: number; y: number }; origin: { x: number; y: number }; moved: boolean } | null>(null);

  const count = images.length;
  const current = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const image = images[current];
  const canNavigate = Boolean(onIndexChange) && count > 1;
  const hasPrevious = canNavigate && (loop || current > 0);
  const hasNext = canNavigate && (loop || current < count - 1);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const close = useCallback(() => onCloseRef.current(), []);

  const go = useCallback((delta: number) => {
    if (!onIndexChange || count < 2) return;
    const target = current + delta;
    if (target < 0 || target >= count) {
      if (loop) onIndexChange((target + count) % count);
      return;
    }
    onIndexChange(target);
  }, [onIndexChange, count, current, loop]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // A new image starts unzoomed.
  const src = image?.src;
  useEffect(() => {
    setView(RESET);
    setLoaded(false);
    setFailed(false);
  }, [src, open]);

  const stagePoint = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }, []);

  const zoomBy = useCallback((factor: number) => setView((value) => zoomAround(value, value.scale * factor, { x: 0, y: 0 })), []);

  // Layer, scroll lock, focus, keyboard and Back: the same contract as Modal.
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; }, [go]);
  useEffect(() => {
    if (!open) return;
    lockBodyScroll(layerKey);
    pushOverlayLayer(layerKey);
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let didPushHistory = false;
    const isTop = () => isTopOverlayLayer(layerKey);
    const onPopState = () => { if (isTop()) close(); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop() || event.isComposing) return;
      switch (event.key) {
        case "Escape": event.preventDefault(); close(); return;
        case "ArrowLeft": event.preventDefault(); goRef.current(-1); return;
        case "ArrowRight": event.preventDefault(); goRef.current(1); return;
        case "+": case "=": event.preventDefault(); zoomBy(STEP); return;
        case "-": case "_": event.preventDefault(); zoomBy(1 / STEP); return;
        case "0": event.preventDefault(); setView(RESET); return;
        case "Tab": trapFocus(event, panelRef.current); return;
      }
    };
    if (!window.history.state?.modal) {
      window.history.pushState({ modal: true }, "");
      didPushHistory = true;
    }
    const raf = requestAnimationFrame(() => {
      window.addEventListener("popstate", onPopState);
      const panel = panelRef.current;
      if (panel && isTop()) (getFocusableElements(panel)[0] ?? panel).focus({ preventScroll: true });
    });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      removeOverlayLayer(layerKey);
      unlockBodyScroll(layerKey);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("keydown", onKeyDown);
      if (didPushHistory && window.history.state?.modal) window.history.back();
      if (restoreFocus && document.contains(restoreFocus)) requestAnimationFrame(() => restoreFocus.focus({ preventScroll: true }));
    };
  }, [open, layerKey, close, zoomBy]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const stage = stageRef.current;
    if (!open || !stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025));
      const point = stagePoint(event.clientX, event.clientY);
      setView((value) => zoomAround(value, value.scale * factor, point));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [open, mounted, stagePoint]);

  const startGesture = () => {
    const points = [...pointers.current.values()];
    const [a, b] = points;
    const mid = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a ?? { x: 0, y: 0 };
    gesture.current = {
      startView: view,
      startDistance: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
      startMid: mid,
      origin: mid,
      moved: gesture.current?.moved ?? false,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) gesture.current = null;
    setDragging(true);
    startGesture();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    const [a, b] = [...pointers.current.values()];
    if (a && b && g.startDistance > 0) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = clampScale(g.startView.scale * (Math.hypot(a.x - b.x, a.y - b.y) / g.startDistance));
      const zoomed = zoomAround(g.startView, scale, stagePoint(g.startMid.x, g.startMid.y));
      g.moved = true;
      setView(scale === 1 ? RESET : { ...zoomed, x: zoomed.x + mid.x - g.startMid.x, y: zoomed.y + mid.y - g.startMid.y });
      return;
    }
    if (!a) return;
    const dx = a.x - g.origin.x, dy = a.y - g.origin.y;
    if (Math.hypot(dx, dy) > 4) g.moved = true;
    if (g.startView.scale > 1) setView({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) { startGesture(); return; }
    gesture.current = null;
    setDragging(false);
    lastGestureMoved.current = Boolean(g?.moved);
    // An unzoomed horizontal swipe flips images.
    if (g && point && g.startView.scale === 1 && g.startDistance === 0) {
      const dx = point.x - g.origin.x, dy = point.y - g.origin.y;
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const point = stagePoint(event.clientX, event.clientY);
    setView((value) => (value.scale > 1 ? RESET : zoomAround(value, 2.5, point)));
  };

  if (!mounted || !open || !image) return null;

  const controlButton = "mn-focus grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur transition hover:bg-black/65 disabled:cursor-default disabled:opacity-35";
  const zoomed = view.scale > 1;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed inset-0 z-[1400] flex flex-col bg-black/90 text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <h2 id={titleId} className="sr-only">{image.alt || t(locale, "lightbox.label")}</h2>
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 p-3 sm:p-4">
        <span className="rounded-full bg-black/45 px-3 py-1 font-mono text-xs font-bold tabular-nums" aria-live="polite">
          {count > 1 ? t(locale, "lightbox.counter", { current: current + 1, total: count }) : ""}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" className={controlButton} onClick={() => zoomBy(1 / STEP)} disabled={!zoomed} aria-label={t(locale, "lightbox.zoomOut")} title={t(locale, "lightbox.zoomOut")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-4-4" /></svg>
          </button>
          <button type="button" className={controlButton} onClick={() => zoomBy(STEP)} disabled={view.scale >= MAX_SCALE} aria-label={t(locale, "lightbox.zoomIn")} title={t(locale, "lightbox.zoomIn")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M11 8v6M20 20l-4-4" /></svg>
          </button>
          <button type="button" className={controlButton} onClick={() => setView(RESET)} disabled={!zoomed} aria-label={t(locale, "lightbox.reset")} title={t(locale, "lightbox.reset")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" /></svg>
          </button>
          {image.downloadName ? (
            <a className={controlButton} href={image.src} download={image.downloadName} target="_blank" rel="noopener noreferrer" aria-label={t(locale, "lightbox.download")} title={t(locale, "lightbox.download")}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            </a>
          ) : null}
          <button type="button" className={controlButton} onClick={close} aria-label={t(locale, "lightbox.close")} title={t(locale, "lightbox.close")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onClick={(event) => {
          // A click on the dark backdrop around an unzoomed image closes, like Modal's backdrop (not after a drag).
          if (zoomed || lastGestureMoved.current || event.target !== event.currentTarget) return;
          const rect = imageRef.current?.getBoundingClientRect();
          const onImage = rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
          if (!onImage) close();
        }}
      >
        {!loaded && !failed ? <span className="absolute inset-0 grid place-items-center text-sm font-bold text-white/70">{t(locale, "lightbox.loading")}</span> : null}
        {failed ? <span className="absolute inset-0 grid place-items-center text-sm font-bold text-white/70">{t(locale, "lightbox.failed")}</span> : null}
        <img
          key={image.src}
          ref={imageRef}
          src={image.src}
          alt={image.alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`, transition: dragging ? "none" : "transform 120ms ease-out, opacity 150ms" }}
        />
        {canNavigate ? (
          <>
            <button type="button" className={`${controlButton} absolute left-3 top-1/2 -translate-y-1/2 sm:left-5`} onClick={() => go(-1)} disabled={!hasPrevious} aria-label={t(locale, "lightbox.previous")}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <button type="button" className={`${controlButton} absolute right-3 top-1/2 -translate-y-1/2 sm:right-5`} onClick={() => go(1)} disabled={!hasNext} aria-label={t(locale, "lightbox.next")}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </>
        ) : null}
      </div>

      {image.caption ? (
        <div className="relative z-10 shrink-0 px-4 pb-4 pt-2 text-center text-sm font-medium leading-relaxed text-white/85">{image.caption}</div>
      ) : null}
    </div>,
    document.body,
  );
}
