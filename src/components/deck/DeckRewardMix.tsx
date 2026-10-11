import { Fragment, useId } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { CHALLENGE_POINT_COSTS, computes, effectiveAggregation, isEventPayoffGoal, mixableRewards, playsGekisou, rewardLayoutOf,
  type ChallengePointCost, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { EVENT_REWARDS, RATE_DECIMALS, REWARD_ROLES, rewardShares, statedTerms, termRate, withFirstTieBreak, withMainReward, withRewardRate, withRewardRole,
  type EventReward, type RewardRole, type RewardTerm } from "@/lib/deck/reward-mix";
import "@/styles/deck-reward-mix.css";

const MARKS: Readonly<Record<EventReward, string>> = {
  eventPoints: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  challengePoints: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m-3-5h6",
  eventItems: "M4 8h16v12H4zM2 4h20v4H2zM12 4v16",
};

const rewardText = (locale: AppLocale, key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.rewardMix.${key}`, values);
const formatRate = (locale: AppLocale, rate: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: RATE_DECIMALS }).format(rate);

export function RewardMark({ kind }: { kind: EventReward }) {
  return <span className="rm-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={MARKS[kind]} /></svg></span>;
}

/** The rewards a level adds up, its first reward worth 1: `PT + 17.5 × CP`. A null weight is a rate the run works out. */
function RewardSum({ locale, terms }: { locale: AppLocale; terms: readonly { kind: EventReward; rate: number | null }[] }) {
  return <>{terms.map((term, index) => <Fragment key={term.kind}>
    {index > 0 && <span className="rm-op" aria-hidden="true">+</span>}
    <span className="rm-chip" data-reward={term.kind}>{rewardText(locale, `rewards.${term.kind}`)}{index > 0 && <><span aria-hidden="true">×</span>
      <b>{term.rate === null ? rewardText(locale, "autoRate") : formatRate(locale, term.rate)}</b></>}</span>
  </Fragment>)}</>;
}

/** What teams are ranked by: the first level's sum, then each tie-break reward in turn. */
export function RewardOrder({ locale, levels }: { locale: AppLocale; levels: readonly (readonly RewardTerm[])[] }) {
  const first = levels[0]!;
  return <span className="rm-summary">
    <RewardSum locale={locale} terms={first.map((term, index) => ({ kind: term.kind, rate: termRate(first, index) }))} />
    {levels.slice(1).map(level => <Fragment key={level[0]!.kind}>
      <span className="rm-then">{rewardText(locale, "then")}</span>
      <span className="rm-chip" data-reward={level[0]!.kind}>{rewardText(locale, `rewards.${level[0]!.kind}`)}</span>
    </Fragment>)}
  </span>;
}

/** A challenge song that can rate challenge points. */
export interface RewardChallengeSong { id: number; title: string; jacketUrl: string | null; difficulties: readonly MusicDifficulty[] }

/**
 * What an event reward goal ranks teams by. One reward of the live is the goal; each other reward is left out, added
 * to the goal's reward at a rate, or compared only between teams that are otherwise equal. The worth of a challenge
 * point comes from the best challenge-live team unless the player states it.
 */
export default function DeckRewardMix({ locale, input, capabilities, challengeSongs, onChange }: {
  locale: AppLocale; input: DeckGoalInput; capabilities: DeckSolverCapabilities | null; challengeSongs: readonly RewardChallengeSong[];
  onChange: (patch: Partial<DeckGoalInput>) => void;
}) {
  const id = useId();
  if (!isEventPayoffGoal(input.goal)) return null;
  const tr = (key: string, values?: Record<string, string | number>) => rewardText(locale, key, values);
  const base = input.goal as EventReward, plan = input.rewards;
  const short = (kind: EventReward) => tr(`rewards.${kind}`), one = (kind: EventReward) => tr(`units.${kind}`);
  const offered = mixableRewards(input), layout = rewardLayoutOf(input);
  const combined = !!capabilities?.combinedMetric;
  const expected = effectiveAggregation(input) === "expected";
  const stated = layout && statedTerms(layout, plan);
  const issue = !layout ? null : !expected ? "expectedOnly" : !capabilities ? null : !combined || !computes(capabilities, input) ? "unavailable" : null;
  const rateSong = challengeSongs.find(song => song.id === input.challengeMusicId) ?? null;
  const setRole = (kind: EventReward, role: RewardRole) => onChange({ rewards: withRewardRole(plan, kind, role),
    // A plan that reads the worth of a challenge point starts on the event's first challenge song.
    ...(kind === "challengePoints" && role === "convert" && base !== "challengePoints" && plan.rates.challengePoints.auto && !rateSong && challengeSongs[0]
      ? { challengeMusicId: challengeSongs[0].id } : {}) });
  const setAuto = (auto: boolean) => onChange({ rewards: withRewardRate(plan, "challengePoints", { auto }), ...(auto && !rateSong && challengeSongs[0] ? { challengeMusicId: challengeSongs[0].id } : {}) });
  const spends = ["challengeLive", "challengeSkip"].includes(input.venue);
  const sum = layout && [{ kind: base, rate: 1 as number | null }, ...layout.converted.map(kind => ({ kind,
    rate: layout.auto && kind === "challengePoints" ? null : stated ? termRate(stated, stated.findIndex(term => term.kind === kind)) : NaN }))];
  return <fieldset className="rm-mix">
    <legend>{tr("label")}</legend>
    <p className="rm-part" id={`${id}-main`}>{tr("base")}</p>
    <div className="rm-main" role="radiogroup" aria-labelledby={`${id}-main`}>
      {EVENT_REWARDS.map(kind => {
        // A challenge live spends challenge points, so they cannot be its goal.
        const spent = kind === "challengePoints" && spends;
        return <label key={kind} data-reward={kind} title={spent ? tr("spent") : undefined}>
          <input type="radio" name={`${id}-main`} value={kind} checked={base === kind}
            disabled={kind !== base && (spent || !!capabilities && !computes(capabilities, { goal: kind, venue: input.venue }))}
            onChange={() => onChange({ goal: kind, rewards: withMainReward(plan, kind) })} />
          <span><RewardMark kind={kind} /><span className="rm-name"><strong>{short(kind)}</strong><small>{tr(`names.${kind}`)}</small></span></span>
        </label>;
      })}
    </div>
    <p className="rm-main-note">{t(locale, `deckWorkspace.goalNotes.${base}`)}</p>
    <p className="rm-part">{tr("others")}</p>
    <ul className="rm-rows">
      {EVENT_REWARDS.filter(kind => kind !== base).map(kind => {
        const available = offered.includes(kind), role: RewardRole = available ? plan.roles[kind] : "off", rate = plan.rates[kind];
        const auto = role === "convert" && kind === "challengePoints" && base !== "challengePoints" && rate.auto;
        const invalid = role === "convert" && !auto && !(typeof rate.rate === "number" && rate.rate > 0);
        const place = layout ? layout.ties.indexOf(kind) : -1;
        return <li className="rm-row" key={kind} data-reward={kind} data-role={role} data-offered={available}>
          <div className="rm-head">
            <span className="rm-pick"><RewardMark kind={kind} /><span className="rm-name"><strong>{short(kind)}</strong><small>{tr(`names.${kind}`)}</small></span></span>
            {available ? <div className="rm-roles" role="radiogroup" aria-label={tr("roleLabel", { reward: tr(`names.${kind}`) })}>
              {REWARD_ROLES.map(value => <label key={value}>
                <input type="radio" name={`${id}-${kind}`} value={value} checked={role === value} disabled={value !== "off" && !!capabilities && !combined} onChange={() => setRole(kind, value)} />
                <span>{tr(`roles.${value}`)}</span>
              </label>)}
            </div> : <small className="rm-spent">{tr("spent")}</small>}
          </div>
          {role === "convert" && <div className="rm-detail">
            {kind === "challengePoints" && base !== "challengePoints" && <div className="rm-sources" role="radiogroup" aria-label={tr("sourceLabel")}>
              {([true, false] as const).map(value => <label key={String(value)}>
                <input type="radio" name={`${id}-source`} checked={rate.auto === value} onChange={() => setAuto(value)} />
                <span>{tr(value ? "sources.auto" : "sources.manual")}</span>
              </label>)}
            </div>}
            {auto ? <>
              <p className="rm-detail-note">{tr("autoNote", { base: short(base) })}</p>
              {challengeSongs.length ? <div className="dc-challenge-songs" role="group" aria-label={tr("rateSong")}>
                {challengeSongs.map(song => <button type="button" key={song.id} className="dc-song-button" aria-pressed={input.challengeMusicId === song.id}
                  onClick={() => onChange({ challengeMusicId: song.id, ...(song.difficulties.length && !song.difficulties.includes(input.rateDifficulty) ? { rateDifficulty: song.difficulties.at(-1)! } : {}) })}>
                  {song.jacketUrl ? <img className="dc-song-cover" src={song.jacketUrl} alt="" /> : <span className="dc-song-cover" aria-hidden="true" />}
                  <span className="dc-song-summary"><strong>{song.title}</strong></span></button>)}
              </div> : <p className="rm-detail-note" role="status">{tr("noChallengeSongs")}</p>}
              <div className="dc-field-pair">
                <label>{tr("rateDifficulty")}<select value={input.rateDifficulty} onChange={change => onChange({ rateDifficulty: change.target.value as MusicDifficulty })}>
                  {MUSIC_DIFFICULTIES.filter(value => !rateSong?.difficulties.length || rateSong.difficulties.includes(value)).map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
                <label>{tr("rateCost")}<select value={input.challengePoints} onChange={change => onChange({ challengePoints: Number(change.target.value) as ChallengePointCost })}>
                  {CHALLENGE_POINT_COSTS.map(value => <option key={value} value={value}>{t(locale, "deckWorkspace.challengePoints", { n: value })}</option>)}</select></label>
              </div>
            </> : <label className="rm-rate"><span>{tr("rate", { reward: one(kind) })}</span>
              <input type="number" inputMode="decimal" min={0} step="any" value={rate.rate ?? ""} placeholder={tr("ratePlaceholder")}
                aria-label={tr("rateInput", { reward: one(kind), base: short(base) })} aria-invalid={invalid}
                onChange={change => onChange({ rewards: withRewardRate(plan, kind, { rate: change.target.value === "" ? null : Number(change.target.value) }) })} />
              <span>{short(base)}</span></label>}
          </div>}
          {role === "tieBreak" && <div className="rm-detail rm-tie">
            <span>{tr(place === 0 ? "tieFirstNote" : "tieNextNote", { reward: short(kind), before: place > 0 ? short(layout!.ties[place - 1]!) : "" })}</span>
            {place > 0 && <button type="button" onClick={() => onChange({ rewards: withFirstTieBreak(plan, kind) })}>{tr("tieFirst")}</button>}
          </div>}
        </li>;
      })}
    </ul>
    <p className="rm-formula" role="status">
      <span className="rm-formula-label">{tr("formula")}</span>
      {sum && layout ? <span className="rm-summary"><RewardSum locale={locale} terms={sum.filter(term => term.rate === null || Number.isFinite(term.rate))} />
        {layout.ties.map(kind => <Fragment key={kind}><span className="rm-then">{tr("then")}</span><span className="rm-chip" data-reward={kind}>{short(kind)}</span></Fragment>)}</span>
        : <span className="rm-chip" data-reward={base}>{short(base)}</span>}
    </p>
    {layout && !stated && <p className="rm-issue" role="status">{tr("rateMissing")}</p>}
    {issue && <p className="rm-issue" role="status">{tr(issue)}</p>}
    {!!capabilities && !combined && <p className="dw-muted" role="status">{tr("unsupported")}</p>}
    {layout && playsGekisou(input) && <p className="dw-muted">{tr("luckNote")}</p>}
  </fieldset>;
}

/** One team's total split into its rewards: a proportional bar, then each reward's own expectation and what it counts as. */
export function RewardBreakdown({ locale, terms, values }: { locale: AppLocale; terms: readonly RewardTerm[]; values: readonly number[] }) {
  const tr = (key: string, replacements?: Record<string, string | number>) => rewardText(locale, key, replacements);
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const shares = rewardShares(terms, values);
  const percent = (share: number) => tr("share", { n: (share * 100).toFixed(share > 0 && share < 0.1 ? 1 : 0) });
  const name = (kind: EventReward) => tr(`rewards.${kind}`);
  return <section className="rm-breakdown" aria-label={tr("breakdown")}>
    <h4>{tr("breakdown")}</h4>
    <div className="rm-bar" role="img" aria-label={shares.map(share => `${name(share.kind)} ${percent(share.share)}`).join(", ")}>
      {shares.map(share => <span key={share.kind} data-reward={share.kind} style={{ flexGrow: share.share }} />)}
    </div>
    <dl className="rm-legend">{shares.map((share, index) => <div key={share.kind} data-reward={share.kind}>
      <dt><i className="rm-dot" aria-hidden="true" />{name(share.kind)}<span>{percent(share.share)}</span></dt>
      <dd><strong>{number(share.value)}</strong>
        {index > 0 && <small>{tr("counted", { rate: formatRate(locale, share.rate), value: number(share.counted), unit: name(terms[0]!.kind) })}</small>}</dd>
    </div>)}</dl>
  </section>;
}

/** A team's tie-break rewards in the order they are compared. */
export function RewardTies({ locale, levels, values }: { locale: AppLocale; levels: readonly (readonly RewardTerm[])[]; values: readonly number[] }) {
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  return <section className="rm-ties" aria-label={rewardText(locale, "ties")}>
    <h4>{rewardText(locale, "ties")}</h4>
    <ol>{levels.map((level, index) => <li key={level[0]!.kind} data-reward={level[0]!.kind}>
      <i className="rm-dot" aria-hidden="true" /><span>{rewardText(locale, `rewards.${level[0]!.kind}`)}</span><strong>{number(values[index] ?? 0)}</strong>
    </li>)}</ol>
  </section>;
}
