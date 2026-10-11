import type { DeckFraction } from "./interval";

/** The rewards one event live settles together. */
export const EVENT_REWARDS = ["eventPoints", "challengePoints", "eventItems"] as const;
export type EventReward = typeof EVENT_REWARDS[number];
export const isEventReward = (value: unknown): value is EventReward => (EVENT_REWARDS as readonly unknown[]).includes(value);

/**
 * How a reward beside the goal's own takes part in the ranking: not at all, added to the goal's reward at a rate, or
 * compared only between teams the rewards before it leave equal.
 */
export const REWARD_ROLES = ["off", "convert", "tieBreak"] as const;
export type RewardRole = typeof REWARD_ROLES[number];
/**
 * What one unit of a converted reward is worth in the goal's reward. `auto` reads the worth of a challenge point from
 * the best challenge-live team; otherwise `rate` states it.
 */
export interface RewardRate { auto: boolean; rate: number | null }
export interface RewardPlan {
  roles: Readonly<Record<EventReward, RewardRole>>;
  rates: Readonly<Record<EventReward, RewardRate>>;
  /** The tie-break rewards, the one compared first at the front. */
  tieOrder: readonly EventReward[];
}
export const defaultRewardPlan = (): RewardPlan => ({
  roles: { eventPoints: "off", challengePoints: "off", eventItems: "off" },
  rates: { eventPoints: { auto: false, rate: null }, challengePoints: { auto: true, rate: null }, eventItems: { auto: false, rate: null } },
  tieOrder: [],
});
export function withRewardRole(plan: RewardPlan, kind: EventReward, role: RewardRole): RewardPlan {
  const tieOrder = plan.tieOrder.filter(value => value !== kind);
  return { ...plan, roles: { ...plan.roles, [kind]: role }, tieOrder: role === "tieBreak" ? [...tieOrder, kind] : tieOrder };
}
export const withRewardRate = (plan: RewardPlan, kind: EventReward, patch: Partial<RewardRate>): RewardPlan =>
  ({ ...plan, rates: { ...plan.rates, [kind]: { ...plan.rates[kind], ...patch } } });
/** Compare `kind` before the other tie-break rewards. */
export const withFirstTieBreak = (plan: RewardPlan, kind: EventReward): RewardPlan =>
  plan.tieOrder.includes(kind) ? { ...plan, tieOrder: [kind, ...plan.tieOrder.filter(value => value !== kind)] } : plan;

/** The plan once `main` is the goal's own reward: roles and tie-break order stay, and rates start over in the new unit. */
export const withMainReward = (plan: RewardPlan, main: EventReward): RewardPlan =>
  ({ ...withRewardRole(plan, main, "off"), rates: defaultRewardPlan().rates });

/** The largest weight of a term the solver takes. */
export const MAX_TERM_WEIGHT = 1_000_000_000;
/** Decimals a stated rate keeps. */
export const RATE_DECIMALS = 4;

/** One weighted reward of a level. */
export interface RewardTerm { kind: EventReward; weight: number }
/** A plan read for one goal on one venue. */
export interface RewardLayout {
  base: EventReward;
  /** The rewards added to the goal's own, in the order of `EVENT_REWARDS`. */
  converted: readonly EventReward[];
  /** The tie-break rewards in their order. */
  ties: readonly EventReward[];
  /** Challenge points are converted at the worth the best challenge-live team gives them. */
  auto: boolean;
}
/** The plan of a goal whose reward is `base`, over the rewards its venue offers; null while every one of them is off. */
export function rewardLayout(base: EventReward, plan: RewardPlan, offered: readonly EventReward[]): RewardLayout | null {
  const others = offered.filter(kind => kind !== base);
  const converted = others.filter(kind => plan.roles[kind] === "convert");
  const ties = plan.tieOrder.filter(kind => others.includes(kind) && plan.roles[kind] === "tieBreak");
  if (!converted.length && !ties.length) return null;
  return { base, converted, ties, auto: base !== "challengePoints" && converted.includes("challengePoints") && plan.rates.challengePoints.auto };
}

const gcd = (a: bigint, b: bigint): bigint => b === 0n ? a : gcd(b, a % b);
/** The smallest integers with the ratios of `weights`; ratios keep nine digits where a weight would pass the solver's limit. */
function fit(weights: readonly bigint[]): number[] {
  const divisor = weights.reduce(gcd), reduced = weights.map(weight => weight / divisor);
  const largest = reduced.reduce((a, b) => a > b ? a : b), limit = BigInt(MAX_TERM_WEIGHT);
  if (largest <= limit) return reduced.map(Number);
  return reduced.map(weight => Math.max(1, Number((weight * limit * 2n + largest) / (largest * 2n))));
}

/**
 * The goal's reward and the rewards converted at a stated rate, with integer weights whose ratios are the rates. A
 * rate keeps up to four decimals, fewer while a weight would pass the solver's limit. Null while a stated rate is
 * missing or not positive.
 */
export function statedTerms(layout: RewardLayout, plan: RewardPlan): RewardTerm[] | null {
  const kinds = layout.converted.filter(kind => !(layout.auto && kind === "challengePoints"));
  const rates = kinds.map(kind => plan.rates[kind].rate);
  if (!rates.every((rate): rate is number => typeof rate === "number" && Number.isFinite(rate) && rate > 0)) return null;
  for (let decimals = RATE_DECIMALS; decimals >= 0; decimals--) {
    const scale = 10 ** decimals, weights = rates.map(rate => Math.round(rate * scale));
    if (weights.some(weight => weight < 1)) return null;
    if (weights.some(weight => weight > MAX_TERM_WEIGHT)) continue;
    const reduced = fit([scale, ...weights].map(BigInt));
    return [{ kind: layout.base, weight: reduced[0]! }, ...kinds.map((kind, index) => ({ kind, weight: reduced[index + 1]! }))];
  }
  return null;
}

/**
 * What the challenge points of one challenge live are worth: the best challenge-live team's exact value of the
 * stated terms, for `cost` challenge points spent.
 */
export interface ChallengeWorth { value: DeckFraction; cost: number }

/**
 * The levels the solver ranks by. The first level adds the goal's reward and the converted ones; with `auto`, a
 * challenge point counts `worth.value / worth.cost` of the stated terms. Each tie-break reward is a level of its own.
 * Null while a stated rate is missing, or `auto` has no worth yet.
 */
export function rewardLevels(layout: RewardLayout, plan: RewardPlan, worth: ChallengeWorth | null): RewardTerm[][] | null {
  const stated = statedTerms(layout, plan);
  if (!stated) return null;
  let first = stated;
  if (layout.auto) {
    if (!worth || !Number.isSafeInteger(worth.cost) || worth.cost < 1) return null;
    const numerator = BigInt(worth.value.numerator), denominator = BigInt(worth.value.denominator) * BigInt(worth.cost);
    if (numerator > 0n) {
      const weights = fit([...stated.map(term => BigInt(term.weight) * denominator), numerator]);
      const terms: RewardTerm[] = [...stated.map((term, index) => ({ kind: term.kind, weight: weights[index]! })), { kind: "challengePoints", weight: weights[stated.length]! }];
      first = [terms[0]!, ...terms.slice(1).sort((a, b) => EVENT_REWARDS.indexOf(a.kind) - EVENT_REWARDS.indexOf(b.kind))];
    }
  }
  return [first, ...layout.ties.map(kind => [{ kind, weight: 1 }])];
}

/** How many of the level's first reward one unit of a term counts as. */
export const termRate = (terms: readonly RewardTerm[], index: number): number => terms[index]!.weight / terms[0]!.weight;

/** One reward of a team's total: its own expectation, what it counts as in the base reward, and its part of the total. */
export interface RewardShare { kind: EventReward; rate: number; value: number; counted: number; share: number }
export function rewardShares(terms: readonly RewardTerm[], values: readonly number[]): RewardShare[] {
  const counted = terms.map((_, index) => (values[index] ?? 0) * termRate(terms, index));
  const total = counted.reduce((sum, value) => sum + value, 0);
  return terms.map((term, index) => ({ kind: term.kind, rate: termRate(terms, index), value: values[index] ?? 0, counted: counted[index]!,
    share: total > 0 ? counted[index]! / total : 0 }));
}
