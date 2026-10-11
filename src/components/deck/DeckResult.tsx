import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import type { BoxCard, CardBox, CardFieldName } from "@/lib/box/model";
import type { DeckAnswer, DeckIssueGroups, DeckTeam } from "@/lib/deck/answer";
import { formatDeckInterval } from "@/lib/deck/interval";
import { groupIssues, isOutOfMemory } from "@/lib/deck/answer";
import type { DeckAggregation, DeckGoal } from "@/lib/deck/goals";
import type { DeckJobState } from "./use-deck-solver";
import { BoxArtwork, cardRarityLabel, cardTitle, type BoxCatalog } from "@/components/box/BoxManager";
import NativeFormationGroup from "@/components/chart-data/NativeFormationGroup";
import { termRate, type RewardTerm } from "@/lib/deck/reward-mix";
import { RewardBreakdown, RewardOrder, RewardTies } from "./DeckRewardMix";

/** The challenge live a run rated challenge points by. */
export interface DeckRateBasis { song: string; difficulty: string; cost: number }

export interface DeckResultProps {
  locale: AppLocale;
  job: Exclude<DeckJobState, { status: "idle" }>;
  goal: DeckGoal;
  /** Set for a run whose challenge points were rated by a challenge live. */
  rateBasis: DeckRateBasis | null;
  /** The current inputs differ from the run's. */
  stale: boolean;
  /** The run's search time limit in seconds, or null without one. */
  timeLimit: number | null;
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
  // The request that rates challenge points is answered first; its teams are not the goal's.
  const rating = job.status === "running" && job.stage === "rate";
  const result = answer?.result ?? null;
  const optimality = result?.optimality;
  const metric = result?.metric ?? (props.goal === "power" ? "power" : ["eventPoints", "challengePoints", "eventItems"].includes(props.goal) ? props.goal : "score");
  const aggregation = result?.aggregation ?? "expected";
  const levels = rating ? null : result?.levels ?? null;
  // A reward plan sums integer weights; the page shows it in the goal's own reward.
  const unit = levels?.[0]![0]!.weight ?? 1;
  const deterministic = result?.goalKind === "skip" || metric === "power";
  const rate = props.rateBasis && job.rate?.result?.teams[0] ? { ...props.rateBasis, answer: job.rate.result } : null;
  const rateProven = !rate || rate.answer.optimality.proven;
  const usesItems = metric === "eventItems" || !!levels?.some(level => level.some(term => term.kind === "eventItems"));
  return <div className="dr-result" data-state={running ? "running" : "done"} aria-busy={running}>
    {props.stale && !running && <div className="dr-stale" role="status"><strong>{tr("stale")}</strong><button type="button" onClick={props.onRerun}>{tr("rerun")}</button></div>}
    <div className="dr-status">
      {running ? <>
        <div className="dr-phase"><span className="dr-spinner" aria-hidden="true" /><strong>{rating ? t(locale, "deckWorkspace.rewardMix.rating") : tr(`phase.${result?.phase ?? "preprocess"}`)}</strong>
          <small>{tr("elapsed", { n: ((result?.elapsedMs ?? 0) / 1000).toFixed(1) })}</small>
          {props.timeLimit !== null && <small className="dr-remaining">{tr("remaining", { n: Math.max(0, props.timeLimit - (result?.elapsedMs ?? 0) / 1000).toFixed(0) })}</small>}</div>
        <progress className="dr-progress" max={1} value={optimality?.fraction ?? undefined} aria-label={tr("progressLabel")} />
        <button type="button" className="dr-stop" onClick={props.onStop}>{tr("stop")}</button>
      </> : optimality?.proven && rateProven ? <div className="dr-proven"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <ProofLink locale={locale} anchor="proven" label={tr("proven")} />{result?.elapsedMs !== null && result?.elapsedMs !== undefined && <small>{tr("elapsed", { n: (result.elapsedMs / 1000).toFixed(1) })}</small>}</div>
        : <div className="dr-unproven"><ProofLink locale={locale} anchor="unproven" label={tr(job.status === "done" && job.stopped ? "stoppedUnproven" : result?.exitReason === "timeLimit" ? "timedOutUnproven" : "unproven")} /></div>}
      {!rating && optimality && !optimality.proven && optimality.upperBound !== null && optimality.lowerBound !== null && <p className="dr-bounds">
        {tr("bounds", { best: formatValue(optimality.lowerBound / unit, metric, locale), limit: formatValue(optimality.upperBound / unit, metric, locale) })}
        {optimality.lowerBound > 0 && <span> · {tr("gapPercent", { n: percent(Math.max(0, optimality.upperBound - optimality.lowerBound) / optimality.lowerBound) })}</span>}</p>}
      {result && !result.coversAllOwnedCards && <p className="dr-note">{tr("partialBox")}</p>}
    </div>
    {rating ? <p className="dr-muted">{t(locale, "deckWorkspace.rewardMix.ratingNote")}</p> : <>
      {result && levels ? <div className="dr-objective">
        <strong>{t(locale, "deckWorkspace.rewardMix.formula")}</strong>
        <RewardOrder locale={locale} levels={levels} />
      </div> : result && !deterministic && <p className="dr-objective"><strong>{t(locale, `deckWorkspace.objective.${aggregation}`)}</strong>
        <span>{t(locale, `deckWorkspace.objective.${aggregation}Note`)}</span></p>}
      {levels && rate && <RateBasis {...props} rate={rate} levels={levels} proven={rateProven} />}
      {result && usesItems && <p className="dr-note">{t(locale, "deckWorkspace.conditions.eventItemsNote")}</p>}
      {result?.play && <p className="dr-note">{tr("playSummary", { notes: result.play.judged, misses: result.play.misses })}</p>}
      {result && result.teams.length > 0 ? <ol className="dr-teams">{result.teams.map((team, index) => <TeamCard key={index} {...props} team={team} metric={metric} aggregation={aggregation} levels={levels} deterministic={deterministic} first={index === 0} final={!running} />)}</ol>
        : <p className="dr-muted">{tr(running ? "searching" : "noTeam")}</p>}
    </>}
  </div>;
}

/** The formation slots of a team, with the levels and ranks of the Box's cards. */
function formationSlots(team: DeckTeam, box: CardBox | null, catalog: BoxCatalog) {
  const cardOf = (kind: "member" | "snap", id: number | null) => id === null ? null : box?.cards.find(card => card.kind === kind && card.identity.value === String(id)) ?? null;
  return team.layout.members.map((id, slot) => {
    const snapId = team.layout.snaps[slot] ?? null, member = cardOf("member", id), snap = cardOf("snap", snapId);
    return { member: catalog.members.find(card => card.id === id), support: snapId === null ? undefined : catalog.snaps.find(card => card.id === snapId),
      memberLevel: member?.fields.level.value ?? undefined, memberRank: member?.fields.rank.value ?? undefined,
      supportLevel: snap?.fields.level.value ?? undefined, supportRank: snap?.fields.rank.value ?? undefined };
  });
}

/** What a challenge point counted as in this run, and the challenge-live team that says so. */
function RateBasis(props: DeckResultProps & { rate: DeckRateBasis & { answer: NonNullable<DeckAnswer["result"]> }; levels: readonly RewardTerm[][]; proven: boolean }) {
  const { locale, rate } = props, first = props.levels[0]!;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.rewardMix.${key}`, values);
  const index = first.findIndex(term => term.kind === "challengePoints");
  if (index < 1) return null;
  const worth = termRate(first, index), unit = tr(`rewards.${first[0]!.kind}`);
  const number = (value: number, digits: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  return <section className="rm-basis" data-reward="challengePoints" aria-label={tr("basisLabel")}>
    <p className="rm-basis-rate"><strong>{tr("basis", { rate: number(worth, 4), unit })}</strong>
      <span>{tr("basisSource", { song: rate.song, difficulty: rate.difficulty.toUpperCase(), cost: rate.cost, value: number(worth * rate.cost, 2), unit })}</span></p>
    {!props.proven && <p className="dr-note" role="status">{tr("basisUnproven")}</p>}
    <details><summary>{tr("basisTeam")}</summary>
      <div className="dr-formation" data-compact="true"><div className="dc-stage"><NativeFormationGroup locale={locale} slots={formationSlots(rate.answer.teams[0]!, props.box, props.catalog)} label={tr("basisTeam")} /></div></div>
    </details>
  </section>;
}

/** The optimality label; its asterisk leads to the guide's definition, in a new tab so the result stays. */
function ProofLink({ locale, anchor, label }: { locale: AppLocale; anchor: "proven" | "unproven"; label: string }) {
  return <a className="dr-proof-link" href={`${localizePath(getRoutePathById("deck-guide"), locale)}#${anchor}`} target="_blank" rel="noopener"
    title={t(locale, "deckWorkspace.deckGuide.proofLink")}><strong>{label}</strong><sup aria-hidden="true">*</sup></a>;
}

/** How far the optimum may still lie above the best so far, in percent of the shown values. */
const percent = (gap: number) => (gap * 100).toFixed(gap < 0.01 ? 2 : 1);

function formatValue(value: number, goal: string, locale: AppLocale): string {
  const decimals = goal === "challengePoints" || goal === "eventPoints" || goal === "eventItems" || goal === "combined" ? 2 : 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(decimals ? value : Math.floor(value));
}

function TeamCard(props: DeckResultProps & { team: DeckTeam; metric: string; aggregation: DeckAggregation; levels: readonly RewardTerm[][] | null; deterministic: boolean; first: boolean; final: boolean }) {
  const { locale, team, metric, aggregation, box, catalog } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const cardOf = (kind: "member" | "snap", id: number | null) => id === null ? null : box?.cards.find(card => card.kind === kind && card.identity.value === String(id)) ?? null;
  const memberView = (id: number) => catalog.members.find(card => card.id === id);
  const value = team.value;
  const levels = props.levels, terms = levels?.[0] ?? null;
  // A level of several rewards is a total in the goal's reward; a level of one reward is that reward itself.
  const mixed = !!terms && terms.length > 1, shown = terms && !mixed ? terms[0]!.kind : metric;
  const payoff = metric !== "score" && metric !== "power";
  const total = value?.payoff?.score ?? null;
  const main = metric === "power" ? team.power : terms ? total === null ? null : total / terms[0]!.weight : payoff ? total : value?.score ?? null;
  const interval = payoff ? value?.payoff?.interval ?? null : metric === "power" ? null : value?.interval ?? null;
  const slots = formationSlots(team, box, catalog);
  const sequence = (order: number[]) => order.map(id => memberView(id)?.characterName ?? String(id)).join(" → ");
  const valueLabel = metric === "power" ? "valueLabel.power" : props.deterministic ? `deterministicLabel.${shown}`
    : aggregation === "maximum" ? `maximumLabel.${shown}` : shown === "score" ? "metricLabel.score" : `valueLabel.${shown}`;
  return <li className="dr-team" data-first={props.first}>
    <div className="dr-team-head">
      <span className="dr-rank">{team.rankCertified ? `#${team.rank}` : tr("candidateRank", { n: team.rank })}</span>
      <div className="dr-value"><small>{terms && mixed ? t(locale, `deckWorkspace.rewardMix.${props.deterministic ? "totalDeterministic" : "total"}`, { unit: t(locale, `deckWorkspace.rewardMix.rewards.${terms[0]!.kind}`) }) : tr(valueLabel)}</small>
        <strong>{main === null ? "—" : interval ? formatDeckInterval(interval, locale, payoff ? 2 : 0) : formatValue(main, shown, locale)}</strong></div>
      {metric !== "power" && <div className="dr-power"><small>{tr("power")}</small><span>{formatValue(team.power, "power", locale)}</span></div>}
    </div>
    {terms && mixed && team.levels && <RewardBreakdown locale={locale} terms={terms} values={team.levels[0]!.terms} />}
    {levels && levels.length > 1 && team.levels && <RewardTies locale={locale} levels={levels.slice(1)} values={team.levels.slice(1).map(level => level.value)} />}
    <div className="dr-formation" data-compact={!props.first}>
      <div className="dc-stage"><NativeFormationGroup locale={locale} slots={slots} label={tr("formation")} /></div>
    </div>
    <table className="dr-meta">
      <thead><tr><th scope="col">{tr("meta.slot")}</th><th scope="col">{tr("meta.member")}</th><th scope="col">{tr("meta.training")}</th><th scope="col">{tr("meta.snap")}</th></tr></thead>
      <tbody>{team.layout.members.map((id, slot) => <SlotRow key={slot} locale={locale} catalog={catalog} slot={slot} member={cardOf("member", id)} memberId={id}
        snap={cardOf("snap", team.layout.snaps[slot] ?? null)} snapId={team.layout.snaps[slot] ?? null} />)}</tbody>
    </table>
    <p className="dr-note">{tr("freeSeating")}</p>
    {aggregation === "maximum" && team.bestOrder && <section className="dr-orders" aria-label={tr("bestOrder")}>
      <h4>{tr("bestOrder")}</h4><p className="dr-note">{sequence(team.bestOrder.order)}</p></section>}
    {aggregation === "expected" && props.final && team.orders && <section className="dr-orders" aria-label={tr("orders", { n: team.orders.count })}>
      <h4>{tr("orders", { n: team.orders.count })}</h4>
      <dl>{(["min", "median", "max"] as const).map(key => <div key={key}><dt>{tr(`order.${key}`)}</dt>
        <dd><strong>{formatValue(team.orders![key].score, "battle", locale)}</strong><small>{sequence(team.orders![key].order)}</small></dd></div>)}</dl>
      <p className="dr-muted">{tr("ordersNote")}</p></section>}
  </li>;
}

/** One formation slot: the member card with its progress and the Snap paired with it. */
function SlotRow({ locale, catalog, slot, member, memberId, snap, snapId }: { locale: AppLocale; catalog: BoxCatalog; slot: number; member: BoxCard | null; memberId: number; snap: BoxCard | null; snapId: number | null }) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const view = catalog.members.find(card => card.id === memberId);
  const snapView = snapId === null ? undefined : catalog.snaps.find(card => card.id === snapId);
  const fact = (card: BoxCard, field: CardFieldName, key: string) => tr(`meta.${key}`, { n: card.fields[field].value ?? "?" });
  return <tr data-leader={slot === 2}>
    <th scope="row"><span className={slot === 2 ? "dc-leader" : ""}>{slot === 2 ? tr("leaderShort") : slot + 1}</span></th>
    <td><div className="dr-meta-card">{member && <BoxArtwork card={member} catalog={catalog} locale={locale} />}
      <div><strong>{view?.characterName ?? memberId}</strong>{view && <span>{view.title}</span>}
        {view && <small>{[member && cardRarityLabel(member, catalog), t(locale, `cards.attributes.${view.cardType}`), view.bandName].filter(Boolean).join(" · ")}</small>}</div></div></td>
    <td>{member ? <div className="dr-meta-facts">{([["level", "level"], ["awake", "awake"], ["rank", "rank"], ["liveSkillLevel", "skill"], ["gekisouSkillLevel", "gekisou"]] as const)
      .map(([field, key]) => <span key={field}>{fact(member, field, key)}</span>)}</div> : <span className="dr-muted">—</span>}</td>
    <td>{snapId === null ? <span className="dr-muted">{tr("meta.noSnap")}</span>
      : <div className="dr-meta-card">{snap && <BoxArtwork card={snap} catalog={catalog} locale={locale} />}
        <div><strong>{snapView?.name ?? snapId}</strong>{snapView && <span>{snapView.characters.map(character => character.name).join(" · ")}</span>}
          {snap && <small>{[cardRarityLabel(snap, catalog), fact(snap, "level", "level"), fact(snap, "rank", "rank")].filter(Boolean).join(" · ")}</small>}</div></div>}</td>
  </tr>;
}

function Issues(props: DeckResultProps & { answer: DeckAnswer }) {
  const { locale, answer, box, catalog, linked, busy } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const field = (name: CardFieldName) => t(locale, `deckWorkspace.${name}`);
  const groups: DeckIssueGroups = groupIssues(answer, box);
  const editable = groups.cards.filter((entry): entry is typeof entry & { card: BoxCard } => entry.card !== null);
  const skillFields = SKILL_FIELDS.filter(name => editable.some(entry => entry.fields.includes(name)));
  const details = [...answer.missing, ...answer.errors];
  const linkedIssue = linked && (groups.cards.length > 0 || groups.player.length > 0);
  const statusNote = linkedIssue && answer.status === "invalid" && answer.errors.some(issue => issue.code === "unknown_id" && issue.path.startsWith("_player."))
    ? "invalidDataLinked" : `${answer.status}${linkedIssue ? "Linked" : ""}`;
  return <div className="dr-result" data-state={answer.status}>
    <div className="dr-issues-head" role="status"><strong>{tr(`status.${answer.status}`)}</strong><p>{tr(`statusNote.${statusNote}`)}</p></div>
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
    {details.length > 0 && <details className="dr-issue-details"><summary>{tr("details")}</summary>
      <ul>{details.map((issue, index) => <li key={index}><code>{issue.path}</code> <code>{issue.code}</code> {issue.message}</li>)}</ul></details>}
  </div>;
}
