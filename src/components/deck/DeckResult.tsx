"use client";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import type { AppLocale } from "@/config/locales";
import { Icon } from "@/components/shared/icons";
import { haneokaUrl } from "@/config/site";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import type { BoxCard, CardBox, CardFieldName } from "@/lib/box/model";
import type { DeckAnswer, DeckIssueGroups, DeckOrderStat, DeckTeam } from "@/lib/deck/answer";
import { formatDeckInterval } from "@/lib/deck/interval";
import { groupIssues, isOutOfMemory } from "@/lib/deck/answer";
import type { DeckAggregation, DeckGoal } from "@/lib/deck/goals";
import type { DeckJobState } from "./use-deck-solver";
import { BoxArtwork, cardName, type BoxCatalog } from "@/components/box/BoxManager";
import CardStats from "@/components/box/CardStats";
import NativeFormationGroup from "@/components/chart-data/NativeFormationGroup";
import { MemberSquareArtwork, SupportSquareArtwork } from "@/components/shared/CardSquareArtwork";
import { termRate, type RewardTerm } from "@/lib/deck/reward-mix";
import { RewardBreakdown, RewardOrder, RewardTies } from "./DeckRewardMix";
import DeckShareImageButton from "./DeckShareImageButton";

/** The challenge live a run rated challenge points by. */
export interface DeckRateBasis { song: string; difficulty: string; cost: number }

export interface DeckResultProps {
  locale: AppLocale;
  songNames?: Readonly<Record<number, string>>;
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
/** The formation slot of the leader; the others may sit anywhere. */
const LEADER_SLOT = 2;

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
  const elapsed = result?.elapsedMs ?? null;
  const teams = result?.teams ?? [];
  return <div className="dr-result" data-state={running ? "running" : "done"} aria-busy={running}>
    {answer?.engine?.name === "Haneoka" && <small className="dr-muted">{tr("haneokaAttribution")} — <a href={haneokaUrl}>{haneokaUrl}</a></small>}
    {props.stale && !running && <div className="dr-stale" role="status"><strong>{tr("stale")}</strong><Button variant="text" size="small" onClick={props.onRerun}>{tr("rerun")}</Button></div>}
    <div className="dr-status" data-proof={running ? "running" : optimality?.proven && rateProven ? "proven" : "unproven"}>
      {running ? <>
        <div className="dr-phase"><CircularProgress size={18} thickness={5} /><strong>{rating ? t(locale, "deckWorkspace.rewardMix.rating") : tr(`phase.${result?.phase ?? "preprocess"}`)}</strong>
          <small>{tr("elapsed", { n: ((elapsed ?? 0) / 1000).toFixed(1) })}</small>
          {props.timeLimit !== null && <small className="dr-remaining">{tr("remaining", { n: Math.max(0, props.timeLimit - (elapsed ?? 0) / 1000).toFixed(0) })}</small>}
          <Button className="dr-stop" variant="text" size="small" onClick={props.onStop}>{tr("stop")}</Button></div>
        <LinearProgress
          className="dr-progress"
          variant={optimality?.fraction != null ? "determinate" : "indeterminate"}
          value={optimality?.fraction != null ? Math.min(100, Math.max(0, optimality.fraction * 100)) : undefined}
          aria-label={tr("progressLabel")}
        />
      </> : optimality?.proven && rateProven ? <div className="dr-proven"><Icon name="check" className="h-[18px] w-[18px] shrink-0" />
        <ProofLink locale={locale} anchor="proven" label={tr("proven")} />{elapsed !== null && <small>{tr("elapsed", { n: (elapsed / 1000).toFixed(1) })}</small>}</div>
        : <div className="dr-unproven"><Icon name="info" className="h-[18px] w-[18px] shrink-0" />
          <ProofLink locale={locale} anchor="unproven" label={tr(job.status === "done" && job.stopped ? "stoppedUnproven" : result?.exitReason === "timeLimit" ? "timedOutUnproven" : "unproven")} />
          {elapsed !== null && <small>{tr("elapsed", { n: (elapsed / 1000).toFixed(1) })}</small>}</div>}
      {!rating && optimality && !optimality.proven && optimality.upperBound !== null && optimality.lowerBound !== null && <p className="dr-bounds">
        {tr("bounds", { best: formatValue(optimality.lowerBound / unit, metric, locale), limit: formatValue(optimality.upperBound / unit, metric, locale) })}
        {optimality.lowerBound > 0 && <span> · {tr("gapPercent", { n: percent(Math.max(0, optimality.upperBound - optimality.lowerBound) / optimality.lowerBound) })}</span>}</p>}
      {result?.coverage && <small>{tr("songCoverage", { n: result.coverage.covered, total: result.coverage.total })}</small>}
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
      {teams.length > 0 ? <ol className="dr-teams">{teams.map((team, index) => <TeamCard key={index} {...props} team={team} best={teams[0]!} metric={metric} aggregation={aggregation} levels={levels} deterministic={deterministic} first={index === 0} final={!running} />)}</ol>
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
      <div className="dr-formation"><div className="dc-stage"><NativeFormationGroup locale={locale} slots={formationSlots(rate.answer.teams[0]!, props.box, props.catalog)} label={tr("basisTeam")} /></div></div>
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

function decimalsOf(goal: string): number {
  return goal === "challengePoints" || goal === "eventPoints" || goal === "eventItems" || goal === "combined" ? 2 : 0;
}
function formatValue(value: number, goal: string, locale: AppLocale): string {
  const decimals = decimalsOf(goal);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(decimals ? value : Math.floor(value));
}

/** The value a team is ranked by, as one number, with the label and interval the page shows for it. */
function teamValue(team: DeckTeam, metric: string, aggregation: DeckAggregation, levels: readonly RewardTerm[][] | null, deterministic: boolean) {
  const terms = levels?.[0] ?? null;
  // A level of several rewards is a total in the goal's reward; a level of one reward is that reward itself.
  const mixed = !!terms && terms.length > 1, shown = terms && !mixed ? terms[0]!.kind : metric;
  const payoff = metric !== "score" && metric !== "power";
  const total = team.value?.payoff?.score ?? null;
  const main = metric === "power" ? team.power : terms ? total === null ? null : total / terms[0]!.weight : payoff ? total : team.value?.score ?? null;
  const interval = payoff ? team.value?.payoff?.interval ?? null : metric === "power" ? null : team.value?.interval ?? null;
  const label = metric === "power" ? "valueLabel.power" : deterministic ? `deterministicLabel.${shown}`
    : aggregation === "maximum" ? `maximumLabel.${shown}` : shown === "score" ? "metricLabel.score" : `valueLabel.${shown}`;
  return { main, interval, payoff, shown, mixed, terms, label };
}

function TeamCard(props: DeckResultProps & { team: DeckTeam; best: DeckTeam; metric: string; aggregation: DeckAggregation; levels: readonly RewardTerm[][] | null; deterministic: boolean; first: boolean; final: boolean }) {
  const { locale, team, metric, aggregation, box, catalog } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const value = teamValue(team, metric, aggregation, props.levels, props.deterministic);
  const bestValue = props.first ? null : teamValue(props.best, metric, aggregation, props.levels, props.deterministic).main;
  const behind = bestValue !== null && value.main !== null ? bestValue - value.main : null;
  // Slots whose member card and Snap do not appear together in the first team.
  const pairs = (layout: DeckTeam["layout"]) => layout.members.map((id, slot) => `${id}:${layout.snaps[slot] ?? ""}`);
  const bestPairs = pairs(props.best.layout);
  const changed = props.first ? 0 : pairs(team.layout).filter(pair => !bestPairs.includes(pair)).length;
  const valueText = value.main === null ? "—" : value.interval ? formatDeckInterval(value.interval, locale, value.payoff ? 2 : 0) : formatValue(value.main, value.shown, locale);
  return <li className="dr-team" data-first={props.first}>
    <details open={props.first}>
      <summary className="dr-team-head">
        <span className="dr-rank">{team.rankCertified ? `#${team.rank}` : tr("candidateRank", { n: team.rank })}</span>
        <span className="dr-value">{team.song && (props.job.status === "running" ? props.job.progress : props.job.status === "done" ? props.job.answer : null)?.result?.coverage && <small>{props.songNames?.[team.song.musicId] ?? team.song.musicId} · {team.song.difficulty.toUpperCase()}</small>}<small>{value.terms && value.mixed ? t(locale, `deckWorkspace.rewardMix.${props.deterministic ? "totalDeterministic" : "total"}`, { unit: t(locale, `deckWorkspace.rewardMix.rewards.${value.terms[0]!.kind}`) }) : tr(value.label)}</small>
          <strong>{valueText}</strong></span>
        {behind !== null && behind > 0 && <span className="dr-behind" title={tr("behindFirst", { n: formatValue(behind, value.shown, locale) })}>−{formatValue(behind, value.shown, locale)}</span>}
        {metric !== "power" && <span className="dr-power"><small>{tr("power")}</small><span>{formatValue(team.power, "power", locale)}</span></span>}
        <TeamFaces team={team} best={props.first ? null : props.best} catalog={catalog} locale={locale} />
        {changed > 0 && <span className="dr-changed">{tr("changedCards", { n: changed })}</span>}
        <Icon name="chevronDown" className="dr-chevron h-5 w-5" />
      </summary>
      <div className="dr-team-body">
        <div className="flex justify-end">
          <DeckShareImageButton
            locale={locale}
            team={team}
            box={box}
            catalog={catalog}
            goalLabel={t(locale, `deckWorkspace.goals.${props.goal}`)}
            songSummary={
              team.song
                ? `${props.songNames?.[team.song.musicId] ?? `#${team.song.musicId}`} · ${team.song.difficulty.toUpperCase()}`
                : ""
            }
            proofBadge={
              props.final
                ? tr(
                    (props.job.status === "done" ? props.job.answer.result?.optimality.proven : false)
                      ? "proven"
                      : "unproven",
                  )
                : ""
            }
            metricLabel={
              value.terms && value.mixed
                ? t(locale, `deckWorkspace.rewardMix.${props.deterministic ? "totalDeterministic" : "total"}`, {
                    unit: t(locale, `deckWorkspace.rewardMix.rewards.${value.terms[0]!.kind}`),
                  })
                : tr(value.label)
            }
            metricValue={valueText}
            powerValue={metric !== "power" ? formatValue(team.power, "power", locale) : ""}
            {...(props.songNames ? { songNames: props.songNames } : {})}
          />
        </div>
        {value.terms && value.mixed && team.levels && <RewardBreakdown locale={locale} terms={value.terms} values={team.levels[0]!.terms} />}
        {props.levels && props.levels.length > 1 && team.levels && <RewardTies locale={locale} levels={props.levels.slice(1)} values={team.levels.slice(1).map(level => level.value)} />}
        <div className="dr-formation"><div className="dc-stage"><NativeFormationGroup locale={locale} slots={formationSlots(team, box, catalog)} label={tr("formation")} /></div></div>
        <Slots locale={locale} team={team} box={box} catalog={catalog} />
        {team.aggregate && <AggregateSongs {...props} team={team} />}
        <SkillOrders {...props} />
      </div>
    </details>
  </li>;
}

/** The five member cards in formation order as small icons: a team at a glance while its card is closed. */
function TeamFaces({ team, best, catalog, locale }: { team: DeckTeam; best: DeckTeam | null; catalog: BoxCatalog; locale: AppLocale }) {
  return <span className="dr-faces" aria-hidden="true">{team.layout.members.map((id, slot) => <CardFace key={slot} id={id} catalog={catalog} locale={locale}
    leader={slot === LEADER_SLOT} changed={!!best && !best.layout.members.includes(id)} />)}</span>;
}

/** A member card as its small square icon, titled with the card's name. */
function CardFace({ id, catalog, locale, leader = false, changed = false }: { id: number; catalog: BoxCatalog; locale: AppLocale; leader?: boolean; changed?: boolean }) {
  const view = catalog.members.find(card => card.id === id);
  return <span className="dr-face" aria-hidden="true" data-leader={leader || undefined} data-changed={changed || undefined} title={view?.title ?? String(id)}>
    {view ? <MemberSquareArtwork card={view} locale={locale} className="dr-face-art" native={false} /> : <span>{t(locale, "deckWorkspace.solver.unknownCard", { id })}</span>}
  </span>;
}

/**
 * Each slot's member card and Snap with their values, in formation order under the formation art. Every slot has the
 * same rows (art, name, values for the member, then for the Snap), so names of any length keep the values in line.
 */
function Slots({ locale, team, box, catalog }: { locale: AppLocale; team: DeckTeam; box: CardBox | null; catalog: BoxCatalog }) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const cardOf = (kind: "member" | "snap", id: number | null) => id === null ? null : box?.cards.find(card => card.kind === kind && card.identity.value === String(id)) ?? null;
  return <section className="dr-slots-section" aria-label={tr("formation")}>
    <ol className="dr-slots">{team.layout.members.map((id, slot) => {
      const member = cardOf("member", id), view = catalog.members.find(card => card.id === id);
      const snapId = team.layout.snaps[slot] ?? null, snap = cardOf("snap", snapId);
      const snapView = snapId === null ? undefined : catalog.snaps.find(card => card.id === snapId);
      return <li key={slot} data-leader={slot === LEADER_SLOT}>
        <div className="dr-slot-card">
          {view ? <MemberSquareArtwork card={view} locale={locale} className="dw-card-art" native={false} /> : <span className="dw-card-art dw-card-unknown">?</span>}
          <strong className="dr-slot-name" title={view?.title}><span className="dr-slot-tag">{slot === LEADER_SLOT ? tr("leaderShort") : slot + 1}</span>{view?.title ?? id}</strong>
          {member && <CardStats locale={locale} card={member} />}
        </div>
        {snapId === null ? <p className="dr-slot-card dr-slot-snap dr-slot-empty">{tr("meta.noSnap")}</p> : <div className="dr-slot-card dr-slot-snap">
          <div className="dr-slot-snap-head">
            {snapView ? <SupportSquareArtwork card={snapView} locale={locale} className="dw-card-art" native={false} /> : <span className="dw-card-art dw-card-unknown">?</span>}
            <small>{tr("meta.snap")}</small></div>
          <strong className="dr-slot-name" title={snapView?.title}>{snapView?.title ?? snapId}</strong>
          {snap && <CardStats locale={locale} card={snap} />}
        </div>}
      </li>;
    })}</ol>
    <p className="dr-note">{tr("freeSeating")}</p>
  </section>;
}

/** Per-song score breakdown of a shared Gekiso Arena formation across the selected song pool. */
function AggregateSongs(props: DeckResultProps & { team: DeckTeam }) {
  const { locale, team, songNames } = props;
  if (!team.aggregate || !team.aggregate.songs.length) return null;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  return <section className="dr-orders dr-aggregate" aria-label={tr("arenaPoolTitle")}>
    <div className="dr-orders-head"><h4>{tr("arenaPoolTitle")}</h4><span>{tr("arenaPoolCount", { n: team.aggregate.songs.length })}</span></div>
    <ul className="dr-aggregate-list">
      {team.aggregate.songs.map((entry, idx) => (
        <li key={`${entry.song.musicId}:${entry.song.difficulty}:${idx}`} className="dr-aggregate-row">
          <span className="dr-aggregate-song">
            <strong>{songNames?.[entry.song.musicId] ?? entry.song.musicId}</strong>
            <small>{entry.song.difficulty.toUpperCase()} · {tr("power")} {formatValue(entry.power, "power", locale)}</small>
          </span>
          <span className="dr-aggregate-score">
            <strong>{formatValue(entry.mean, "score", locale)}</strong>
            <small>{formatValue(entry.min, "score", locale)} – {formatValue(entry.max, "score", locale)}</small>
          </span>
        </li>
      ))}
    </ul>
  </section>;
}

/**
 * The skill activation order. Each live draws one of the 120 orders; an average objective shows where the team's orders
 * fall and which order scores best, worst and in the middle, and the maximum objective names the order it counts.
 */
function SkillOrders(props: DeckResultProps & { team: DeckTeam; aggregation: DeckAggregation; final: boolean }) {
  const { locale, team, catalog } = props;
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  if (props.aggregation === "maximum") return team.bestOrder ? <section className="dr-orders" aria-label={tr("bestOrder")}>
    <h4>{tr("bestOrder")}</h4>
    <OrderSequence locale={locale} order={team.bestOrder.order} catalog={catalog} />
    <p className="dr-muted">{tr("bestOrderNote")}</p>
  </section> : null;
  const orders = team.orders;
  if (!props.final || !orders) return null;
  const mean = team.value?.score ?? null;
  const rows: { key: "max" | "median" | "min"; stat: DeckOrderStat }[] = [{ key: "max", stat: orders.max }, { key: "median", stat: orders.median }, { key: "min", stat: orders.min }];
  return <section className="dr-orders" aria-label={tr("orderTitle")}>
    <div className="dr-orders-head"><h4>{tr("orderTitle")}</h4><span>{tr("orders", { n: orders.count })}</span></div>
    <OrderRange locale={locale} min={orders.min.score} median={orders.median.score} max={orders.max.score} mean={mean} />
    <dl className="dr-order-list">{rows.map(({ key, stat }) => <div key={key} data-order={key}>
      <dt>{tr(`orderRow.${key}`)}</dt>
      <dd>{stat.order.length ? <OrderSequence locale={locale} order={stat.order} catalog={catalog} /> : <span>—</span>}<strong>{formatValue(stat.score, "score", locale)}</strong></dd>
    </div>)}</dl>
    <p className="dr-muted">{tr("ordersNote")}</p>
  </section>;
}

/** Where the lowest, median and highest order scores and their average lie on one scale. */
function OrderRange({ locale, min, median, max, mean }: { locale: AppLocale; min: number; median: number; max: number; mean: number | null }) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.solver.${key}`, values);
  const span = max - min;
  const at = (value: number) => `${span > 0 ? Math.min(100, Math.max(0, (value - min) / span * 100)) : 50}%`;
  return <div className="dr-range">
    <div className="dr-range-track" aria-hidden="true">
      <span className="dr-range-median" style={{ left: at(median) }} />
      {mean !== null && <span className="dr-range-mean" style={{ left: at(mean) }} />}
    </div>
    <dl className="dr-range-labels">
      <div><dt>{tr("order.min")}</dt><dd>{formatValue(min, "score", locale)}</dd></div>
      {mean !== null && <div data-mean="true"><dt>{tr("orderAverage")}</dt><dd>{formatValue(mean, "score", locale)}</dd></div>}
      <div><dt>{tr("order.max")}</dt><dd>{formatValue(max, "score", locale)}</dd></div>
    </dl>
  </div>;
}

/** An order of skill activations as numbered card icons with the cards' names; the text form is its accessible name. */
function OrderSequence({ locale, order, catalog }: { locale: AppLocale; order: readonly number[]; catalog: BoxCatalog }) {
  const name = (id: number) => catalog.members.find(card => card.id === id)?.title ?? String(id);
  return <ol className="dr-sequence" aria-label={order.map(name).join(" → ")}>{order.map((id, index) => <li key={index}>
    <span className="dr-step" aria-hidden="true">{index + 1}</span><CardFace id={id} catalog={catalog} locale={locale} /><span className="dr-step-name" aria-hidden="true">{name(id)}</span>
  </li>)}</ol>;
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
      {[1, 5].map(value => <Button variant="outlined" size="small" key={value} disabled={busy} onClick={() => props.onAnswerAll(editable.filter(entry => entry.fields.includes(name)).map(entry => entry.card.key), name, value)}>
        {t(locale, value === 1 ? "deckWorkspace.allLv1" : "deckWorkspace.allLv5")}</Button>)}</div></div>)}
    {groups.cards.length > 0 && <ul className="dr-issue-cards">{groups.cards.map(entry => <li key={`${entry.cardKind}:${entry.masterId}`}>
      {entry.card ? <BoxArtwork card={entry.card} catalog={catalog} locale={locale} square /> : <span className="dw-card-art dw-card-unknown">?</span>}
      <div><strong>{entry.card ? cardName(entry.card, catalog) : tr("unknownCard", { id: entry.masterId })}</strong>
        <small>{entry.fields.length ? entry.fields.map(field).join(" · ") : entry.issues[0]?.code}</small></div>
      {entry.card && !linked && <Button variant="tonal" size="small" disabled={busy} onClick={() => props.onEditCard(entry.card!.key)}>{tr("fill")}</Button>}
    </li>)}</ul>}
    {(groups.vip.length > 0 || groups.player.length > 0) && <div className="dr-issue-player">
      <p>{[...(groups.vip.length ? [tr("vipMissing")] : []), ...groups.player.map(entry => tr(`playerArea.${entry.area}`))].join(" · ")}</p>
      <Button variant="tonal" size="small" disabled={busy} onClick={props.onPlayer}>{tr("openPlayer")}</Button></div>}
    {details.length > 0 && <details className="dr-issue-details"><summary>{tr("details")}</summary>
      <ul>{details.map((issue, index) => <li key={index}><code>{issue.path}</code> <code>{issue.code}</code> {issue.message}</li>)}</ul></details>}
  </div>;
}
