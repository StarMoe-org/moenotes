import { Fragment, useId } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { CHALLENGE_POINT_PRIORITIES, RECOMMENDATION_COUNT, computes, effectiveAggregation, isEventPayoffGoal, mixTerms, mixableRewards, playsGekisou,
  type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { EVENT_REWARDS, RATE_DECIMALS, rewardShares, termRate, type EventReward, type RewardRate, type RewardTerm } from "@/lib/deck/reward-mix";
import "@/styles/deck-reward-mix.css";

const MARKS: Readonly<Record<EventReward, string>> = {
  eventPoints: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  challengePoints: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m-3-5h6",
  eventItems: "M4 8h16v12H4zM2 4h20v4H2zM12 4v16",
};
const MODES = ["single", "weighted", "tieBreak"] as const;
type Mode = typeof MODES[number];

const rewardText = (locale: AppLocale, key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.rewardMix.${key}`, values);
const formatRate = (locale: AppLocale, rate: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: RATE_DECIMALS }).format(rate);

export function RewardMark({ kind }: { kind: EventReward }) {
  return <span className="rm-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={MARKS[kind]} /></svg></span>;
}

/** The rewards a total adds up, the goal's own first: `PT + 17.5 × CP`. */
export function RewardFormula({ locale, terms }: { locale: AppLocale; terms: readonly RewardTerm[] }) {
  return <>{terms.map((term, index) => <Fragment key={term.kind}>
    {index > 0 && <span className="rm-op" aria-hidden="true">+</span>}
    <span className="rm-chip" data-reward={term.kind}>{index > 0 && <><b>{formatRate(locale, termRate(terms, index))}</b><span aria-hidden="true">×</span></>}{rewardText(locale, `rewards.${term.kind}`)}</span>
  </Fragment>)}</>;
}

/**
 * How an event payoff goal counts the rewards beside its own: not at all, added up at the player's rates, or (for
 * challenge points) only to break ties.
 */
export default function DeckRewardMix({ locale, input, capabilities, onChange }: {
  locale: AppLocale; input: DeckGoalInput; capabilities: DeckSolverCapabilities | null;
  onChange: (patch: Partial<DeckGoalInput>) => void;
}) {
  const id = useId();
  if (!isEventPayoffGoal(input.goal)) return null;
  const tr = (key: string, values?: Record<string, string | number>) => rewardText(locale, key, values);
  const conditions = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.conditions.${key}`, values);
  const base = input.goal as EventReward;
  const short = (kind: EventReward) => tr(`rewards.${kind}`), one = (kind: EventReward) => tr(`units.${kind}`);
  const mode: Mode = input.rewardMix ? "weighted" : base === "challengePoints" && input.secondaryPriority !== null ? "tieBreak" : "single";
  const modes = MODES.filter(value => value !== "tieBreak" || base === "challengePoints");
  const combined = !!capabilities?.combinedMetric;
  const expected = effectiveAggregation(input) === "expected";
  const choose = (next: Mode) => onChange(next === "weighted" ? { rewardMix: true, secondaryPriority: null }
    : { rewardMix: false, secondaryPriority: next === "tieBreak" ? input.secondaryPriority ?? "eventPointsFirst" : null });
  const setRate = (kind: EventReward, patch: Partial<RewardRate>) => onChange({ rewardRates: { ...input.rewardRates, [kind]: { ...input.rewardRates[kind], ...patch } } });
  const available = mixableRewards(input);
  const terms = mixTerms(input);
  const weightedIssue = !expected ? "expectedOnly" : !capabilities ? "loading" : !combined || terms && !computes(capabilities, input) ? "unavailable" : null;
  return <fieldset className="rm-mix" data-mode={mode}>
    <legend>{tr("label")}</legend>
    <div className="rm-modes" style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}>
      {modes.map(value => <label key={value}>
        <input type="radio" name={id} value={value} checked={mode === value} disabled={value === "weighted" && !combined} onChange={() => choose(value)} />
        <span>{tr(`modes.${value}`, { reward: short(base) })}{value === "weighted" && !!capabilities && !combined && <small>{tr("unsupported")}</small>}</span>
      </label>)}
    </div>
    {mode === "single" && <p className="dw-muted">{tr("singleNote", { reward: short(base) })}</p>}
    {mode === "weighted" && <>
      <ul className="rm-rows">
        <li className="rm-row" data-reward={base} data-base="true">
          <span className="rm-pick"><RewardMark kind={base} /><span className="rm-name"><strong>{short(base)}</strong><small>{tr(`names.${base}`)}</small></span></span>
          <span className="rm-base-tag">{tr("base")}</span>
        </li>
        {EVENT_REWARDS.filter(kind => kind !== base).map(kind => {
          const offered = available.includes(kind), state = input.rewardRates[kind], counted = offered && state.counted;
          const invalid = counted && !(typeof state.rate === "number" && state.rate > 0);
          return <li className="rm-row" key={kind} data-reward={kind} data-counted={counted} data-offered={offered}>
            <label className="rm-pick">
              <input type="checkbox" checked={counted} disabled={!offered} aria-label={tr("count", { reward: tr(`names.${kind}`) })} onChange={change => setRate(kind, { counted: change.target.checked })} />
              <RewardMark kind={kind} /><span className="rm-name"><strong>{short(kind)}</strong><small>{tr(`names.${kind}`)}</small></span>
            </label>
            {offered ? <label className="rm-rate"><span>{tr("rate", { reward: one(kind) })}</span>
              <input type="number" inputMode="decimal" min={0} step="any" disabled={!counted} value={state.rate ?? ""} placeholder={tr("ratePlaceholder")}
                aria-label={tr("rateInput", { reward: one(kind), base: short(base) })} aria-invalid={invalid}
                onChange={change => setRate(kind, { rate: change.target.value === "" ? null : Number(change.target.value) })} />
              <span>{short(base)}</span></label>
              : <small className="rm-spent">{tr("spent")}</small>}
          </li>;
        })}
      </ul>
      <p className="rm-formula" data-empty={!terms} role="status">
        <span className="rm-formula-label">{tr("formula")}</span>
        {terms ? <RewardFormula locale={locale} terms={terms} /> : <span>{tr("formulaEmpty")}</span>}
      </p>
      <p className="dw-muted">{tr("weightedNote")}</p>
      {weightedIssue && <p className="dw-muted" role="status">{tr(weightedIssue)}</p>}
      {playsGekisou(input) && <p className="dw-muted">{tr("luckNote")}</p>}
    </>}
    {mode === "tieBreak" && <>
      <div className="rm-priorities" role="radiogroup" aria-label={conditions("secondaryPriority")}>
        {CHALLENGE_POINT_PRIORITIES.map(priority => <label key={priority}>
          <input type="radio" name={`${id}-priority`} value={priority} checked={input.secondaryPriority === priority} onChange={() => onChange({ secondaryPriority: priority })} />
          <span>{conditions(`priorities.${priority}`)}</span>
        </label>)}
      </div>
      <p className="dw-muted">{conditions("priorityNote")}</p>
      <p className="dw-muted">{conditions("priorityTeams", { n: RECOMMENDATION_COUNT })}</p>
      {(!expected || !capabilities || !computes(capabilities, input)) && <p className="dw-muted" role="status">{conditions(expected ? "priorityUnsupported" : "priorityExpectedOnly")}</p>}
    </>}
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
