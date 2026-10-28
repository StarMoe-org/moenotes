"use client";

import { useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import LevelSwitch from "@/components/shared/LevelSwitch";
import RewardChip from "@/components/shared/RewardChip";
import { difficultyStyles } from "@/components/music/difficulty-styles";
import { getMusicRankingHref } from "@/lib/game-api/links";
import { getChartPreviewHref } from "@/lib/music/chart-preview";
import type { MusicViewModel, SongDifficultyModel } from "@/lib/music/data";
import { MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import type { MusicComboTiersModel, MusicExpRewardsModel } from "@/lib/music/live-rewards";
import {
  GEKISOU_MISSION_KEYS,
  METRICS_OVERHEAD_MS,
  formatBpm,
  formatDuration,
  formatNumber,
  formatPercent,
  isGekisouMission,
  lookupMetrics,
  type ChartMetricsIndex,
} from "@/lib/music/metrics";
import type { ChartMetricsStatus } from "@/lib/music/use-chart-metrics";

interface ChartPanelProps {
  locale: AppLocale;
  song: MusicViewModel;
  metrics: ChartMetricsIndex;
  status: ChartMetricsStatus;
  comboTiers: readonly MusicComboTiersModel[];
}

const sectionHeader = "border-b border-outline-variant px-6 py-4 sm:px-8";
const subHeading = "text-label-medium text-on-surface-variant";
const linkButton = "md3-button md3-button--outlined md3-button--small";

/** One difficulty at a time: its figures (music-data.json), the Gekisou missions, the combo tier rewards and tool links. */
export default function MusicChartPanel({ locale, song, metrics, status, comboTiers }: ChartPanelProps) {
  const available = MUSIC_DIFFICULTIES.filter((difficulty) => song.difficulties.some((entry) => entry.difficulty === difficulty));
  const [picked, setPicked] = useState<MusicDifficulty>(available.includes("expert") ? "expert" : available.at(-1) ?? "expert");
  const difficulty = available.includes(picked) ? picked : available.at(-1);
  if (!difficulty) return null;
  const chart = song.difficulties.find((entry) => entry.difficulty === difficulty)!;
  const figures = lookupMetrics(metrics, song.id, difficulty, chart.scoreId);
  const loading = status === "loading";
  const value = (text: string) => (loading ? "…" : text);
  const missions = (song.gekisouMissions?.length ? song.gekisouMissions : figures?.missions ?? []).filter(isGekisouMission);
  const tiers = comboTiers.find((entry) => entry.difficulty === difficulty)?.tiers ?? [];
  const difficultyLabel = (entry: MusicDifficulty) => t(locale, `music.difficultyLevels.${entry}`);
  const optionIndex = (entry: MusicDifficulty) => MUSIC_DIFFICULTIES.indexOf(entry);

  const cells: Array<[string, ReactNode]> = [
    [t(locale, "music.chart.level"), chart.displayLevel],
    [t(locale, "music.chart.duration"), value(formatDuration(figures?.durationMs))],
    [t(locale, "music.chart.bpm"), value(formatBpm(figures))],
    [t(locale, "music.chart.notes"), formatNumber(figures?.notes ?? chart.notesCount, locale)],
    [t(locale, "music.chart.nps"), value(formatNumber(figures?.nps, locale, 2))],
    [t(locale, "music.chart.skillCoverage"), value(formatPercent(figures?.skillCoverage, locale))],
    [t(locale, "music.chart.rate"), value(formatNumber(figures?.rate, locale, 2))],
    [t(locale, "music.chart.perMinute"), value(formatNumber(figures?.perMinute, locale, 2))],
  ];

  return (
    <div className="md3-surface overflow-hidden">
      <div className={sectionHeader}>
        <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{t(locale, "music.chart.title")}</h3>
      </div>
      <div className="space-y-6 p-6 sm:p-8">
        <LevelSwitch
          label={t(locale, "music.chart.difficulty")}
          value={optionIndex(difficulty)}
          options={available.map(optionIndex)}
          formatOption={(option) => difficultyLabel(MUSIC_DIFFICULTIES[option]!)}
          onChange={(option) => setPicked(MUSIC_DIFFICULTIES[option] ?? difficulty)}
        />

        <div className={`rounded-shape-lg border p-4 ${difficultyStyles[difficulty].cardBg}`}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {cells.map(([label, content]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-label-small text-on-surface-variant">{label}</dt>
                <dd className="mt-0.5 font-mono text-title-large text-on-surface">{content}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-label-small leading-5 text-on-surface-variant">
            {status === "error" ? t(locale, "music.chart.unavailable") : t(locale, "music.chart.efficiencyHint", { overhead: METRICS_OVERHEAD_MS / 1000 })}
          </p>
        </div>

        {missions.length > 0 && (
          <section>
            <h4 className={subHeading}>{t(locale, "music.gekisou.title")}</h4>
            <ol className="mt-2 grid grid-cols-3 gap-2">
              {missions.map((mission, index) => (
                <li key={index} className="rounded-shape-md border border-outline-variant bg-surface-container px-3 py-2 text-center">
                  <span className="block text-label-small text-on-surface-variant">{t(locale, "music.gekisou.range", { index: index + 1 })}</span>
                  <span className="mt-0.5 block text-label-large text-primary">{t(locale, `music.gekisou.missions.${GEKISOU_MISSION_KEYS[mission]}`)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {tiers.length > 0 && (
          <section>
            <h4 className={subHeading}>{t(locale, "music.comboTiers.title")}</h4>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {tiers.map((tier) => (
                <li key={tier.percent} className="flex items-center justify-between gap-3 rounded-shape-md border border-outline-variant bg-surface-container-low px-3 py-2">
                  <span className="shrink-0">
                    <span className="block text-label-large text-primary">
                      {tier.percent === 100 ? t(locale, "music.comboTiers.fullCombo") : t(locale, "music.comboTiers.tier", { percent: tier.percent })}
                    </span>
                    <span className="block font-mono text-label-small text-on-surface-variant">
                      {t(locale, "music.comboTiers.combo", { count: comboNeeded(chart, tier.percent).toLocaleString(locale) })}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-wrap justify-end gap-2">
                    {tier.rewards.map((reward, index) => <RewardChip key={index} reward={reward} locale={locale} variant="icon" />)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <a href={getChartPreviewHref(locale, { musicId: song.id, difficulty })} className={linkButton}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
            {t(locale, "music.chart.openPreview", { difficulty: difficultyLabel(difficulty) })}
          </a>
          <a href={getMusicRankingHref(locale, song.id)} className={linkButton}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /></svg>
            {t(locale, "music.ranking.title")}
          </a>
        </div>
      </div>
    </div>
  );
}

/** The combo a tier asks for: the share of the chart's full combo, rounded up. */
function comboNeeded(chart: SongDifficultyModel, percent: number): number {
  return Math.ceil((chart.notesCount * percent) / 100);
}

/** What a live pays per score rank (every song alike). */
export function MusicExpRewards({ locale, rewards }: { locale: AppLocale; rewards: MusicExpRewardsModel }) {
  if (!rewards.ranks.length || !rewards.fields.length) return null;
  return (
    <div className="md3-surface overflow-hidden">
      <div className={sectionHeader}>
        <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{t(locale, "music.expRewards.title")}</h3>
      </div>
      <div className="p-6 sm:p-8">
        <div className="overflow-x-auto rounded-shape-md border border-outline-variant">
          <table className="min-w-full divide-y divide-outline-variant text-body-medium">
            <thead className="bg-surface-container text-left text-label-medium text-on-surface-variant">
              <tr>
                <th scope="col" className="px-3 py-2">{t(locale, "music.live.rank")}</th>
                {rewards.fields.map((field) => <th key={field} scope="col" className="whitespace-nowrap px-3 py-2 text-right">{t(locale, `music.expRewards.fields.${field}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-outline-variant/50 bg-surface-container-low">
              {rewards.ranks.map((rank) => (
                <tr key={rank.liveScoreRank}>
                  <th scope="row" className="px-3 py-2 text-left font-black text-primary">{rank.rank}</th>
                  {rewards.fields.map((field) => (
                    <td key={field} className="px-3 py-2 text-right font-mono font-semibold text-on-surface">{rank.values[field].toLocaleString(locale)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-label-small leading-5 text-on-surface-variant">{t(locale, "music.expRewards.hint")}</p>
      </div>
    </div>
  );
}
