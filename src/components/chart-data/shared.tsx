import { useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { ChartRow } from "@/lib/chart-data/catalog";
import type { ChartDataState } from "@/lib/chart-data/query";
import type { ScenarioSupport } from "@/lib/chart-data/scenario";
import type { DataBand, MusicData } from "@/lib/chart-data/types";
import type { SnapRankRequest, SnapRankingSource, SnapRankingState } from "@/lib/chart-data/snap-client";
import type { SnapEvaluationProfile } from "@/lib/chart-data/snap-types";
import { DIFFICULTY_SHORT_LABELS, isMusicDifficulty } from "@/lib/music/difficulty";

/** Everything the views share: the data, the choices and the text helpers. */
export interface ChartDataContext {
  locale: AppLocale;
  /** `t(locale, "chartData.<key>")`. */
  tr: (key: string, values?: Record<string, string | number>) => string;
  data: MusicData;
  /** Every chart, with the figures of the current scenario. */
  rows: ChartRow[];
  byScore: ReadonlyMap<number, ChartRow>;
  bands: ReadonlyMap<string, DataBand>;
  /** The file has deck statistics (a file made with --no-deck has none). */
  hasStats: boolean;
  support: ScenarioSupport;
  state: ChartDataState;
  update: (patch: Partial<ChartDataState>) => void;
  /** Skill values as fractions (1 = +100 %). */
  skills: number[];
  title: (row: ChartRow) => string;
  bandName: (row: ChartRow) => string;
  bandColor: (row: ChartRow) => string;
  jacketUrl: (row: ChartRow) => string | null;
  songHref: (row: ChartRow) => string;
  previewHref: (row: ChartRow) => string;
  lengthOf: (row: ChartRow) => number | null;
  eff: (row: ChartRow) => { rate: number | null; perMinute: number | null };
  openChart: (scoreId: number) => void;
  /** The rows the band and difficulty filters leave. */
  pool: ChartRow[];
  snap?: { analysis?: SnapRankRequest | undefined; active: boolean; profile: SnapEvaluationProfile; measurement: SnapRankingState; source: SnapRankingSource | null } | undefined;
}

export const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : v.toFixed(d));
export const fmtInt = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString() : "–");
export const diffShort = (difficulty: string) => (isMusicDifficulty(difficulty) ? DIFFICULTY_SHORT_LABELS[difficulty] : difficulty.slice(0, 2).toUpperCase());

// line icons (24 x 24, stroked with currentColor); the star is the site's heading star
const ICONS = {
  star: "m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z",
  out: "M7 17 17 7M9 7h8v8",
  swap: "M4 8h14l-4-4M20 16H6l4 4",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4",
  image: "M4 5h16v14H4zM4 15l4-4 5 5 3-3 4 4M15 9h.01",
  play: "M8 5v14l11-7z",
} as const;

export function Icon({ name, className = "mn-cd-ic" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "star" ? 1.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** A heading with the site's star and orbit track; `children` are right-aligned controls. */
export function Heading({ level = 2, title, children }: { level?: 2 | 3; title: ReactNode; children?: ReactNode }) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <div className="mn-cd-sec-head">
      <Icon name="star" className="mn-cd-ic mn-cd-star" />
      <Tag>{title}</Tag>
      <span className="mn-cd-track" aria-hidden="true" />
      {children ? <div className="mn-cd-tail">{children}</div> : null}
    </div>
  );
}

export function Jacket({ ctx, row, size = "" }: { ctx: ChartDataContext; row: ChartRow; size?: "" | "sm" | "xl" }) {
  const url = ctx.jacketUrl(row);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={`mn-cd-jk${size ? ` ${size}` : ""}`} style={{ ["--band" as string]: ctx.bandColor(row) }}>
      <span className="mn-cd-jk-fallback">{ctx.title(row).slice(0, 1)}</span>
      {url && failed !== url ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(url)} /> : null}
    </span>
  );
}

export function LevelBadge({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  return (
    <span className={`mn-cd-lv d-${row.difficulty}`} title={ctx.tr(`difficulties.${row.difficulty}`)}>
      <small>{diffShort(row.difficulty)}</small>{String(row.displayLevel)}
    </span>
  );
}

/** The link to the song's page on this site (credits, vocals, audio, jacket, chart previews). */
export function SongLink({ ctx, row, label }: { ctx: ChartDataContext; row: ChartRow; label?: string }) {
  return (
    <a
      className={label ? "mn-cd-moe-btn" : "mn-cd-moe"}
      href={ctx.songHref(row)}
      title={ctx.tr("songPageHint")}
      aria-label={label ? undefined : ctx.tr("songPage")}
      onClick={(event) => event.stopPropagation()}
    >
      {label ?? null}
      <Icon name="out" />
    </a>
  );
}

export function SongCell({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  return (
    <div className="mn-cd-song">
      <Jacket ctx={ctx} row={row} />
      <div className="mn-cd-song-text">
        <div className="mn-cd-song-title"><span className="t">{ctx.title(row)}</span><SongLink ctx={ctx} row={row} /></div>
        <div className="mn-cd-song-band"><i className="mn-cd-dot" style={{ background: ctx.bandColor(row) }} />{ctx.bandName(row)}</div>
      </div>
    </div>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Segmented choice (`tabs`: the ranking tab bar). */
export function Seg<T extends string>({ options, value, onPick, variant = "seg", label }: {
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onPick: (value: T) => void;
  variant?: "seg" | "mini" | "tabs";
  label?: string;
}) {
  return (
    <div className={variant === "tabs" ? "mn-cd-tabs" : variant === "mini" ? "mn-cd-seg mini" : "mn-cd-seg"} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
