/** The rewards one event live settles together. */
export const EVENT_REWARDS = ["eventPoints", "challengePoints", "eventItems"] as const;
export type EventReward = typeof EVENT_REWARDS[number];
export const isEventReward = (value: unknown): value is EventReward => (EVENT_REWARDS as readonly unknown[]).includes(value);

/** Whether a reward is counted beside the goal's own, and how many of the goal's reward one unit of it is worth. */
export interface RewardRate { counted: boolean; rate: number | null }
export type RewardRates = Readonly<Record<EventReward, RewardRate>>;
export const defaultRewardRates = (): RewardRates => ({
  eventPoints: { counted: false, rate: null }, challengePoints: { counted: false, rate: null }, eventItems: { counted: false, rate: null },
});

/** The largest weight of a term the solver takes. */
export const MAX_TERM_WEIGHT = 1_000_000;
/** Decimals a rate keeps. */
export const RATE_DECIMALS = 4;

/** One weighted reward of a combined objective. */
export interface RewardTerm { kind: EventReward; weight: number }

const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);

/**
 * Integer weights whose ratios are the rates: the base reward first, worth 1, then each counted reward of `others` in
 * its listed order. A rate keeps up to four decimals, fewer while a weight would pass the solver's limit. Null when
 * no reward is counted or a counted reward has no positive rate within the limit.
 */
export function rewardTerms(base: EventReward, rates: RewardRates, others: readonly EventReward[]): RewardTerm[] | null {
  const counted = others.filter(kind => kind !== base && rates[kind].counted);
  if (!counted.length) return null;
  const values = counted.map(kind => rates[kind].rate);
  if (!values.every((rate): rate is number => typeof rate === "number" && Number.isFinite(rate) && rate > 0)) return null;
  for (let decimals = RATE_DECIMALS; decimals >= 0; decimals--) {
    const scale = 10 ** decimals;
    const weights = values.map(rate => Math.round(rate * scale));
    if (weights.some(weight => weight < 1)) return null;
    if (weights.some(weight => weight > MAX_TERM_WEIGHT)) continue;
    const divisor = weights.reduce(gcd, scale);
    return [{ kind: base, weight: scale / divisor }, ...counted.map((kind, index) => ({ kind, weight: weights[index]! / divisor }))];
  }
  return null;
}

/** How many of the base reward one unit of a term counts as. */
export const termRate = (terms: readonly RewardTerm[], index: number): number => terms[index]!.weight / terms[0]!.weight;

/** One reward of a team's total: its own expectation, what it counts as in the base reward, and its part of the total. */
export interface RewardShare { kind: EventReward; rate: number; value: number; counted: number; share: number }
export function rewardShares(terms: readonly RewardTerm[], values: readonly number[]): RewardShare[] {
  const counted = terms.map((_, index) => (values[index] ?? 0) * termRate(terms, index));
  const total = counted.reduce((sum, value) => sum + value, 0);
  return terms.map((term, index) => ({ kind: term.kind, rate: termRate(terms, index), value: values[index] ?? 0, counted: counted[index]!,
    share: total > 0 ? counted[index]! / total : 0 }));
}
