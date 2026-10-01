import { useMemo } from "react";
import { snapProfileKey, snapSourceKey, type SnapRankingCatalogue, type SnapRankingState } from "@/lib/chart-data/snap-client";
import { buildSnapSourceCards, labelSnapRankingCatalogue } from "@/lib/chart-data/snap-source-vms";
import { replaceSnapSlot } from "@/lib/chart-data/snap-query";
import SnapSkillPicker from "./SnapSkillPicker";
import SnapPairedMemberControls from "./SnapPairedMemberControls";
import type { ChartDataContext } from "./shared";

export default function SnapRankingPanel({ ctx, catalogue, measurement, loading, invalidMembers, available, catalogueError, onOpen }: {
  ctx: ChartDataContext;
  catalogue: SnapRankingCatalogue | null;
  measurement: SnapRankingState;
  loading: boolean;
  invalidMembers: readonly number[];
  available: boolean;
  catalogueError: boolean;
  onOpen: () => void;
}) {
  const { locale, tr, state, update } = ctx;
  const cards = useMemo(() => catalogue ? buildSnapSourceCards(catalogue.data, ctx.data, catalogue.labelSource, locale) : null, [catalogue, ctx.data, locale]);
  const choices = useMemo(() => catalogue ? labelSnapRankingCatalogue(catalogue.choices, catalogue.data, ctx.data, catalogue.labelSource, locale) : [], [catalogue, ctx.data, locale]);
  const active = state.snapSkills.some(Boolean);
  const memberContextVisible = state.snapSkills.some((selection) => selection && choices.some((choice) => choice.kind === selection.kind
    && choice.skillId === selection.skillId && choice.level === selection.level && choice.requirements.includes("paired-member")));
  const current = ctx.snap?.source && snapProfileKey(ctx.snap.profile) === measurement.profileKey && snapSourceKey(ctx.snap.source) === measurement.sourceKey;
  const catalogueStatus = !available ? "loadUnavailable" : catalogueError ? "calculationError" : null;
  const status = invalidMembers.length ? "invalidMember" : catalogueStatus ?? (current && measurement.status === "error" ? "calculationError"
    : current && measurement.status === "needs-context" ? "needsContext" : current && measurement.status === "unsupported" ? "unsupportedScenario" : null);
  return <div className="mn-cd-snap-area">
    <SnapSkillPicker locale={locale} choices={choices} selections={state.snapSkills} cards={cards?.snaps}
      loading={loading && !catalogueStatus} error={catalogueStatus ? tr(`snap.${catalogueStatus}`) : null} onOpen={onOpen}
      onSelect={(slot, selection) => update({ snapSkills: replaceSnapSlot(state.snapSkills, slot, selection) })}
      onReset={() => update({ snapSkills: [null, null, null, null, null], snapMembers: [null, null, null, null, null], snapPower: 300000 })}
      renderContext={(slot, choice) => memberContextVisible || choice?.kind === "gekisou-support" || state.snapMembers[slot]
        ? <SnapPairedMemberControls locale={locale} members={cards?.members ?? []} value={state.snapMembers[slot] ?? null}
          onChange={(member) => update({ snapMembers: replaceSnapSlot(state.snapMembers, slot, member) })} /> : null} />
    {catalogue && !catalogue.labelSource ? <p className="mn-cd-note">{tr("snap.snapshotFallback")}</p> : null}
    {active ? <div className="mn-cd-snap-measure mn-cd-panel">
      <label className="mn-cd-field"><span>{tr("snap.measurementPower")}</span><input type="number" className="mn-cd-num power" inputMode="numeric"
        min={1} max={20000000} step={1000} value={state.snapPower} onChange={(event) => update({ snapPower: Math.min(20000000, Math.max(1, Math.round(Number(event.target.value) || 1))) })} /></label>
      <div><strong>{tr("snap.fixedConditions")}</strong><p>{tr(state.mode === "free" ? "scenario.free" : "snap.fixedGekisou")} {state.mode === "battle" ? `· ${state.ranks.join(" / ")}` : ""}</p>
        <p>{tr("snap.fixedPlan", { great: state.great, just: state.mode === "free" ? 0 : state.just })}</p><small>{tr("snap.profileHint")}</small></div>
      <p className="mn-cd-snap-progress" role="status" aria-live="polite">
        {status ? tr(`snap.${status}`) : current && measurement.status === "complete" ? tr("snap.ready", { n: measurement.rows.size })
          : tr("snap.calculating", { done: current ? measurement.done : 0, total: current ? measurement.total : ctx.pool.length })}
      </p>
      {current && measurement.total > 0 && measurement.status === "running" ? <progress value={measurement.done} max={measurement.total} aria-label={tr("snap.calculating", { done: measurement.done, total: measurement.total })} /> : null}
    </div> : null}
  </div>;
}
