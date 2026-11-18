"use client";

import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { Icon } from "@/components/shared/icons";
import { t } from "@/i18n";
import type { DeckTeamParking } from "@/lib/deck/answer";
import { parkingPlan, scoreRankName, type DeckParkingPlay } from "@/lib/deck/parking";
import { DeckNumberField, DeckSwitchRow } from "./DeckControls";

export interface DeckParkingPanelProps {
  locale: AppLocale;
  parking: DeckTeamParking;
}

export default function DeckParkingPanel({ locale, parking }: DeckParkingPanelProps) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const [currentPt, setCurrentPt] = useState<number>(0);
  const [targetPt, setTargetPt] = useState<number | null>(null);
  const hasAllBoosts = Boolean(parking.allBoostPlays && parking.allBoostPlays.length > parking.plays.length);
  const [allowAllBoosts, setAllowAllBoosts] = useState(hasAllBoosts);
  const [allowLowerRanks, setAllowLowerRanks] = useState(false);

  const fmt = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  const rawPool = hasAllBoosts && allowAllBoosts ? parking.allBoostPlays! : parking.plays;
  const topRank = useMemo(() => rawPool.reduce((max, p) => Math.max(max, p.rank), -1), [rawPool]);
  const hasMultipleRanks = useMemo(() => new Set(rawPool.map((p) => p.rank)).size > 1, [rawPool]);
  const activePool = useMemo<readonly DeckParkingPlay[]>(
    () => (!allowLowerRanks && hasMultipleRanks ? rawPool.filter((p) => p.rank === topRank) : rawPool),
    [rawPool, allowLowerRanks, hasMultipleRanks, topRank],
  );

  const gap = targetPt === null ? null : Math.trunc(targetPt) - Math.trunc(currentPt);
  const result = useMemo(
    () => (gap !== null && gap > 0 && Number.isSafeInteger(gap) ? parkingPlan(gap, activePool) : null),
    [activePool, gap],
  );

  const usesCp = activePool.some((p) => p.cpCost > 0);
  const playCostLabel = (play: DeckParkingPlay) =>
    play.cpCost > 0
      ? tr("parkingCpCost", { n: fmt.format(play.cpCost) })
      : tr("parkingBoostCost", { n: fmt.format(play.boosts) });

  return (
    <details className="dr-timing-guide mt-3" data-testid="deck-parking-panel">
      <summary className="dr-timing-guide-summary md3-state">
        <span>{tr("parkingTitle")}</span>
        <span className="dr-timing-guide-right">
          {gap !== null && gap > 0 && (
            <span className="dr-timing-advance">{tr("parkingGapLabel", { n: fmt.format(gap) })}</span>
          )}
          <Icon name="chevronDown" className="dr-timing-guide-chevron h-4 w-4" />
        </span>
      </summary>
      <div className="dr-timing-guide-body flex flex-col gap-3">
        <p className="m-0 text-xs text-on-surface-variant">{tr("parkingSubtitle")}</p>
        <div className="dc-field-pair">
          <DeckNumberField
            label={tr("parkingCurrentLabel")}
            min={0}
            step={1}
            inputMode="numeric"
            value={currentPt}
            onChange={(val) => setCurrentPt(val === null ? 0 : Math.max(0, Math.trunc(val)))}
          />
          <DeckNumberField
            label={tr("parkingTargetLabel")}
            min={0}
            step={1}
            inputMode="numeric"
            value={targetPt}
            onChange={(val) => setTargetPt(val === null ? null : Math.max(0, Math.trunc(val)))}
          />
        </div>
        {(hasAllBoosts || hasMultipleRanks) && (
          <div className="flex flex-col gap-1.5">
            {hasAllBoosts && (
              <DeckSwitchRow
                label={tr("parkingAllowAllBoosts")}
                checked={allowAllBoosts}
                onChange={setAllowAllBoosts}
              />
            )}
            {hasMultipleRanks && (
              <DeckSwitchRow
                label={tr("parkingAllowLowerRanks")}
                checked={allowLowerRanks}
                onChange={setAllowLowerRanks}
              />
            )}
          </div>
        )}

        {gap === 0 && (
          <p className="m-0 rounded-xl bg-secondary-container/60 px-3 py-2 text-xs font-medium text-on-secondary-container" role="status">
            {tr("parkingAlreadyAtTarget")}
          </p>
        )}
        {gap !== null && gap < 0 && (
          <p className="m-0 rounded-xl bg-surface-container px-3 py-2 text-xs text-on-surface-variant" role="status">
            {tr("parkingAlreadyPastTarget", { n: fmt.format(Math.abs(gap)) })}
          </p>
        )}
        {result?.exact && (
          <div className="flex flex-col gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-low p-3" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-on-surface">
              <span>+{fmt.format(result.exact.points)} PT</span>
              <span className="text-primary">
                {tr("parkingExactBadge", {
                  plays: fmt.format(result.exact.plays),
                  cost: usesCp
                    ? tr("parkingCpCost", { n: fmt.format(result.exact.totalCpCost) })
                    : tr("parkingBoostCost", { n: fmt.format(result.exact.totalBoosts) }),
                })}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {result.exact.steps.map((step, idx) => (
                <li
                  key={`${step.play.rank}:${step.play.boosts}:${step.play.cpCost}:${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container px-2.5 py-1.5 text-xs text-on-surface"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <strong>{tr("parkingStepCount", { n: fmt.format(step.count) })}</strong>
                    <span>· {playCostLabel(step.play)}</span>
                    <span className="rounded bg-secondary-container px-1.5 py-0.5 text-[11px] font-medium text-on-secondary-container">
                      {scoreRankName(step.play.rank)}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums text-on-surface-variant">
                    {tr("parkingStepPoints", {
                      each: fmt.format(step.play.points),
                      total: fmt.format(step.count * step.play.points),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result && !result.exact && gap !== null && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-outline-variant/60 bg-surface-container px-3 py-2.5 text-xs text-on-surface-variant" role="status">
            <p className="m-0 font-medium text-on-surface">{tr("parkingUnreachable")}</p>
            {result.below.points > 0 && (
              <p className="m-0 tabular-nums">
                {tr("parkingNearestBelow", {
                  pt: fmt.format(result.below.points),
                  rem: fmt.format(gap - result.below.points),
                })}
              </p>
            )}
            {result.above && (
              <p className="m-0 tabular-nums">
                {tr("parkingNearestAbove", {
                  pt: fmt.format(result.above.points),
                  over: fmt.format(result.above.points - gap),
                })}
              </p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
