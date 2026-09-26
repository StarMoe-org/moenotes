import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { isMusicDifficulty, type MusicDifficulty } from "@/lib/music/difficulty";

export interface ChartPreviewTarget {
  musicId: number;
  difficulty: MusicDifficulty;
}

/** ournotes-player manifest of one chart; nnnotes names charts by MasterLiveMusic id. */
export function getChartManifestUrl({ musicId, difficulty }: ChartPreviewTarget): string {
  return `${assetConfig.chartSite}/charts/${musicId}_${difficulty}.json`;
}

/** Chart previewer page, optionally opened on one chart (`?music=<id>&difficulty=<d>`). */
export function getChartPreviewHref(locale: AppLocale, target?: ChartPreviewTarget): string {
  const path = localizePath(getRoutePathById("chart-preview"), locale);
  if (!target) return path;
  return `${path}?${new URLSearchParams({ music: String(target.musicId), difficulty: target.difficulty })}`;
}

export function parseChartPreviewSearch(search: string): { musicId: number | null; difficulty: MusicDifficulty | null } {
  const params = new URLSearchParams(search);
  const musicId = Number(params.get("music"));
  const difficulty = params.get("difficulty");
  return {
    musicId: Number.isInteger(musicId) && musicId > 0 ? musicId : null,
    difficulty: isMusicDifficulty(difficulty) ? difficulty : null,
  };
}
