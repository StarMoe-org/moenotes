import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import BrandLogo from "@/components/shared/BrandLogo";
import { difficultyStyles } from "@/components/music/difficulty-styles";
import { ReleaseRequestError, fetchReleaseBytes } from "@/lib/assets/release";
import {
  CHART_SHEET_THEMES,
  getChartFileUrl,
  getChartImageFileName,
  getChartJacketUrl,
  getChartSheetMetadata,
  type ChartSheetTheme,
} from "@/lib/music/chart";
import { isChartRendererSupported, renderChartSheet } from "@/lib/music/chart-renderer";
import type { MusicViewModel, SongDifficultyModel } from "@/lib/music/data";
import type { RenderRequest } from "@/vendor/moenotes-chart-renderer/renderer.mjs";

type ChartDifficulty = SongDifficultyModel["difficulty"];
type FailureKind = "missing" | "failed" | "unsupported";

type SheetState =
  | { stage: "idle" }
  | { stage: "fetching" | "rendering" }
  | { stage: "ready"; url: string; width: number; height: number; difficulty: ChartDifficulty }
  | { stage: "failed"; kind: FailureKind };

interface Viewport { scale: number; x: number; y: number }

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const PAN_STEP = 48;

/**
 * Draws one difficulty's chart with the upstream moenotes-chart-renderer WASM module (in a module worker)
 * and shows the PNG sheet: an inline overview, and a Modal viewer for panning and zooming.
 */
export default function ChartPreview({ locale, song }: { locale: AppLocale; song: MusicViewModel }) {
  const [difficulty, setDifficulty] = useState<ChartDifficulty>(song.difficulties.at(-1)?.difficulty ?? "expert");
  const [theme, setTheme] = useState<ChartSheetTheme>("white");
  const [sheet, setSheet] = useState<SheetState>({ stage: "idle" });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "success">("idle");
  // Only the newest request may publish its result; switching difficulty mid-render supersedes the old one.
  const generationRef = useRef(0);
  const sheetUrlRef = useRef<string | null>(null);

  // The sheet follows the site theme until the reader picks one.
  useEffect(() => {
    if (document.documentElement.dataset.theme === "dark") setTheme("black");
  }, []);

  useEffect(() => () => {
    if (sheetUrlRef.current) URL.revokeObjectURL(sheetUrlRef.current);
  }, []);

  const draw = useCallback(async (nextDifficulty: ChartDifficulty, nextTheme: ChartSheetTheme) => {
    const chart = song.difficulties.find((entry) => entry.difficulty === nextDifficulty);
    if (!chart) return;
    if (!isChartRendererSupported()) {
      setSheet({ stage: "failed", kind: "unsupported" });
      return;
    }
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;
    setSheet({ stage: "fetching" });
    try {
      const [chartBytes, cover] = await Promise.all([
        fetchReleaseBytes(getChartFileUrl(chart.chartKey), fetch),
        // The jacket is decoration; a sheet without it is still useful.
        fetchReleaseBytes(getChartJacketUrl(song.jacketAssetName), fetch).catch(() => null),
      ]);
      if (!isCurrent()) return;
      const request: RenderRequest = {
        chart: chartBytes,
        cover,
        metadata: getChartSheetMetadata(song, chart, locale),
        options: { theme: nextTheme },
      };
      const onRendering = () => {
        if (isCurrent()) setSheet({ stage: "rendering" });
      };
      const attempt = (overrides: Partial<RenderRequest>) => renderChartSheet({ ...request, ...overrides }, onRendering);
      const result = await attempt({}).catch((error: unknown) => {
        // An undecodable jacket fails the whole render; draw once more without it.
        if (cover && /cover/i.test(String(error))) return attempt({ cover: null });
        // Long charts can exhaust a phone's memory at the default 2x supersampling; 1x needs a quarter of it.
        if (/memory|alloc|abort|unreachable|pixel/i.test(String(error))) return attempt({ options: { theme: nextTheme, supersample: 1 } });
        throw error;
      });
      if (!isCurrent()) return;
      if (sheetUrlRef.current) URL.revokeObjectURL(sheetUrlRef.current);
      const url = URL.createObjectURL(new Blob([result.png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
      sheetUrlRef.current = url;
      setSheet({ stage: "ready", url, width: result.width, height: result.height, difficulty: nextDifficulty });
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Chart preview failed:", error);
      setSheet({ stage: "failed", kind: error instanceof ReleaseRequestError && error.status === 404 ? "missing" : "failed" });
    }
  }, [locale, song]);

  const started = sheet.stage !== "idle";
  const busy = sheet.stage === "fetching" || sheet.stage === "rendering";

  const selectDifficulty = (next: ChartDifficulty) => {
    setDifficulty(next);
    setDownloadState("idle");
    if (started) void draw(next, theme);
  };

  const selectTheme = (next: ChartSheetTheme) => {
    setTheme(next);
    setDownloadState("idle");
    if (started) void draw(difficulty, next);
  };

  const download = () => {
    if (sheet.stage !== "ready") return;
    setDownloadState("downloading");
    try {
      const anchor = document.createElement("a");
      anchor.href = sheet.url;
      anchor.download = getChartImageFileName(song.title, sheet.difficulty);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setDownloadState("success");
    } catch {
      setDownloadState("idle");
    }
    setTimeout(() => setDownloadState("idle"), 1500);
  };

  const difficultyLabel = (value: ChartDifficulty) => t(locale, `music.difficultyLevels.${value}`);

  const previewActions = sheet.stage === "ready" ? (
    <button
      type="button"
      onClick={download}
      disabled={downloadState === "downloading"}
      className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
      aria-label={t(locale, "music.chartPreview.download")}
    >
      {downloadState === "idle" && (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      )}
      {downloadState === "downloading" && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" />
          <path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {downloadState === "success" && (
        <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  ) : null;

  return (
    <section className="mn-paper overflow-hidden" aria-labelledby="chart-preview-title">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-3 sm:px-8">
        <h3 id="chart-preview-title" className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">
          {t(locale, "music.chartPreview.title")}
        </h3>
        <BrandLogo className="mn-brand-chart" />
      </div>

      <div className="space-y-5 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <Segmented
              label={t(locale, "music.chartPreview.difficultyLabel")}
              value={difficulty}
              disabled={busy}
              onChange={(key) => selectDifficulty(key as ChartDifficulty)}
              options={song.difficulties.map((entry) => ({
                key: entry.difficulty,
                label: `${difficultyStyles[entry.difficulty].shortLabel} ${entry.displayLevel}`,
                title: `${difficultyLabel(entry.difficulty)} ${entry.displayLevel}`,
                dot: difficultyStyles[entry.difficulty].dot,
              }))}
            />
            <Segmented
              label={t(locale, "music.chartPreview.themeLabel")}
              value={theme}
              disabled={busy}
              onChange={(key) => selectTheme(key as ChartSheetTheme)}
              options={CHART_SHEET_THEMES.map((key) => ({ key, label: t(locale, `music.chartPreview.themes.${key}`) }))}
            />
          </div>
          {sheet.stage === "ready" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setViewerOpen(true)} className={secondaryButton}>
                <ExpandIcon />
                {t(locale, "music.chartPreview.openViewer")}
              </button>
              <button type="button" onClick={download} className={secondaryButton}>
                <DownloadIcon />
                {t(locale, "music.chartPreview.download")}
              </button>
            </div>
          )}
        </div>

        <SheetStage
          locale={locale}
          sheet={sheet}
          alt={sheet.stage === "ready" ? t(locale, "music.chartPreview.imageAlt", { title: song.title, difficulty: difficultyLabel(sheet.difficulty) }) : ""}
          onDraw={() => void draw(difficulty, theme)}
          onOpen={() => setViewerOpen(true)}
        />

      </div>

      <Modal
        isOpen={viewerOpen && sheet.stage === "ready"}
        onClose={() => {
          setViewerOpen(false);
          setDownloadState("idle");
        }}
        title={sheet.stage === "ready" ? `${song.title} · ${difficultyLabel(sheet.difficulty)}` : undefined}
        closeLabel={t(locale, "actions.close")}
        size="xl"
        headerActions={previewActions}
      >
        {sheet.stage === "ready" && (
          <SheetViewer
            locale={locale}
            url={sheet.url}
            width={sheet.width}
            height={sheet.height}
            alt={t(locale, "music.chartPreview.imageAlt", { title: song.title, difficulty: difficultyLabel(sheet.difficulty) })}
          />
        )}
      </Modal>
    </section>
  );
}

const secondaryButton = "mn-focus mn-stamp-press inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]";
const primaryButton = "mn-focus mn-stamp-press inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-2.5 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]";

/** Every state keeps the same frame, so the panel does not jump between placeholder, progress and sheet. */
function SheetStage({ locale, sheet, alt, onDraw, onOpen }: {
  locale: AppLocale;
  sheet: SheetState;
  alt: string;
  onDraw: () => void;
  onOpen: () => void;
}) {
  // Text states may grow past the aspect ratio on narrow screens; only the image is clipped and height-capped.
  const frame = "relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] p-6 text-center sm:aspect-[16/9]";

  if (sheet.stage === "ready") {
    return (
      <button type="button" onClick={onOpen} className={`${frame} mn-focus group max-h-[70vh] cursor-zoom-in overflow-hidden p-2 sm:p-3`} aria-label={t(locale, "music.chartPreview.openViewer")}>
        <img className="h-full w-full object-contain" src={sheet.url} width={sheet.width} height={sheet.height} alt={alt} />
      </button>
    );
  }

  if (sheet.stage === "fetching" || sheet.stage === "rendering") {
    return (
      <div className={frame} role="status" aria-live="polite">
        <Spinner className="h-7 w-7 text-[var(--mn-accent-deep)]" />
        <p className="text-sm font-bold text-[var(--mn-text)]">{t(locale, `music.chartPreview.${sheet.stage}`)}</p>
        <p className="max-w-md text-xs font-medium leading-6 text-[var(--mn-text-muted)]">{t(locale, `music.chartPreview.${sheet.stage}Hint`)}</p>
      </div>
    );
  }

  if (sheet.stage === "failed") {
    return (
      <div className={frame} role="alert">
        <h4 className="font-[var(--mn-font-display)] text-lg text-[var(--mn-text)]">{t(locale, `music.chartPreview.${sheet.kind}Title`)}</h4>
        <p className="max-w-md text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, `music.chartPreview.${sheet.kind}Description`)}</p>
        {sheet.kind !== "unsupported" && (
          <button type="button" onClick={onDraw} className={primaryButton}>{t(locale, "music.chartPreview.retry")}</button>
        )}
      </div>
    );
  }

  return (
    <div className={frame}>
      <SheetGlyph />
      <button type="button" onClick={onDraw} className={primaryButton}>{t(locale, "music.chartPreview.draw")}</button>
    </div>
  );
}

/** Drag or arrow keys pan; wheel, pinch, double-click, +/- and the buttons zoom around the pointer or centre. */
function SheetViewer({ locale, url, width, height, alt }: { locale: AppLocale; url: string; width: number; height: number; alt: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  const fit = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    // Layout size, not the bounding box: the Modal scales in with a transform.
    const { clientWidth, clientHeight } = element;
    const scale = Math.min(clientWidth / width, clientHeight / height);
    setView({ scale, x: (clientWidth - width * scale) / 2, y: (clientHeight - height * scale) / 2 });
  }, [height, width]);

  const zoomAt = useCallback((x: number, y: number, factor: number) => {
    setView((current) => {
      const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.scale * factor));
      return { scale, x: x - ((x - current.x) * scale) / current.scale, y: y - ((y - current.y) * scale) / current.scale };
    });
  }, []);

  const zoomAtCentre = (factor: number) => {
    const element = viewportRef.current;
    if (element) zoomAt(element.clientWidth / 2, element.clientHeight / 2, factor);
  };

  const localPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(element);
    // Registered non-passive so wheel zoom does not also scroll the dialog.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", onWheel);
    };
  }, [fit, zoomAt]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    if (pointers.size === 1) {
      setView((current) => ({ ...current, x: current.x + next.x - previous.x, y: current.y + next.y - previous.y }));
    } else if (pointers.size === 2) {
      // Pinch: scale by the change in finger distance, anchored between the fingers.
      const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)![1];
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0) {
        const middle = localPoint((next.x + other.x) / 2, (next.y + other.y) / 2);
        zoomAt(middle.x, middle.y, after / before);
      }
    }
    pointers.set(event.pointerId, next);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? PAN_STEP * 4 : PAN_STEP;
    const pans: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const pan = pans[event.key];
    if (pan) {
      setView((current) => ({ ...current, x: current.x + pan[0], y: current.y + pan[1] }));
    } else if (event.key === "+" || event.key === "=") {
      zoomAtCentre(1.25);
    } else if (event.key === "-") {
      zoomAtCentre(0.8);
    } else if (event.key === "0") {
      fit();
    } else {
      return;
    }
    event.preventDefault();
  };

  const iconButton = "mn-focus mn-stamp-press grid h-10 w-10 place-items-center rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)]";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button type="button" className={iconButton} onClick={() => zoomAtCentre(0.8)} aria-label={t(locale, "music.chartPreview.zoomOut")}><MinusIcon /></button>
        <span className="w-12 text-center font-mono text-xs font-bold text-[var(--mn-text)]" aria-live="polite">{Math.round(view.scale * 100)}%</span>
        <button type="button" className={iconButton} onClick={() => zoomAtCentre(1.25)} aria-label={t(locale, "music.chartPreview.zoomIn")}><PlusIcon /></button>
        <button type="button" className={`${iconButton} w-auto px-4 text-xs font-bold`} onClick={fit}>{t(locale, "music.chartPreview.fit")}</button>
      </div>
      <div
        ref={viewportRef}
        tabIndex={0}
        role="img"
        aria-label={alt}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={(event) => {
          const point = localPoint(event.clientX, event.clientY);
          zoomAt(point.x, point.y, 2);
        }}
        className="mn-focus relative h-[70vh] w-full cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] active:cursor-grabbing"
      >
        <img
          className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          src={url}
          width={width}
          height={height}
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}

function Segmented({ label, options, value, disabled, onChange }: {
  label: string;
  options: Array<{ key: string; label: string; title?: string; dot?: string }>;
  value: string;
  disabled: boolean;
  onChange: (key: string) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-bold text-[var(--mn-text-muted)]">{label}</span>
      <div className="mn-segmented flex w-fit flex-wrap gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            aria-pressed={option.key === value}
            title={option.title}
            aria-label={option.title}
            onClick={() => onChange(option.key)}
            className={`mn-focus inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${option.key === value ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
          >
            {option.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${option.dot}`} aria-hidden="true" />}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" />
      <path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

function SheetGlyph() {
  return (
    <svg className="h-10 w-10 text-[var(--mn-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16M3 9h18M3 15h18" />
    </svg>
  );
}
