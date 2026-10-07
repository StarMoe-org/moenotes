import type { MusicDifficulty } from "@/lib/music/difficulty";

/**
 * What a team is for, in the player's terms, and the solver request (`ournotes-deck.recommendation-request/2`) each
 * goal sends. Event goals exist only while an event is held.
 */
export const EVENT_GOALS = ["challenge", "challengeSkip", "challengePoints", "eventPoints", "eventItems"] as const;
export const EVERYDAY_GOALS = ["battle", "mission", "arena", "free", "skip", "power"] as const;
export const DECK_GOALS = [...EVENT_GOALS, ...EVERYDAY_GOALS] as const;
export type DeckGoal = typeof DECK_GOALS[number];
export const DEFAULT_DECK_GOAL: DeckGoal = "battle";
/** Aggregate the reachable random outcomes while keeping the declared play fixed. */
export type DeckAggregation = "expected" | "maximum";
export const isEventGoal = (goal: DeckGoal): boolean => (EVENT_GOALS as readonly string[]).includes(goal);
export const isEventPayoffGoal = (goal: DeckGoal): boolean => goal === "challengePoints" || goal === "eventPoints" || goal === "eventItems";

/** Where an event live is played. */
export const DECK_VENUES = ["battleLive", "missionLive", "arenaLive", "freeLive", "challengeLive", "skip", "challengeSkip"] as const;
export type DeckVenue = typeof DECK_VENUES[number];
export const goalVenues = (goal: DeckGoal): readonly DeckVenue[] => goal === "challengePoints"
  ? DECK_VENUES.filter(venue => venue !== "challengeLive" && venue !== "challengeSkip") : DECK_VENUES;
/** Boosts spent on a battle, free or skipped live: 0..10. A challenge live spends challenge points instead. */
export const MAX_BOOST = 10;
export const CHALLENGE_POINT_COSTS = [200, 400, 800, 1600] as const;
export type ChallengePointCost = typeof CHALLENGE_POINT_COSTS[number];

export const REQUEST_FORMAT = "ournotes-deck.recommendation-request/2";
/** Teams returned per run. */
export const RECOMMENDATION_COUNT = 5;
/** Search time limits a player can choose, in seconds; null searches until the optimum is proven. */
export const TIME_LIMIT_CHOICES = [30, 60, 120, 300, null] as const;
export type DeckTimeLimit = typeof TIME_LIMIT_CHOICES[number];
export const DEFAULT_TIME_LIMIT: DeckTimeLimit = 60;
/** `MasterReward` resource type of an item. */
const ITEM_RESOURCE_TYPE = 1;

export interface DeckChallengeMusic { id: number; musicId: number }
export interface DeckArenaMusic { id: number; musicId: number }
export interface DeckRewardChoice { id: number; amount: number; challenge: boolean }
/** A master event as the deck page reads it; times are master dates with their server offset. */
export interface DeckEvent {
  id: number;
  name: string;
  startAt: string;
  endAt: string;
  /** The event item an event live yields, or null. */
  itemId: number | null;
  challengeMusics: readonly DeckChallengeMusic[];
  rewards?: readonly DeckRewardChoice[];
}

/** The event held at `now` (ms since the epoch); with several, the one ending first. */
export function heldEvent(events: readonly DeckEvent[], now: number, parse: (date: string) => number | null): DeckEvent | null {
  let held: { event: DeckEvent; end: number } | null = null;
  for (const event of events) {
    const start = parse(event.startAt), end = parse(event.endAt);
    if (start === null || end === null || now < start || now >= end) continue;
    if (!held || end < held.end) held = { event, end };
  }
  return held?.event ?? null;
}

/** Everything the goal controls set. Inputs a goal does not read are ignored when its request is built. */
export interface DeckGoalInput {
  goal: DeckGoal;
  aggregation: DeckAggregation;
  musicId: number | null;
  difficulty: MusicDifficulty;
  /** `MasterChallengeMusic._id` of the chosen challenge song. */
  challengeMusicId: number | null;
  venue: DeckVenue;
  arenaMusicId: number | null;
  playMode: "accuracy" | "pattern";
  missEvery: number;
  selectedRewards: number[];
  rewardContextConfirmed: boolean;
  localEventPoints: number | null;
  localChallengePoints: number | null;
  boosts: number;
  /** When the search stops with its best teams so far, unproven; null runs until it proves the optimum. */
  timeLimit: DeckTimeLimit;
  challengePoints: ChallengePointCost;
  /** Whole percents. */
  greatPercent: number;
  justPercent: number;
  /** Power: count the chosen song's attribute and tag bonuses. */
  powerSong: boolean;
  /** Power: count the held event's parameter bonus. */
  eventParameter: boolean;
  /** Battle event points: the other players' average score, or null for "the same as mine". */
  othersAverageScore: number | null;
}

export const defaultDeckGoalInput = (goal: DeckGoal = DEFAULT_DECK_GOAL): DeckGoalInput => ({
  goal, aggregation: "expected", musicId: null, difficulty: "expert", challengeMusicId: null, venue: "freeLive", boosts: 0, challengePoints: 200, timeLimit: DEFAULT_TIME_LIMIT,
  arenaMusicId: null,
  playMode: "accuracy", missEvery: 0, selectedRewards: [], rewardContextConfirmed: false,
  localEventPoints: null, localChallengePoints: null,
  greatPercent: 0, justPercent: 100, powerSong: false, eventParameter: true, othersAverageScore: null,
});

/** The solver goal kind a goal input runs as. */
export function solverGoalKind(input: Pick<DeckGoalInput, "goal" | "venue">): string {
  switch (input.goal) {
    case "battle": return "battleLive";
    case "mission": return "missionLive";
    case "arena": return "arenaLive";
    case "skip": case "challengeSkip": return "skip";
    case "free": return "freeLive";
    case "power": return "power";
    case "challenge": return "challengeLive";
    case "challengePoints": case "eventPoints": case "eventItems": return input.venue === "challengeSkip" ? "skip" : input.venue;
  }
}
/** The solver metric kind, or null for power: the event payoff of event goals, otherwise the score. */
export function solverMetricKind(goal: DeckGoal): string | null {
  return goal === "power" ? null : isEventPayoffGoal(goal) ? goal : "score";
}
/** Whether the goal input plays a live with gekisou (only a battle live does). */
export const playsGekisou = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => ["battleLive", "missionLive", "arenaLive"].includes(solverGoalKind(input));
export const isChallengeInput = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => input.goal === "challenge" || input.goal === "challengeSkip" || isEventPayoffGoal(input.goal) && ["challengeLive", "challengeSkip"].includes(input.venue);
export const isNetworkInput = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => ["battleLive", "arenaLive"].includes(solverGoalKind(input));
/** Whether the goal input reads a play style (a played live; not power or a skip). */
export const readsAccuracy = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => !["power", "skip"].includes(solverGoalKind(input));
/** Deterministic goals have a single value; keep the preference for the next played live. */
export const effectiveAggregation = (input: Pick<DeckGoalInput, "goal" | "venue"> & Partial<Pick<DeckGoalInput, "aggregation">>): DeckAggregation =>
  readsAccuracy(input) ? input.aggregation ?? "expected" : "expected";

/** `DeckSolver.capabilities()`: what the loaded engine computes. */
export interface DeckSolverCapabilities {
  goals: readonly string[];
  metrics: Readonly<Record<string, readonly string[]>>;
  aggregations?: Partial<Record<DeckAggregation, Readonly<Record<string, readonly string[]>>>>;
  accuracy: { great: boolean; just: boolean };
  patternPlay?: boolean;
}

export function parseCapabilities(json: string | null): DeckSolverCapabilities | null {
  if (json === null) return null;
  let value: unknown;
  try { value = JSON.parse(json); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const strings = (list: unknown) => Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  const metricMap = (value: unknown): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    if (value && typeof value === "object" && !Array.isArray(value)) for (const [kind, list] of Object.entries(value)) map[kind] = strings(list);
    return map;
  };
  const metrics = metricMap(raw.metrics);
  const aggregations: DeckSolverCapabilities["aggregations"] = {};
  if (raw.aggregations && typeof raw.aggregations === "object") for (const key of ["expected", "maximum"] as const) {
    const map = (raw.aggregations as Record<string, unknown>)[key];
    if (map !== undefined) aggregations[key] = metricMap(map);
  }
  const accuracy = raw.accuracy && typeof raw.accuracy === "object" ? raw.accuracy as Record<string, unknown> : {};
  return { goals: strings(raw.goals), metrics, aggregations, patternPlay: raw.patternPlay === true || !!raw.patternPlay && typeof raw.patternPlay === "object", accuracy: { great: accuracy.great === true, just: accuracy.just === true } };
}

/** Whether the engine computes a goal input's goal kind and metric. */
export function computes(capabilities: DeckSolverCapabilities, input: Pick<DeckGoalInput, "goal" | "venue"> & Partial<Pick<DeckGoalInput, "playMode" | "greatPercent" | "justPercent" | "aggregation">>): boolean {
  if (input.goal === "challengePoints" && ["challengeLive", "challengeSkip"].includes(input.venue)) return false;
  const kind = solverGoalKind(input), metric = solverMetricKind(input.goal);
  if (input.playMode === "pattern" && readsAccuracy(input) && !capabilities.patternPlay) return false;
  if (readsAccuracy(input) && input.playMode !== "pattern") {
    if ((input.greatPercent ?? 0) !== 0 && !capabilities.accuracy.great) return false;
    if (playsGekisou(input) && (input.justPercent ?? 100) !== 100 && !capabilities.accuracy.just) return false;
  }
  if (!capabilities.goals.includes(kind)) return false;
  const aggregation = effectiveAggregation(input);
  const metrics = capabilities.aggregations?.[aggregation] ?? (aggregation === "expected" ? capabilities.metrics : {});
  return metric === null || (metrics[kind] ?? []).includes(metric);
}
/** Whether any venue of a goal is computed; a goal whose venues are all unsupported is shown as coming soon. */
export function computesGoal(capabilities: DeckSolverCapabilities, goal: DeckGoal): boolean {
  const venues: readonly DeckVenue[] = isEventPayoffGoal(goal) ? goalVenues(goal) : ["freeLive"];
  return venues.some(venue => computes(capabilities, { goal, venue }));
}

/** What the goal input still needs before it can run. */
export type DeckGoalGap = "song" | "challengeSong" | "event" | "eventItem" | "arenaSong" | "play" | "rewardContext" | null;
export function goalGap(input: DeckGoalInput, event: DeckEvent | null): DeckGoalGap {
  if (isEventGoal(input.goal) && !event) return "event";
  if (input.goal === "eventItems" && !event?.itemId) return "eventItem";
  const kind = solverGoalKind(input);
  const int32 = (n: number | null): boolean => n !== null && Number.isInteger(n) && n >= 0 && n <= 2147483647;
  if (readsAccuracy(input) && input.playMode === "pattern" && (!Number.isSafeInteger(input.missEvery) || input.missEvery < 0)) return "play";
  if (input.goal === "eventItems" && (!input.rewardContextConfirmed || !int32(input.localEventPoints) || !int32(input.localChallengePoints)
    || input.selectedRewards.some(id => !event?.rewards?.some(row => row.id === id && row.challenge === isChallengeInput(input))))) return "rewardContext";
  if (kind === "arenaLive") return input.arenaMusicId === null ? "arenaSong" : null;
  if (isChallengeInput(input)) return input.challengeMusicId !== null && event?.challengeMusics.some(row => row.id === input.challengeMusicId) ? null : "challengeSong";
  if (kind === "power") return input.powerSong && input.musicId === null ? "song" : null;
  return input.musicId === null ? "song" : null;
}

/** Card choices for this run only; excluded cards still count as owned. Member card and snap master IDs. */
export interface DeckRunConstraints { includeMembers: readonly string[]; excludeMembers: readonly string[]; excludeSnaps: readonly string[] }

/** JST DateTime ticks (100 ns since 0001-01-01, wall clock in UTC+9) of an epoch time in ms. */
export function jstTicks(epochMs: number): string {
  const ms = BigInt(Math.trunc(epochMs)) + 9n * 3_600_000n;
  return String(ms * 10_000n + 621_355_968_000_000_000n);
}

const fraction = (percent: number) => Math.round(Math.min(100, Math.max(0, percent))) / 100;
const ids = (values: readonly string[]) => values.map(value => {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("Card IDs must be positive integers");
  return value;
});

/**
 * The request text of a goal input. Throws when `goalGap` is not null. The held event's ID is always sent; only
 * goals that count event parameter bonuses read it.
 */
export function recommendationRequest(input: DeckGoalInput, context: { event: DeckEvent | null; now: number; constraints: DeckRunConstraints }): string {
  if (input.goal === "challengePoints" && ["challengeLive", "challengeSkip"].includes(input.venue)) throw new Error("Challenge Live spends challenge points; choose an ordinary venue to earn them");
  const gap = goalGap(input, context.event);
  if (gap) throw new Error(`The goal still needs: ${gap}`);
  const kind = solverGoalKind(input), event = context.event;
  const great = fraction(input.greatPercent);
  const accuracy = playsGekisou(input) ? `{"greatFraction":${great},"justFraction":${fraction(Math.min(input.justPercent, 100 - input.greatPercent))}}` : `{"greatFraction":${great}}`;
  const play = input.playMode === "pattern" ? `"play":{"kind":"pattern","greatFraction":${great},"justFraction":${playsGekisou(input) ? fraction(Math.min(input.justPercent, 100 - input.greatPercent)) : 0},"missEvery":${input.missEvery}}` : `"accuracy":${accuracy}`;
  const song = `"musicId":${input.musicId},"difficulty":${JSON.stringify(input.difficulty)}`;
  let goal: string;
  switch (kind) {
    case "battleLive": case "missionLive": goal = `{"kind":"${kind}",${song}${kind === "battleLive" ? ',"rank":1' : ""},${play}}`; break;
    case "arenaLive": goal = `{"kind":"arenaLive","arenaMusicId":${input.arenaMusicId},"difficulty":${JSON.stringify(input.difficulty)},"rank":1,${play}}`; break;
    case "freeLive": goal = `{"kind":"freeLive",${song},${play}}`; break;
    case "challengeLive": goal = `{"kind":"challengeLive","challengeMusicId":${input.challengeMusicId},"difficulty":${JSON.stringify(input.difficulty)},${play}}`; break;
    case "skip": goal = isChallengeInput(input) ? `{"kind":"skip","challengeMusicId":${input.challengeMusicId},"difficulty":${JSON.stringify(input.difficulty)}}` : `{"kind":"skip",${song}}`; break;
    default: goal = `{"kind":"power"${input.powerSong ? `,"musicId":${input.musicId}` : ""},"eventParameter":${input.eventParameter && !!event}}`;
  }
  const parts = [`"format":${JSON.stringify(REQUEST_FORMAT)}`, `"goal":${goal}`];
  if (effectiveAggregation(input) === "maximum") parts.push('"aggregation":"maximum"');
  const consumption = isChallengeInput(input) ? input.challengePoints : Math.min(MAX_BOOST, Math.max(0, Math.trunc(input.boosts)));
  if (isEventPayoffGoal(input.goal)) {
    const metric = input.goal === "eventItems" ? `{"kind":"eventItems","eventId":${event!.id},"resourceType":${ITEM_RESOURCE_TYPE},"resourceId":${event!.itemId},"consumption":${consumption}}`
      : `{"kind":${JSON.stringify(input.goal)},"eventId":${event!.id},"consumption":${consumption}}`;
    const clock = kind === "skip" ? `{"kind":"skip","serverNowJstTicks":${jstTicks(context.now)}}`
      : `{"kind":"played","liveStartJstTicks":null,"serverNowJstTicks":${jstTicks(context.now)}}`;
    parts.push(`"metric":${metric}`, `"eventContext":{"resultClock":${clock}${input.goal === "eventItems" ? `,"localEvents":[{"eventId":${event!.id},"points":${input.localEventPoints},"challengePoints":${input.localChallengePoints},"added":[]}],"selectedRewards":[${input.selectedRewards.map(id => `{"eventId":${event!.id},"rewardId":${id}}`).join(",")}]` : ',"rewardProjection":true'}}`);
    if (isNetworkInput(input)) parts.push(`"room":{"players":5,"othersAverageScore":${input.othersAverageScore === null ? "null" : Math.max(0, Math.trunc(input.othersAverageScore))}}`);
  } else if (kind !== "power") parts.push(`"metric":{"kind":"score"}`);
  const { includeMembers, excludeMembers, excludeSnaps } = context.constraints;
  parts.push(`"eventIds":[${event ? event.id : ""}]`,
    `"constraints":{"leader":null,"includeMembers":[${ids(includeMembers).join(",")}],"excludeMembers":[${ids(excludeMembers).join(",")}],"excludeSnaps":[${ids(excludeSnaps).join(",")}],"noSnaps":false}`,
    `"k":${RECOMMENDATION_COUNT}`, `"limits":{"timeLimitMs":${input.timeLimit === null ? "null" : input.timeLimit * 1000}}`);
  return `{${parts.join(",")}}`;
}
