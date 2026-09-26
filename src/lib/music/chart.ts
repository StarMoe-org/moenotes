import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { releaseFileUrl } from "@/lib/assets/release";
import type { Metadata } from "@/vendor/moenotes-chart-renderer/renderer.mjs";
import rendererSource from "@/vendor/moenotes-chart-renderer/SOURCE.json";
import type { MusicViewModel, SongDifficultyModel } from "./data";

/** moenotes-chart-renderer presets: white paper and deep neutral black. */
export const CHART_SHEET_THEMES = ["white", "black"] as const;
export type ChartSheetTheme = (typeof CHART_SHEET_THEMES)[number];

/** Source and licences (fonts, Skia, Emscripten) of the vendored renderer; SOURCE.json pins the exact commit. */
export const CHART_RENDERER_SOURCE_URL = `https://github.com/${rendererSource.repository}`;

/** Charts are identical in every language, so one path keeps a single cached copy. */
export function getChartFileUrl(chartKey: string): string {
  return releaseFileUrl(`Live/MusicScore/${chartKey}`, `${chartKey.split("/").at(-1)}.json`, DEFAULT_LOCALE);
}

/** The renderer's Skia build decodes PNG but not WebP, so the sheet uses the jacket's PNG export. */
export function getChartJacketUrl(jacketAssetName: string): string {
  return releaseFileUrl(`Image/Jacket/${jacketAssetName}`, `${jacketAssetName.split("/").at(-1)}.png`, DEFAULT_LOCALE);
}

/** Header text printed on the sheet; the renderer uses it verbatim and does not look anything up. */
export function getChartSheetMetadata(song: MusicViewModel, chart: SongDifficultyModel, locale: AppLocale): Metadata {
  const credits = ([
    ["music.lyricist", song.lyricist],
    ["music.composer", song.composer],
    ["music.arranger", song.arranger],
  ] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => t(locale, "music.chartPreview.sheetCredit", { label: t(locale, label), value }));
  return {
    title: song.title,
    difficulty: t(locale, `music.difficultyLevels.${chart.difficulty}`),
    level: String(chart.displayLevel),
    ...(song.bandName ? { artist: song.bandName } : {}),
    ...(credits.length > 0 ? { author: credits.join(" · ") } : {}),
    // The renderer warns in its report when the chart's reconstructed FC disagrees with masterdata.
    master_full_combo: chart.notesCount,
  };
}

export function getChartImageFileName(title: string, difficulty: SongDifficultyModel["difficulty"]): string {
  const safeTitle = title.replace(/[\/:*?"<>|]+/g, "_").trim() || "chart";
  return `${safeTitle}_${difficulty}.png`;
}
