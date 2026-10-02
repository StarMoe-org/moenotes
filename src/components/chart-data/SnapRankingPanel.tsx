import { useMemo, useState } from "react";
import { isGameServer, PRIMARY_SERVER } from "@/config/servers";
import { assetConfig } from "@/config/assets";
import { ContentServerProvider } from "@/lib/servers/use-content-server";
import { snapProfileKey, snapSourceKey, type SnapRankingCatalogue, type SnapRankingState } from "@/lib/chart-data/snap-client";
import { buildSnapSourceCards, labelSnapRankingCatalogue } from "@/lib/chart-data/snap-source-vms";
import { replaceSnapSlot } from "@/lib/chart-data/snap-query";
import { resolveSnapSupportCardId, validateSnapMemberReplacement, validateSnapSkillReplacement, type SnapLegalityContext, type SnapLegalityIssue } from "@/lib/chart-data/snap-legality";
import SnapSkillPicker from "./SnapSkillPicker";
import SnapPairedMemberControls from "./SnapPairedMemberControls";
import NativeFormationGroup from "./NativeFormationGroup";
import type { ChartDataContext } from "./shared";

export default function SnapRankingPanel({ ctx, catalogue, measurement, loading, invalidMembers, legality, issues, available, catalogueError, onOpen }: {
  ctx: ChartDataContext;
  catalogue: SnapRankingCatalogue | null;
  measurement: SnapRankingState;
  loading: boolean;
  invalidMembers: readonly number[];
  legality: SnapLegalityContext | undefined;
  issues: readonly SnapLegalityIssue[];
  available: boolean;
  catalogueError: boolean;
  onOpen: () => void;
}) {
  const { locale, tr, state, update } = ctx;
  const [rejected, setRejected] = useState<SnapLegalityIssue | null>(null);
  const region = ctx.data.provenance?.region;
  const server = isGameServer(region) ? region : PRIMARY_SERVER;
  const nativeUi = !!assetConfig.gameUiLibraries[server].trim();
  const cards = useMemo(() => catalogue ? buildSnapSourceCards(catalogue.data, ctx.data, catalogue.labelSource, locale) : null, [catalogue, ctx.data, locale]);
  const choices = useMemo(() => catalogue ? labelSnapRankingCatalogue(catalogue.choices, catalogue.data, ctx.data, catalogue.labelSource, locale) : [], [catalogue, ctx.data, locale]);
  const active = state.snapSkills.some(Boolean);
  const current = ctx.snap?.source && snapProfileKey(ctx.snap.profile) === measurement.profileKey && snapSourceKey(ctx.snap.source) === measurement.sourceKey;
  const catalogueStatus = !available ? "loadUnavailable" : catalogueError ? "calculationError" : null;
  const status = invalidMembers.length ? "invalidMember" : catalogueStatus ?? (current && measurement.status === "error" ? "calculationError"
    : current && measurement.status === "needs-context" ? "needsContext" : current && measurement.status === "unsupported" ? "unsupportedScenario" : null);
  return <ContentServerProvider server={server} servers={[server]}><div className="mn-cd-snap-area">
    <SnapSkillPicker locale={locale} choices={choices} selections={state.snapSkills} cards={cards?.snaps}
      loading={loading && !catalogueStatus} error={catalogueStatus ? tr(`snap.${catalogueStatus}`) : null} onOpen={onOpen}
      canReset={active || state.snapMembers.some(Boolean)}
      validateSelection={(slot, selection) => legality ? validateSnapSkillReplacement(state, legality, slot, selection) : null} onReject={setRejected}
      onSelect={(slot, selection) => {
        const issue = legality ? validateSnapSkillReplacement(state, legality, slot, selection) : null;
        if (issue) { setRejected(issue); return; }
        setRejected(null); update({ snapSkills: replaceSnapSlot(state.snapSkills, slot, selection) });
      }}
      onReset={() => { setRejected(null); update({ snapSkills: [null, null, null, null, null], snapMembers: [null, null, null, null, null] }); }}
      {...(nativeUi ? { renderFormation: () => <NativeFormationGroup locale={locale} slots={state.snapSkills.map((selection, slot) => ({
        member: cards?.members.find(member => member.id === state.snapMembers[slot]?.memberId)?.vm,
        support: cards?.snaps.get(resolveSnapSupportCardId(selection, choices) ?? -1),
      }))} label={tr("snap.title")} /> } : {})}
      renderContext={(slot) => <SnapPairedMemberControls locale={locale} members={cards?.members ?? []} value={state.snapMembers[slot] ?? null}
        variant={nativeUi ? "overlay" : "card"} onOpen={onOpen}
        validateSelection={(member) => legality ? validateSnapMemberReplacement(state, legality, slot, member) : null} onReject={setRejected}
        onChange={(member) => {
          const issue = legality ? validateSnapMemberReplacement(state, legality, slot, member) : null;
          if (issue) { setRejected(issue); return; }
          setRejected(null); update({ snapMembers: replaceSnapSlot(state.snapMembers, slot, member) });
        }} />} />
    <p className="mn-cd-note mn-cd-snap-profile-hint">{tr("snap.profileHint")}</p>
    {rejected || issues[0] ? <p className="mn-cd-snap-legality" role="alert">{tr(`snap.legality.${(rejected ?? issues[0])!.code}`, { n: ((rejected ?? issues[0])!.otherSlot ?? 0) + 1 })}</p> : null}
    {catalogue && !catalogue.labelSource ? <p className="mn-cd-note">{tr("snap.snapshotFallback")}</p> : null}
    {active ? <div className="mn-cd-snap-summary">
      <label className="mn-cd-snap-power"><span>{tr("power")}</span><input type="number" className="mn-cd-num power" inputMode="numeric" aria-label={tr("power")}
        min={1} max={20000000} step={1000} value={state.snapPower} onChange={(event) => update({ snapPower: Math.min(20000000, Math.max(1, Math.round(Number(event.target.value) || 1))) })} /></label>
      {status ? <span className="mn-cd-note" role="status">{tr(`snap.${status}`)}</span> : null}
    </div> : null}
  </div></ContentServerProvider>;
}
