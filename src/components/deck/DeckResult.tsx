import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { BoxCard, CardBox, CardFieldName } from "@/lib/box/model";
import type { DeckAnswer, DeckIssueGroups, DeckPair, DeckTeam } from "@/lib/deck/answer";
import { formatDeckInterval, parseInterval } from "@/lib/deck/interval";
import { groupIssues, isOutOfMemory } from "@/lib/deck/answer";
import type { DeckGoal } from "@/lib/deck/goals";
import type { DeckJobState } from "./use-deck-solver";
import { BoxArtwork, cardTitle, type BoxCatalog } from "@/components/box/BoxManager";
import NativeFormationGroup from "@/components/chart-data/NativeFormationGroup";

export interface DeckResultProps {
  locale: AppLocale;
  job: Exclude<DeckJobState, { status: "idle" }>;
  goal: DeckGoal;
  /** The current inputs differ from the run's. */
  stale: boolean;
  box: CardBox | null;
  catalog: BoxCatalog;
  /** A linked save answers for its cards; missing card values are fixed by uploading a newer save. */
  linked: boolean;
  busy: boolean;
  onStop: () => void;
  onRerun: () => void;
  onEditCard: (key: string) => void;
  onPlayer: () => void;
  onAnswerAll: (keys: string[], field: CardFieldName, value: number) => void;
}

const SKILL_FIELDS: readonly CardFieldName[] = ["liveSkillLevel", "gekisouSkillLevel"];

export default function DeckResult(props: DeckResultProps) {
  const { locale, job } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  if (job.status === "failed") {
    const memory = job.code === "runtime" && isOutOfMemory(job.message);
    return <div className="dr-result" data-state="failed"><div className="dr-alert" role="alert"><strong>{tr(memory ? "outOfMemory" : "runFailed")}</strong>
      {!memory && <small>{job.message}</small>}</div></div>;
  }
  if (job.status === "stopped") return <div className="dr-result" data-state="stopped"><p className="dr-muted">{tr("stoppedEmpty")}</p></div>;
  const answer = job.status === "running" ? job.progress : job.answer;
  const running = job.status === "running";
  if (answer && answer.status !== "ok") return <Issues {...props} answer={answer} />;
  const result = answer?.result ?? null;
  const optimality = result?.optimality;
  const metric = result?.metric ?? (props.goal === "power" ? "power" : ["eventPoints", "challengePoints", "eventItems"].includes(props.goal) ? props.goal : "score");
  return <div className="dr-result" data-state={running ? "running" : "done"} aria-busy={running}>
    {props.stale && !running && <div className="dr-stale" role="status"><strong>{tr("stale")}</strong><button type="button" onClick={props.onRerun}>{tr("rerun")}</button></div>}
    <div className="dr-status">
      {running ? <>
        <div className="dr-phase"><span className="dr-spinner" aria-hidden="true" /><strong>{tr(`phase.${result?.phase ?? "preprocess"}`)}</strong>
          <small>{tr("elapsed", { n: ((result?.elapsedMs ?? 0) / 1000).toFixed(1) })}</small></div>
        <progress className="dr-progress" max={1} value={optimality?.fraction ?? undefined} aria-label={tr("progressLabel")} />
        <button type="button" className="dr-stop" onClick={props.onStop}>{tr("stop")}</button>
      </> : optimality?.proven ? <div className="dr-proven"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <strong>{tr("proven")}</strong>{result?.elapsedMs !== null && result?.elapsedMs !== undefined && <small>{tr("elapsed", { n: (result.elapsedMs / 1000).toFixed(1) })}</small>}</div>
        : <div className="dr-unproven"><strong>{tr(job.status === "done" && job.stopped ? "stoppedUnproven" : "unproven")}</strong></div>}
      {optimality && !optimality.proven && optimality.upperBound !== null && optimality.lowerBound !== null && <p className="dr-bounds">
        {tr("bounds", { best: formatValue(optimality.lowerBound, metric, locale), limit: formatValue(optimality.upperBound, metric, locale) })}
        {optimality.bestGap !== null && <span> · {tr("gapPercent", { n: (optimality.bestGap * 100).toFixed(optimality.bestGap < 0.01 ? 2 : 1) })}</span>}</p>}
      {result && !result.coversAllOwnedCards && <p className="dr-note">{tr("partialBox")}</p>}
    </div>
    {result?.play && <p className="dr-note">{tr("playSummary", { notes: result.play.judged, misses: result.play.misses })}</p>}
    {result && result.teams.length > 0 ? <ol className="dr-teams">{result.teams.map((team, index) => <TeamCard key={index} {...props} team={team} metric={metric} first={index === 0} final={!running} />)}</ol>
      : <p className="dr-muted">{tr(running ? "searching" : "noTeam")}</p>}
  </div>;
}

function formatValue(value: number, goal: string, locale: AppLocale): string {
  const decimals = goal === "scoreAtLeast" || goal === "scoreAndLife" ? 6 : goal === "challengePoints" || goal === "eventPoints" || goal === "eventItems" ? 2 : 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(decimals ? value : Math.floor(value));
}

function TeamCard(props: DeckResultProps & { team: DeckTeam; metric: string; first: boolean; final: boolean }) {
  const { locale, team, metric, box, catalog } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const [copied, setCopied] = useState(false);
  const cardOf = (kind: "member" | "snap", id: number | null) => id === null ? null : box?.cards.find(card => card.kind === kind && card.identity.value === String(id)) ?? null;
  const memberView = (id: number) => catalog.members.find(card => card.id === id);
  const snapView = (id: number | null) => id === null ? undefined : catalog.snaps.find(card => card.id === id);
  const value = team.value;
  const payoff = metric !== "score" && metric !== "power";
  const probability = metric === "scoreAtLeast" || metric === "scoreAndLife";
  const main = metric === "power" ? team.power : payoff ? value?.payoff?.score ?? null : value?.score ?? null;
  const interval = payoff ? value?.payoff?.interval ?? null : metric === "power" ? null : value?.interval ?? null;
  const exact = payoff ? value?.payoff?.exact : value?.exact;
  const displayInterval = interval ?? (probability && exact ? parseInterval({ lower: exact, upper: exact }) : null);
  const slots = team.layout.members.map((id, slot) => {
    const member = cardOf("member", id), snap = cardOf("snap", team.layout.snaps[slot] ?? null);
    return { member: memberView(id), support: snapView(team.layout.snaps[slot] ?? null),
      memberLevel: member?.fields.level.value ?? undefined, memberRank: member?.fields.rank.value ?? undefined,
      supportLevel: snap?.fields.level.value ?? undefined, supportRank: snap?.fields.rank.value ?? undefined };
  });
  const name = (pair: DeckPair) => {
    const member = cardOf("member", pair.member), snap = cardOf("snap", pair.snap);
    return `${member ? cardTitle(member, catalog) : memberView(pair.member)?.characterName ?? pair.member}${pair.snap === null ? "" : ` / ${snap ? cardTitle(snap, catalog) : snapView(pair.snap)?.name ?? pair.snap}`}`;
  };
  async function copy() {
    const lines = team.layout.members.map((id, slot) => `${tr(slot === 2 ? "leaderSlot" : "slotN", { n: slot + 1 })}: ${name({ member: id, snap: team.layout.snaps[slot] ?? null })}`);
    try { await navigator.clipboard.writeText([...lines, tr("freeSeating")].join("\n")); setCopied(true); } catch { setCopied(false); }
  }
  return <li className="dr-team" data-first={props.first}>
    <div className="dr-team-head">
      <span className="dr-rank">{team.rankCertified ? `#${team.rank}` : tr("candidateRank", { n: team.rank })}</span>
      <div className="dr-value"><small>{tr(["score", "scoreAtLeast", "cappedScore", "scoreAndLife"].includes(metric) ? `metricLabel.${metric}` : `valueLabel.${metric}`)}</small>
        <strong>{main === null ? "—" : displayInterval ? formatDeckInterval(displayInterval, locale, probability ? 6 : payoff ? 2 : 0) : formatValue(main, metric, locale)}</strong></div>
      {metric !== "power" && <div className="dr-power"><small>{tr("power")}</small><span>{formatValue(team.power, "power", locale)}</span></div>}
    </div>
    {props.first ? <>
      <div className="dc-stage"><NativeFormationGroup locale={locale} slots={slots} label={tr("formation")} /></div>
      <div className="dc-slot-labels">{team.layout.members.map((id, slot) => <div key={slot} title={name({ member: id, snap: team.layout.snaps[slot] ?? null })}>
        <span className={slot === 2 ? "dc-leader" : ""}>{slot === 2 ? tr("leaderShort") : slot + 1}</span><strong>{name({ member: id, snap: null })}</strong></div>)}</div>
    </> : <ul className="dr-pairs">{[team.leader, ...team.others].map((pair, index) => {
      const member = cardOf("member", pair.member), snap = cardOf("snap", pair.snap);
      return <li key={pair.member} className={index === 0 ? "is-leader" : ""}>
        {member ? <BoxArtwork card={member} catalog={catalog} locale={locale} /> : <span className="dw-card-art dw-card-unknown">?</span>}
        {snap && <BoxArtwork card={snap} catalog={catalog} locale={locale} />}
        <span>{index === 0 && <b>{tr("leaderShort")}</b>}{name(pair)}</span></li>;
    })}</ul>}
    <p className="dr-note">{tr("freeSeating")}</p>
    {props.final && <div className="dr-team-foot">
      {team.orders && <details className="dr-orders"><summary>{tr("orders", { n: team.orders.count })}</summary>
        <dl>{(["min", "median", "max"] as const).map(key => <div key={key}><dt>{tr(`order.${key}`)}</dt><dd>{formatValue(team.orders![key].score, "battle", locale)}</dd></div>)}</dl>
        <p className="dr-muted">{tr("ordersNote")}</p></details>}
      <button type="button" onClick={() => void copy()}>{tr(copied ? "copied" : "copyLayout")}</button>
    </div>}
  </li>;
}

function Issues(props: DeckResultProps & { answer: DeckAnswer }) {
  const { locale, answer, box, catalog, linked, busy } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const field = (name: CardFieldName) => t(locale, `deckWorkspace.${name}`);
  const groups: DeckIssueGroups = groupIssues(answer, box);
  const editable = groups.cards.filter((entry): entry is typeof entry & { card: BoxCard } => entry.card !== null);
  const skillFields = SKILL_FIELDS.filter(name => editable.some(entry => entry.fields.includes(name)));
  return <div className="dr-result" data-state={answer.status}>
    <div className="dr-issues-head" role="status"><strong>{tr(`status.${answer.status}`)}</strong><p>{tr(`statusNote.${answer.status}${linked && (groups.cards.length > 0 || groups.player.length > 0) ? "Linked" : ""}`)}</p></div>
    {!linked && skillFields.map(name => <div className="dc-bulk-skills" key={name}><strong>{field(name)}</strong><div>
      {[1, 5].map(value => <button type="button" key={value} disabled={busy} onClick={() => props.onAnswerAll(editable.filter(entry => entry.fields.includes(name)).map(entry => entry.card.key), name, value)}>
        {t(locale, value === 1 ? "deckWorkspace.allLv1" : "deckWorkspace.allLv5")}</button>)}</div></div>)}
    {groups.cards.length > 0 && <ul className="dr-issue-cards">{groups.cards.map(entry => <li key={`${entry.cardKind}:${entry.masterId}`}>
      {entry.card ? <BoxArtwork card={entry.card} catalog={catalog} locale={locale} /> : <span className="dw-card-art dw-card-unknown">?</span>}
      <div><strong>{entry.card ? cardTitle(entry.card, catalog) : tr("unknownCard", { id: entry.masterId })}</strong>
        <small>{entry.fields.length ? entry.fields.map(field).join(" · ") : entry.issues[0]?.code}</small></div>
      {entry.card && !linked && <button type="button" disabled={busy} onClick={() => props.onEditCard(entry.card!.key)}>{tr("fill")}</button>}
    </li>)}</ul>}
    {(groups.vip.length > 0 || groups.player.length > 0) && <div className="dr-issue-player">
      <p>{[...(groups.vip.length ? [tr("vipMissing")] : []), ...groups.player.map(entry => tr(`playerArea.${entry.area}`))].join(" · ")}</p>
      <button type="button" disabled={busy} onClick={props.onPlayer}>{tr("openPlayer")}</button></div>}
    {(groups.request.length > 0 || groups.other.length > 0) && <details className="dr-issue-details"><summary>{tr("details")}</summary>
      <ul>{[...groups.request, ...groups.other].map((issue, index) => <li key={index}><code>{issue.path}</code> {issue.message}</li>)}</ul></details>}
  </div>;
}
