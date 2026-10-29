"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import {
  calculateExpGap,
  hasProgressionData,
  type ExpRankStepViewModel,
  type HighScoreGradeKind,
  type ProgressionReferenceViewModel,
} from "@/lib/progression/data";

interface Props {
  locale: AppLocale;
  data: ProgressionReferenceViewModel | undefined;
}

const EXP_SOURCES = ["player", "character", "friendship"] as const;
type ExpSource = (typeof EXP_SOURCES)[number];

const GRADE_TONES: Record<HighScoreGradeKind, string> = {
  bronze: "bg-amber-700/15 text-amber-900 dark:text-amber-300",
  silver: "bg-slate-400/20 text-slate-800 dark:text-slate-200",
  gold: "bg-yellow-500/20 text-yellow-900 dark:text-yellow-300",
};

export default function ProgressionReferenceView({ locale, data }: Props) {
  const [expSource, setExpSource] = useState<ExpSource>("player");
  const [milestonesOnly, setMilestonesOnly] = useState(true);
  const [fromRank, setFromRank] = useState(1);
  const [toRank, setToRank] = useState(50);
  const [carryExp, setCarryExp] = useState(0);

  const numberFmt = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const percentFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }),
    [locale],
  );

  const availableExpSources = useMemo(
    () =>
      EXP_SOURCES.filter((key) => {
        if (!data) return false;
        if (key === "player") return data.playerRanks.length > 0;
        if (key === "character") return data.characterRanks.length > 0;
        return data.friendshipRanks.length > 0;
      }),
    [data],
  );

  useEffect(() => {
    if (availableExpSources.length > 0 && !availableExpSources.includes(expSource)) {
      setExpSource(availableExpSources[0]!);
    }
  }, [availableExpSources, expSource]);

  const activeExpRows: readonly ExpRankStepViewModel[] = useMemo(() => {
    if (!data) return [];
    if (expSource === "character") return data.characterRanks;
    if (expSource === "friendship") return data.friendshipRanks;
    return data.playerRanks;
  }, [data, expSource]);

  useEffect(() => {
    if (activeExpRows.length === 0) return;
    const min = activeExpRows[0]!.rank;
    const max = activeExpRows.at(-1)!.rank;
    setFromRank((prev) => Math.min(max, Math.max(min, prev)));
    setToRank((prev) => Math.min(max, Math.max(min, prev === 50 && max < 50 ? max : prev)));
  }, [activeExpRows]);

  const visibleExpRows = useMemo(() => {
    if (!milestonesOnly || activeExpRows.length <= 25) return activeExpRows;
    const lastRank = activeExpRows.at(-1)?.rank;
    return activeExpRows.filter(
      (row) => row.rank === 1 || row.rank % 5 === 0 || row.rank === lastRank,
    );
  }, [activeExpRows, milestonesOnly]);

  const hasBonusColumn = useMemo(
    () => expSource === "character" && activeExpRows.some((row) => (row.bonus ?? 0) > 0),
    [expSource, activeExpRows],
  );

  const expCalc = useMemo(
    () => calculateExpGap(activeExpRows, fromRank, toRank, carryExp),
    [activeExpRows, fromRank, toRank, carryExp],
  );

  if (!hasProgressionData(data)) {
    return (
      <div className="md3-surface p-8 text-center">
        <p className="text-body-medium text-on-surface-variant">{t(locale, "progressionRef.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Interactive Rank EXP Gap Calculator */}
      {activeExpRows.length > 1 && expCalc && (
        <section className="md3-surface space-y-3.5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-title-medium font-semibold text-on-surface">
              {t(locale, "progressionRef.calcHeading")}
            </h2>
            {availableExpSources.length > 1 && (
              <div className="md3-segmented w-fit" role="group" aria-label={t(locale, "progressionRef.calcSource")}>
                {availableExpSources.map((src) => (
                  <button
                    key={src}
                    type="button"
                    aria-pressed={expSource === src}
                    onClick={() => setExpSource(src)}
                    className="md3-segment md3-state"
                  >
                    {t(locale, `progressionRef.expTabs.${src}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="flex flex-col gap-1">
              <span className="text-label-small text-on-surface-variant">{t(locale, "progressionRef.calcFrom")}</span>
              <input
                type="number"
                min={activeExpRows[0]!.rank}
                max={activeExpRows.at(-1)!.rank}
                value={fromRank}
                onChange={(e) => setFromRank(Number(e.target.value) || 1)}
                className="md3-text-field !h-10 !px-3 font-mono tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-small text-on-surface-variant">{t(locale, "progressionRef.calcTo")}</span>
              <input
                type="number"
                min={activeExpRows[0]!.rank}
                max={activeExpRows.at(-1)!.rank}
                value={toRank}
                onChange={(e) => setToRank(Number(e.target.value) || 1)}
                className="md3-text-field !h-10 !px-3 font-mono tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-small text-on-surface-variant">{t(locale, "progressionRef.calcCarry")}</span>
              <input
                type="number"
                min={0}
                value={carryExp}
                onChange={(e) => setCarryExp(Math.max(0, Number(e.target.value) || 0))}
                className="md3-text-field !h-10 !px-3 font-mono tabular-nums"
              />
            </label>

            <div className="flex flex-col justify-center rounded-shape-md bg-surface-container px-3.5 py-2">
              <span className="text-label-small text-on-surface-variant">{t(locale, "progressionRef.calcRequired")}</span>
              <strong className="font-mono text-title-medium text-on-surface tabular-nums">
                {numberFmt.format(expCalc.requiredExp)}
              </strong>
            </div>
            <div className="flex flex-col justify-center rounded-shape-md bg-primary-container/50 px-3.5 py-2">
              <span className="text-label-small text-on-primary-container">{t(locale, "progressionRef.calcRemaining")}</span>
              <strong className="font-mono text-title-medium text-primary tabular-nums">
                {numberFmt.format(expCalc.remainingExp)}
              </strong>
            </div>
            <div className="flex flex-col justify-center rounded-shape-md bg-surface-container px-3.5 py-2">
              <span className="text-label-small text-on-surface-variant">{t(locale, "progressionRef.calcProgress")}</span>
              <strong className="font-mono text-title-medium text-on-surface tabular-nums">
                {percentFmt.format(expCalc.progressFraction)}
              </strong>
            </div>
          </div>
        </section>
      )}

      {/* 2-Column High-Density Reference Matrix */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {/* Left Column: Rank Experience Tables */}
        {activeExpRows.length > 0 && (
          <section className="md3-surface space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-title-medium font-semibold text-on-surface">
                {t(locale, "progressionRef.expHeading")}
              </h3>
              {activeExpRows.length > 25 && (
                <button
                  type="button"
                  aria-pressed={!milestonesOnly}
                  onClick={() => setMilestonesOnly((prev) => !prev)}
                  className="md3-filter-chip md3-state"
                >
                  {milestonesOnly
                    ? t(locale, "progressionRef.showAllRanks", { count: activeExpRows.length })
                    : t(locale, "progressionRef.milestonesOnly")}
                </button>
              )}
            </div>

            <div className="max-h-[38rem] overflow-auto rounded-shape-md border border-outline-variant">
              <table className="w-full border-collapse text-right font-mono text-body-small tabular-nums">
                <thead className="sticky top-0 bg-surface-container text-label-medium text-on-surface-variant">
                  <tr>
                    <th className="px-3.5 py-2 text-left">{t(locale, "progressionRef.expColumns.rank")}</th>
                    <th className="px-3.5 py-2">{t(locale, "progressionRef.expColumns.delta")}</th>
                    <th className="px-3.5 py-2">{t(locale, "progressionRef.expColumns.cumulative")}</th>
                    {hasBonusColumn && (
                      <th className="px-3.5 py-2">{t(locale, "progressionRef.expColumns.bonus")}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {visibleExpRows.map((row) => (
                    <tr key={row.rank} className="hover:bg-surface-container-low">
                      <td className="px-3.5 py-1.5 text-left font-semibold text-on-surface">Lv.{row.rank}</td>
                      <td className="px-3.5 py-1.5 text-on-surface-variant">{numberFmt.format(row.deltaExp)}</td>
                      <td className="px-3.5 py-1.5 font-medium text-on-surface">{numberFmt.format(row.cumulativeExp)}</td>
                      {hasBonusColumn && (
                        <td className="px-3.5 py-1.5 text-primary">
                          {row.bonus ? `+${numberFmt.format(row.bonus)}` : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Right Column: Band Ratings & High Score Ratings Stacked */}
        <div className="space-y-4">
          {data && data.bandRatings.length > 0 && (
            <section className="md3-surface space-y-3 p-4 sm:p-5">
              <h3 className="text-title-medium font-semibold text-on-surface">
                {t(locale, "progressionRef.bandRatingHeading")}
              </h3>
              <div className="max-h-72 overflow-auto rounded-shape-md border border-outline-variant">
                <table className="w-full border-collapse text-right font-mono text-body-small tabular-nums">
                  <thead className="sticky top-0 bg-surface-container text-label-medium text-on-surface-variant">
                    <tr>
                      <th className="px-3.5 py-2 text-left">{t(locale, "progressionRef.bandColumns.rank")}</th>
                      <th className="px-3.5 py-2">{t(locale, "progressionRef.bandColumns.total")}</th>
                      <th className="px-3.5 py-2">{t(locale, "progressionRef.bandColumns.single")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {data.bandRatings.map((row) => (
                      <tr key={row.rank} className="hover:bg-surface-container-low">
                        <td className="px-3.5 py-1.5 text-left font-semibold text-on-surface">#{row.rank}</td>
                        <td className="px-3.5 py-1.5 font-medium text-on-surface">
                          {numberFmt.format(row.totalRating)}
                        </td>
                        <td className="px-3.5 py-1.5 text-on-surface-variant">
                          {row.singleRating !== null ? numberFmt.format(row.singleRating) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data && data.highScoreRatings.length > 0 && (
            <section className="md3-surface space-y-3 p-4 sm:p-5">
              <h3 className="text-title-medium font-semibold text-on-surface">
                {t(locale, "progressionRef.highScoreHeading")}
              </h3>
              <div className="max-h-80 overflow-auto rounded-shape-md border border-outline-variant">
                <table className="w-full border-collapse text-right font-mono text-body-small tabular-nums">
                  <thead className="sticky top-0 bg-surface-container text-label-medium text-on-surface-variant">
                    <tr>
                      <th className="px-3.5 py-2 text-left">{t(locale, "progressionRef.highScoreColumns.grade")}</th>
                      <th className="px-3.5 py-2">{t(locale, "progressionRef.highScoreColumns.band")}</th>
                      <th className="px-3.5 py-2">{t(locale, "progressionRef.highScoreColumns.total")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {data.highScoreRatings.map((row) => (
                      <tr key={row.key} className="hover:bg-surface-container-low">
                        <td className="px-3.5 py-1.5 text-left font-sans">
                          <span className={`inline-flex items-center rounded-shape-full px-2.5 py-0.5 text-label-small font-semibold ${GRADE_TONES[row.gradeKind]}`}>
                            {t(locale, `progressionRef.grades.${row.gradeKind}`)}
                            {row.romanStep ? ` ${row.romanStep}` : ""}
                          </span>
                        </td>
                        <td className="px-3.5 py-1.5 font-medium text-on-surface">
                          {numberFmt.format(row.bandRating)}
                        </td>
                        <td className="px-3.5 py-1.5 text-on-surface-variant">
                          {row.totalRating !== null ? numberFmt.format(row.totalRating) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
