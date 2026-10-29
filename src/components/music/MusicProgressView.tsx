"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { songHref } from "@/components/music/MusicTable";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import {
  DIFFICULTY_CHIP_CLASSES,
  DIFFICULTY_SHORT_LABELS,
  MUSIC_DIFFICULTIES,
  type MusicDifficulty,
} from "@/lib/music/difficulty";
import {
  clearLocalSongProgress,
  computeLevelBreakdown,
  computeProgressSummary,
  loadLinkedSaveSongProgress,
  matchesProgressFilter,
  parseImportedProgressJson,
  readLocalSongProgress,
  serializeProgressExport,
  songProgressKey,
  writeLocalSongProgress,
  type SongProgressChart,
  type SongProgressFilter,
  type SongProgressMap,
  type SongProgressStatus,
} from "@/lib/music/song-progress";
import { showToast } from "@/lib/toast/toast";

interface Props {
  locale: AppLocale;
  server: GameServer;
  songs: readonly MusicViewModel[];
  focusDifficulty?: MusicDifficulty;
  progressFilter: SongProgressFilter;
  onProgressFilterChange: (next: SongProgressFilter) => void;
  titleOf: (song: MusicViewModel) => string;
  assetUrl: (url: string) => string;
  onOpen: () => void;
}

export const PROGRESS_FILTERS: readonly SongProgressFilter[] = ["all", "notCleared", "unfc", "unap", "fcPlus", "ap"];
const STATUSES: readonly SongProgressStatus[] = [0, 1, 2, 3];

export default function MusicProgressView({
  locale,
  server,
  songs,
  focusDifficulty = "expert",
  progressFilter,
  titleOf,
  assetUrl,
  onOpen,
}: Props) {
  const [difficulty, setDifficulty] = useState<MusicDifficulty>(focusDifficulty);
  const [localEntries, setLocalEntries] = useState<SongProgressMap>({});
  const [saveEntries, setSaveEntries] = useState<SongProgressMap>({});
  const [saveLinked, setSaveLinked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDifficulty(focusDifficulty);
  }, [focusDifficulty]);

  useEffect(() => {
    setLocalEntries(readLocalSongProgress(server));
    let cancelled = false;
    void loadLinkedSaveSongProgress(server).then((result) => {
      if (cancelled) return;
      setSaveLinked(result.linked);
      setSaveEntries(result.entries);
    });
    return () => {
      cancelled = true;
    };
  }, [server]);

  const effectiveEntries = useMemo<SongProgressMap>(
    () => ({ ...saveEntries, ...localEntries }),
    [saveEntries, localEntries],
  );

  const statusOf = useCallback(
    (key: string): SongProgressStatus => effectiveEntries[key] ?? 0,
    [effectiveEntries],
  );

  const setChartStatus = useCallback(
    (key: string, next: SongProgressStatus) => {
      setLocalEntries((prev) => {
        const updated = { ...prev };
        if (next === 0 && !saveEntries[key]) {
          delete updated[key];
        } else {
          updated[key] = next;
        }
        writeLocalSongProgress(server, updated);
        return updated;
      });
    },
    [server, saveEntries],
  );

  const chartRows = useMemo(() => {
    return songs.flatMap((song) => {
      const diff = song.difficulties.find((entry) => entry.difficulty === difficulty);
      if (!diff) return [];
      const chart: SongProgressChart = {
        key: songProgressKey(song.id, difficulty),
        songId: song.id,
        difficulty,
        playLevel: diff.displayLevel,
        noteCount: diff.notesCount,
      };
      return [{ song, diff, chart }];
    });
  }, [songs, difficulty]);

  const chartsOnly = useMemo(() => chartRows.map((row) => row.chart), [chartRows]);
  const summary = useMemo(() => computeProgressSummary(chartsOnly, statusOf), [chartsOnly, statusOf]);
  const levelBuckets = useMemo(() => computeLevelBreakdown(chartsOnly, statusOf), [chartsOnly, statusOf]);

  const visibleRows = useMemo(
    () => chartRows.filter((row) => matchesProgressFilter(statusOf(row.chart.key), progressFilter)),
    [chartRows, statusOf, progressFilter],
  );

  const percentFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }),
    [locale],
  );

  const handleExport = () => {
    const json = serializeProgressExport(server, effectiveEntries);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moenotes-song-progress-${server}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedProgressJson(text);
      const merged: SongProgressMap = { ...localEntries, ...imported };
      setLocalEntries(merged);
      writeLocalSongProgress(server, merged);
      showToast({
        title: t(locale, "songProgress.importSuccess", { count: Object.keys(imported).length }),
        icon: "success",
      });
    } catch {
      showToast({
        title: t(locale, "songProgress.importFailed"),
        icon: "warning",
      });
    }
  };

  const handleReset = () => {
    if (!window.confirm(t(locale, "songProgress.resetConfirm"))) return;
    clearLocalSongProgress(server);
    setLocalEntries({});
  };

  const saveCount = Object.keys(saveEntries).length;
  const localCount = Object.keys(localEntries).length;
  const totalSafe = Math.max(1, summary.total);

  return (
    <div className="space-y-4">
      {/* High-Density Summary & Controls Card */}
      <section className="md3-surface space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-title-medium font-semibold text-on-surface">
              {t(locale, "songProgress.summaryHeading")}
            </h2>
            {saveLinked && saveCount > 0 && (
              <span className="rounded-shape-full bg-primary-container px-2.5 py-0.5 text-label-small font-medium text-on-primary-container">
                {t(locale, "songProgress.saveLinkedBadge", { count: saveCount })}
              </span>
            )}
            {localCount > 0 && (
              <span className="rounded-shape-full bg-secondary-container px-2.5 py-0.5 text-label-small font-medium text-on-secondary-container">
                {t(locale, "songProgress.localCountBadge", { count: localCount })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="md3-button md3-button--outlined md3-button--small"
            >
              {t(locale, "songProgress.importJson")}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={Object.keys(effectiveEntries).length === 0}
              className="md3-button md3-button--outlined md3-button--small"
            >
              {t(locale, "songProgress.exportJson")}
            </button>
            {localCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="md3-button md3-button--text md3-button--small"
              >
                {t(locale, "songProgress.resetLocal")}
              </button>
            )}
          </div>
        </div>

        {/* Standard MD3 PrimaryTabs for Difficulty Switching */}
        <div className="space-y-2">
          <div className="md3-tabs" role="tablist" aria-label={t(locale, "songProgress.difficultyLabel")}>
            {MUSIC_DIFFICULTIES.map((diff) => (
              <button
                key={diff}
                type="button"
                role="tab"
                aria-selected={difficulty === diff}
                onClick={() => setDifficulty(diff)}
                className="md3-tab md3-state uppercase"
              >
                {DIFFICULTY_SHORT_LABELS[diff]} · {diff}
              </button>
            ))}
          </div>
          <p className="text-body-small text-on-surface-variant">{t(locale, "songProgress.cycleHint")}</p>
        </div>

        {/* Cumulative Progress Metrics + 4-Segment Stacked Bar */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <MetricTile
              label={t(locale, "songProgress.cumulative.ap")}
              count={summary.allPerfect}
              total={summary.total}
              percent={percentFmt.format(summary.allPerfect / totalSafe)}
              accentClass="border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-300"
            />
            <MetricTile
              label={t(locale, "songProgress.cumulative.fc")}
              count={summary.fullComboOrBetter}
              total={summary.total}
              percent={percentFmt.format(summary.fullComboOrBetter / totalSafe)}
              accentClass="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            />
            <MetricTile
              label={t(locale, "songProgress.cumulative.cleared")}
              count={summary.clearedOrBetter}
              total={summary.total}
              percent={percentFmt.format(summary.clearedOrBetter / totalSafe)}
              accentClass="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            />
          </div>

          {summary.total > 0 && (
            <div className="flex h-3 w-full overflow-hidden rounded-shape-full bg-surface-container-highest" aria-hidden="true">
              {summary.allPerfect > 0 && (
                <div
                  className="bg-fuchsia-500 transition-all"
                  style={{ width: `${(summary.allPerfect / totalSafe) * 100}%` }}
                />
              )}
              {summary.fullComboOnly > 0 && (
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(summary.fullComboOnly / totalSafe) * 100}%` }}
                />
              )}
              {summary.clearedOnly > 0 && (
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(summary.clearedOnly / totalSafe) * 100}%` }}
                />
              )}
            </div>
          )}
        </div>

        {/* Collapsible Level-Constant Tier Matrix */}
        {levelBuckets.length > 0 && (
          <details className="group rounded-shape-md border border-outline-variant/70 bg-surface-container-lowest">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-label-large text-on-surface hover:bg-surface-container-low">
              <span>{t(locale, "songProgress.byLevel", { count: levelBuckets.length })}</span>
              <Icon name="chevronDown" className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="overflow-x-auto border-t border-outline-variant/70">
              <table className="w-full min-w-[460px] border-collapse text-right font-mono text-body-small tabular-nums">
                <thead className="bg-surface-container text-label-medium text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left">{t(locale, "songProgress.levelHeader")}</th>
                    <th className="px-3 py-2">{t(locale, "songProgress.chartsHeader")}</th>
                    <th className="px-3 py-2">{t(locale, "songProgress.statuses.1")}</th>
                    <th className="px-3 py-2">{t(locale, "songProgress.statuses.2")}</th>
                    <th className="px-3 py-2">{t(locale, "songProgress.statuses.3")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {levelBuckets.map((bucket) => (
                    <tr key={bucket.level} className="hover:bg-surface-container-low">
                      <td className="px-3 py-1.5 text-left font-semibold text-on-surface">Lv.{bucket.level}</td>
                      <td className="px-3 py-1.5 text-on-surface-variant">{bucket.total}</td>
                      <td className="px-3 py-1.5 text-emerald-700 dark:text-emerald-400">{bucket.clearedOrBetter}</td>
                      <td className="px-3 py-1.5 text-amber-700 dark:text-amber-400">{bucket.fullComboOrBetter}</td>
                      <td className="px-3 py-1.5 text-fuchsia-700 dark:text-fuchsia-400">{bucket.allPerfect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      {/* Song Rows */}
      {visibleRows.length === 0 ? (
        <div className="md3-surface p-8 text-center">
          <p className="text-body-medium text-on-surface-variant">{t(locale, "songProgress.noChartOnDifficulty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleRows.map(({ song, diff, chart }) => {
            const title = titleOf(song);
            const currentStatus = statusOf(chart.key);
            return (
              <li
                key={chart.key}
                className="mn-list-card mn-list-card-row flex flex-wrap items-center justify-between gap-3 border border-outline-variant bg-surface-container-low p-2.5 sm:flex-nowrap"
              >
                <a
                  href={songHref(song, locale)}
                  onClick={onOpen}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-shape-sm"
                >
                  <img
                    className="h-12 w-12 shrink-0 rounded-shape-md border border-outline-variant bg-surface-container-highest object-cover"
                    src={assetUrl(song.jacketUrl)}
                    alt=""
                    loading="lazy"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-[var(--md-ref-typeface-brand)] text-title-small text-on-surface group-hover:text-primary">
                      {title}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-label-small text-on-surface-variant">
                      {song.bandId > 0 && (
                        <img
                          className="h-4 w-auto shrink-0 object-contain"
                          src={assetUrl(getBandSmallIconUrl(song.bandId))}
                          alt=""
                          aria-hidden="true"
                        />
                      )}
                      <span className="truncate">{song.bandName}</span>
                      {diff.notesCount > 0 && (
                        <span className="shrink-0 font-mono opacity-80">
                          · {t(locale, "songProgress.notesUnit", { count: diff.notesCount })}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={`w-11 shrink-0 rounded border py-0.5 text-center ${DIFFICULTY_CHIP_CLASSES[difficulty]}`}>
                    <span className="block text-[7px] font-black leading-none opacity-65">
                      {DIFFICULTY_SHORT_LABELS[difficulty]}
                    </span>
                    <span className="font-mono text-label-small font-semibold">{diff.displayLevel}</span>
                  </span>
                </a>

                <div className="flex shrink-0 items-center gap-1" role="group" aria-label={title}>
                  {STATUSES.map((statusValue) => {
                    const active = currentStatus === statusValue;
                    const activeTone =
                      statusValue === 3
                        ? "border-fuchsia-500 bg-fuchsia-500 text-white"
                        : statusValue === 2
                          ? "border-amber-500 bg-amber-500 text-white"
                          : statusValue === 1
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-outline bg-surface-container-high text-on-surface";
                    return (
                      <button
                        key={statusValue}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setChartStatus(chart.key, statusValue)}
                        className={`rounded-shape-full border px-2.5 py-1 text-label-small font-semibold transition ${
                          active
                            ? activeTone
                            : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-outline hover:text-on-surface"
                        }`}
                      >
                        {t(locale, `songProgress.statuses.${statusValue}`)}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MetricTile({
  label,
  count,
  total,
  percent,
  accentClass,
}: {
  label: string;
  count: number;
  total: number;
  percent: string;
  accentClass: string;
}) {
  return (
    <div className={`flex items-baseline justify-between rounded-shape-md border px-3.5 py-2.5 ${accentClass}`}>
      <span className="text-label-medium font-semibold">{label}</span>
      <span className="font-mono text-title-medium font-bold tabular-nums">
        {count}/{total} <small className="text-label-small font-medium opacity-80">({percent})</small>
      </span>
    </div>
  );
}
