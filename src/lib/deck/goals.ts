import type { MusicDifficulty } from "@/lib/music/difficulty";
import { activeSongRules, type DeckArenaRule, type DeckSongRules } from "./arena";
import type { DeckEventEffect } from "./manual-event";
import { EVENT_REWARDS, MAX_TERM_WEIGHT, defaultRewardPlan, rewardLayout, rewardLevels, statedTerms,
  type ChallengeWorth, type EventReward, type RewardLayout, type RewardPlan, type RewardTerm } from "./reward-mix";

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
/** Cumulative-counter delivery timing within legal base-judgement windows for ordinary maximum-score searches. */
export type DeckCumulativeTiming = "nominal" | "best" | "worst";
/** Native simulation frame rates (Hz) supported for normal played lives (`7f80fa3`, `6e20f08`). */
export const DECK_FRAME_RATES = [30, 60, 90, 120] as const;
export type DeckFrameRate = (typeof DECK_FRAME_RATES)[number];
export const DEFAULT_JUST_WINDOW_BASE_MS = 25;
export const MAX_GEKISO_INPUT_COUNT = 2_147_483_647;
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
/** A master event as the deck page reads it; times are master dates with their server offset. */
export interface DeckEvent {
  id: number;
  name: string;
  startAt: string;
  endAt: string;
  /** The event item an event live yields, or null. */
  itemId: number | null;
  challengeMusics: readonly DeckChallengeMusic[];
  /** Optional raw event effect rows used as a template for simulated/manual event bonus planning. */
  effects?: readonly DeckEventEffect[];
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
  /** Ordinary maximum-score goal only: optimize or lower-bound cumulative-Snap delivery timing (`best` / `worst`), or keep `nominal`. */
  cumulativeTiming?: DeckCumulativeTiming;
  /** Ordinary played live frame rate (`30` / `60` / `90` / `120` Hz, default `60`). */
  frameRate?: DeckFrameRate;
  allSongs?: boolean;
  /** Multi-song search mode when `allSongs` is enabled on score goals: per-song top teams (`individual`) or one shared formation maximizing average score (`mean`). */
  multiSongMode?: "individual" | "mean";
  /** Optional song attribute / Gekisou range mission overrides for non-Arena played/skip goals. */
  songRules?: DeckSongRules;
  /** Event payoff goals: how the other rewards of the same live take part in the ranking. */
  rewards: RewardPlan;
  musicId: number | null;
  difficulty: MusicDifficulty;
  /** `MasterChallengeMusic._id` of the chosen challenge song: the venue's, or the one that rates challenge points. */
  challengeMusicId: number | null;
  /** The difficulty of the challenge live that rates challenge points. */
  rateDifficulty: MusicDifficulty;
  venue: DeckVenue;
  arenaMusicId: number | null;
  /** 1.1.0.100+ Gekiso Arena league/regulation rule; null when Auto schedule has no active season/regulation. */
  arenaRule?: DeckArenaRule | null;
  /** Multi-song pool for Gekiso Arena (`shared` or `individual` mode). */
  arenaSongEntries?: readonly { musicId: number; difficulty: MusicDifficulty }[];
  /** Gekisou range placement (1..5, default 1). */
  gekisouRank?: number;
  /** Per-range Gekisou placements (Ranges 1..3, each 1..5). */
  gekisouRanks?: readonly [number, number, number];
  /** Gekisou minimum opening COMBO BONUS (`1..=2147483647`, default `1`). */
  minComboBonus?: number;
  /** Gekisou steady JUST tap window target unit (`+%` over base tap window or `±ms` half-window). */
  justWindowUnit?: "percent" | "ms";
  justWindowPercent?: number;
  justWindowMs?: number;
  /** Base JUST tap half-window in ms from `MasterLiveJudgementTiming` (`25` ms default). */
  baseJustWindowMs?: number;
  /** Gekisou LUCK sampling mode (`auto` nominal/4-root vs `manual` seed count `0..n`). */
  luckSamplingMode?: "auto" | "manual";
  luckSamples?: number;
  playMode: "accuracy" | "pattern";
  missEvery: number;
  boosts: number;
  /** When the search stops with its best teams so far, unproven; null runs until it proves the optimum. */
  timeLimit: DeckTimeLimit;
  challengePoints: ChallengePointCost;
  /** Whole percents. */
  greatPercent: number;
  goodPercent?: number;
  badPercent?: number;
  missPercent?: number;
  justPercent: number;
  /** Power: count the chosen song's attribute and tag bonuses. */
  powerSong: boolean;
  /** Power: count the held event's parameter bonus. */
  eventParameter: boolean;
  /** Event room grading mode (`battle` vs `solo`) and room player count (`1..5`). */
  rewardRoomMode?: "battle" | "solo";
  rewardPlayers?: number;
  /** Battle event points: the other players' average score, or null for "the same as mine". */
  othersAverageScore: number | null;
}

export const defaultDeckGoalInput = (goal: DeckGoal = DEFAULT_DECK_GOAL): DeckGoalInput => ({
  goal, aggregation: "expected", rewards: defaultRewardPlan(), musicId: null, difficulty: "expert", challengeMusicId: null, rateDifficulty: "expert", venue: "freeLive", boosts: 0, challengePoints: 200, timeLimit: DEFAULT_TIME_LIMIT,
  arenaMusicId: null,
  playMode: "accuracy", missEvery: 0,
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
/** Whether the goal input plays a live with Gekisou sections. */
export const playsGekisou = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => ["battleLive", "missionLive", "arenaLive"].includes(solverGoalKind(input));
export const isChallengeInput = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => input.goal === "challenge" || input.goal === "challengeSkip" || isEventPayoffGoal(input.goal) && ["challengeLive", "challengeSkip"].includes(input.venue);
export const isNetworkInput = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => ["battleLive", "arenaLive"].includes(solverGoalKind(input));
/** Whether the goal input reads a play style (a played live; not power or a skip). */
export const readsAccuracy = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => !["power", "skip"].includes(solverGoalKind(input));
/** Whether a goal supports optimizing one shared formation for average score across all songs. */
export const supportsCrossSongMean = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean =>
  !isEventPayoffGoal(input.goal) && ["freeLive", "challengeLive", "battleLive", "missionLive"].includes(solverGoalKind(input));
/** Retain the objective preference for supported non-Gekisou played lives. */
export const effectiveAggregation = (input: Pick<DeckGoalInput, "goal" | "venue"> & Partial<Pick<DeckGoalInput, "aggregation" | "arenaRule" | "allSongs" | "multiSongMode">>): DeckAggregation =>
  readsAccuracy(input)
  && !(solverGoalKind(input) === "arenaLive" && input.arenaRule?.mode === "shared")
  && !(input.allSongs && input.multiSongMode === "mean" && supportsCrossSongMean(input))
    ? input.aggregation ?? "expected"
    : "expected";
/** Whether a goal supports best/worst cumulative-counter delivery timing (`freeLive` / `challengeLive` maximum score). */
export const supportsCumulativeTiming = (
  input: Pick<DeckGoalInput, "goal" | "venue"> & Partial<Pick<DeckGoalInput, "aggregation" | "arenaRule" | "allSongs" | "multiSongMode">>,
): boolean =>
  !isEventPayoffGoal(input.goal)
  && ["freeLive", "challengeLive"].includes(solverGoalKind(input))
  && effectiveAggregation(input) === "maximum";
/** Active cumulative-delivery timing mode for the given goal input. */
export const effectiveCumulativeTiming = (
  input: Pick<DeckGoalInput, "goal" | "venue"> & Partial<Pick<DeckGoalInput, "aggregation" | "cumulativeTiming" | "arenaRule" | "allSongs" | "multiSongMode">>,
): DeckCumulativeTiming =>
  supportsCumulativeTiming(input) && (input.cumulativeTiming === "best" || input.cumulativeTiming === "worst")
    ? input.cumulativeTiming
    : "nominal";

/** Whether a goal supports selectable native frame rate (`30` / `60` / `90` / `120` Hz). */
export const supportsFrameRate = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean =>
  readsAccuracy(input) && !playsGekisou(input);

export const effectiveFrameRate = (
  input: Pick<DeckGoalInput, "goal" | "venue"> & Partial<Pick<DeckGoalInput, "frameRate">>,
): DeckFrameRate =>
  supportsFrameRate(input) && input.frameRate && (DECK_FRAME_RATES as readonly number[]).includes(input.frameRate)
    ? input.frameRate
    : 60;

/** Resolved minimum steady JUST tap half-window in ms (`0` when unset). */
export function effectiveMinJustWindowMs(
  input: Partial<Pick<DeckGoalInput, "justWindowUnit" | "justWindowPercent" | "justWindowMs" | "baseJustWindowMs">>,
): number {
  const unit = input.justWindowUnit ?? "percent";
  if (unit === "ms") {
    const ms = input.justWindowMs ?? 0;
    return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  const pct = input.justWindowPercent ?? 0;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0) return 0;
  const base = typeof input.baseJustWindowMs === "number" && Number.isFinite(input.baseJustWindowMs) && input.baseJustWindowMs > 0
    ? input.baseJustWindowMs
    : DEFAULT_JUST_WINDOW_BASE_MS;
  return Number((base * (1 + pct / 100)).toFixed(4));
}

type RewardInput = Pick<DeckGoalInput, "goal"> & Partial<Pick<DeckGoalInput, "venue" | "rewards">>;
/** The rewards a goal input can count beside its own. A challenge live spends challenge points and earns none. */
export const mixableRewards = (input: Pick<DeckGoalInput, "goal"> & Partial<Pick<DeckGoalInput, "venue">>): readonly EventReward[] =>
  EVENT_REWARDS.filter(kind => kind !== input.goal && !(kind === "challengePoints" && ["challengeLive", "challengeSkip"].includes(input.venue ?? "freeLive")));
/** How an event payoff goal counts the other rewards of its venue; null while it ranks by its own reward alone. */
export const rewardLayoutOf = (input: RewardInput): RewardLayout | null =>
  isEventPayoffGoal(input.goal) && input.rewards ? rewardLayout(input.goal as EventReward, input.rewards, mixableRewards(input)) : null;
/** Whether challenge points are rated by the best challenge-live team, which is solved before the goal itself. */
export const usesChallengeRate = (input: RewardInput): boolean => rewardLayoutOf(input)?.auto === true;
export const usesEventItemRewards = (input: RewardInput): boolean => {
  const layout = rewardLayoutOf(input);
  return input.goal === "eventItems" || !!layout && (layout.converted.includes("eventItems") || layout.ties.includes("eventItems"));
};
/** The challenge live that rates challenge points: the goal's own reward plan on the chosen challenge song. */
export const challengeRateInput = (input: DeckGoalInput): DeckGoalInput => ({ ...input, allSongs: false, multiSongMode: "individual", venue: "challengeLive", difficulty: input.rateDifficulty });

/** Event objectives and event-boosted power require the held event's data. */
export const usesEventData = (input: Pick<DeckGoalInput, "goal" | "eventParameter">): boolean => isEventGoal(input.goal) || input.goal === "power" && input.eventParameter;

/** `DeckSolver.capabilities()`: what the loaded engine computes. */
export interface DeckSolverCapabilities {
  goals: readonly string[];
  metrics: Readonly<Record<string, readonly string[]>>;
  aggregations?: Partial<Record<DeckAggregation, Readonly<Record<string, readonly string[]>>>>;
  accuracy: { great: boolean; good?: boolean; bad?: boolean; miss?: boolean; just: boolean };
  patternPlay?: boolean;
  crossSong?: boolean;
  crossSongMean?: boolean;
  songRules?: boolean;
  resume?: boolean;
  eventItemRewards?: { selection: "exactResultGrade"; eventGroupField: "eventGroup"; rowsPerGrade: 1; probabilityMarker: 10000 };
  /** Combined metrics: levels compared in turn, each the expected weighted sum of several metrics with integer weights. */
  combinedMetric?: { maxLevels: number; maxTerms: number; maxWeight: number; goals?: readonly string[] };
  /** Gekisou lives with LUCK missions are computed. */
  luckMissions?: boolean;
  /** Plays with Great judgements are computed in LUCK lives, where a held judgement conversion changes the draws. */
  luckGreatConversions?: boolean;
  /** 1.1.0.100+ Gekiso Arena league/regulation rules and shared 5-song formation search. */
  arenaRules?: boolean;
  /** Gekisou range placements 1..5. */
  gekisouRank?: boolean;
  /** Per-range Gekisou placements `[r1, r2, r3]` (1..5). */
  gekisouRangeRanks?: boolean;
  /** Manual / simulated event bonus overrides (`eventEffects`) for future or custom event planning. */
  manualEventBonuses?: boolean;
  /** Fast single-card upgrade impact ranking (`evaluateGrowth`) on solved teams. */
  teamGrowth?: boolean;
  /** Best/worst cumulative-counter delivery timing optimization (`cumulativeTiming: "best" | "worst"`). */
  cumulativeTiming?: boolean;
  /** Supported frame rates (Hz) for ordinary played lives. */
  frameRates?: readonly number[];
  /** Bounded Gekisou mission member counts (`[COMBO, LUCK, JUST]`, sum <= 5). */
  minMissionMembers?: boolean;
  /** Gekisou minimum opening COMBO BONUS (`minComboBonus`). */
  minComboBonus?: boolean;
  /** Gekisou steady JUST tap window floor (`minJustWindowMs`). */
  minJustWindow?: boolean;
  /** Configurable LUCK simulation seed counts (`luckSamples`). */
  luckSampling?: boolean;
  /** Supported event reward room grading modes (`battle` / `solo`). */
  rewardRoomModes?: readonly string[];
}

export function parseCapabilities(json: string | null): DeckSolverCapabilities | null {
  if (json === null) return null;
  let value: unknown;
  try { value = JSON.parse(json); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const strings = (list: unknown) => Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  const numbers = (list: unknown) => Array.isArray(list) ? list.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
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
  const rewards = raw.eventItemRewards as Record<string, unknown> | null | undefined;
  const eventItemRewards: DeckSolverCapabilities["eventItemRewards"] = rewards && typeof rewards === "object"
    && rewards.selection === "exactResultGrade" && rewards.eventGroupField === "eventGroup"
    && rewards.rowsPerGrade === 1 && rewards.probabilityMarker === 10000
    ? { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 } : undefined;
  const combined = raw.combinedMetric as Record<string, unknown> | null | undefined;
  const combinedMetric: DeckSolverCapabilities["combinedMetric"] = combined && typeof combined === "object"
    && combined.kind === "combined" && combined.objective === "lexicographicWeightedExpectedSums" && combined.weights === "integer"
    && Number.isSafeInteger(combined.maxLevels) && Number.isSafeInteger(combined.maxTerms) && Number.isSafeInteger(combined.maxWeight)
    && (combined.goals === undefined || Array.isArray(combined.goals) && combined.goals.every(kind => typeof kind === "string"))
    ? { maxLevels: combined.maxLevels as number, maxTerms: combined.maxTerms as number, maxWeight: combined.maxWeight as number,
      ...(combined.goals === undefined ? {} : { goals: strings(combined.goals) }) } : undefined;
  const frameRates = numbers(raw.frameRates);
  const rewardRoomModes = strings(raw.rewardRoomModes);
  return { goals: strings(raw.goals), metrics, aggregations, ...(eventItemRewards ? { eventItemRewards } : {}), ...(combinedMetric ? { combinedMetric } : {}),
    crossSong: raw.crossSong === true, crossSongMean: raw.crossSongMean === true, songRules: raw.songRules === true,
    resume: raw.resume === true, luckMissions: raw.luckMissions === true, luckGreatConversions: raw.luckGreatConversions === true,
    arenaRules: raw.arenaRules === true, gekisouRank: raw.gekisouRank === true, gekisouRangeRanks: raw.gekisouRangeRanks === true,
    manualEventBonuses: raw.manualEventBonuses === true, teamGrowth: raw.teamGrowth === true,
    cumulativeTiming: raw.cumulativeTiming === true,
    ...(frameRates.length ? { frameRates } : {}),
    minMissionMembers: raw.minMissionMembers === true,
    minComboBonus: raw.minComboBonus === true,
    minJustWindow: raw.minJustWindow === true,
    luckSampling: raw.luckSampling === true,
    ...(rewardRoomModes.length ? { rewardRoomModes } : {}),
    patternPlay: raw.patternPlay === true || !!raw.patternPlay && typeof raw.patternPlay === "object",
    accuracy: {
      great: accuracy.great === true,
      ...(accuracy.good === true ? { good: true } : {}),
      ...(accuracy.bad === true ? { bad: true } : {}),
      ...(accuracy.miss === true ? { miss: true } : {}),
      just: accuracy.just === true,
    } };
}

/** Whether the engine computes a goal input's goal kind and metric. */
export function computes(
  capabilities: DeckSolverCapabilities,
  input: Pick<DeckGoalInput, "goal" | "venue"> & Partial<Pick<DeckGoalInput,
    "playMode" | "greatPercent" | "goodPercent" | "badPercent" | "missPercent" | "justPercent"
    | "aggregation" | "cumulativeTiming" | "frameRate" | "rewards" | "arenaRule" | "gekisouRank" | "gekisouRanks"
    | "minComboBonus" | "justWindowUnit" | "justWindowPercent" | "justWindowMs" | "baseJustWindowMs"
    | "luckSamplingMode" | "luckSamples" | "allSongs" | "multiSongMode" | "songRules">>,
): boolean {
  const layout = rewardLayoutOf(input);
  if (layout) {
    const combined = capabilities.combinedMetric;
    if (!combined || effectiveAggregation(input) !== "expected" || combined.goals && !combined.goals.includes(solverGoalKind(input))) return false;
    const kinds = [layout.base, ...layout.converted, ...layout.ties];
    if (1 + layout.ties.length > combined.maxLevels || kinds.length > combined.maxTerms || combined.maxWeight < MAX_TERM_WEIGHT
      || kinds.some(kind => !(capabilities.metrics[solverGoalKind(input)] ?? []).includes(kind))) return false;
    // The challenge live that rates challenge points earns the other rewards of the plan.
    if (layout.auto && (!capabilities.goals.includes("challengeLive") || combined.goals && !combined.goals.includes("challengeLive")
      || kinds.some(kind => kind !== "challengePoints" && !(capabilities.metrics.challengeLive ?? []).includes(kind)))) return false;
  }
  if (usesEventItemRewards(input)) {
    const rewards = capabilities.eventItemRewards;
    if (!rewards || rewards.selection !== "exactResultGrade" || rewards.eventGroupField !== "eventGroup"
      || rewards.rowsPerGrade !== 1 || rewards.probabilityMarker !== 10000) return false;
  }
  if (input.goal === "challengePoints" && ["challengeLive", "challengeSkip"].includes(input.venue)) return false;
  const kind = solverGoalKind(input), metric = solverMetricKind(input.goal);
  if (kind === "arenaLive" && input.arenaRule !== undefined) {
    if (!capabilities.arenaRules) return false;
    if (input.arenaRule?.mode === "shared" && (isEventPayoffGoal(input.goal) || effectiveAggregation(input) !== "expected")) return false;
  }
  if (kind !== "power" && kind !== "arenaLive" && activeSongRules(input.songRules, playsGekisou(input)) && !capabilities.songRules) return false;
  if (input.allSongs && input.multiSongMode === "mean") {
    if (!capabilities.crossSongMean || !supportsCrossSongMean(input) || effectiveAggregation(input) !== "expected") return false;
  }
  if (playsGekisou(input)) {
    if (input.gekisouRank !== undefined && input.gekisouRank !== 1 && !capabilities.gekisouRank) return false;
    if (input.gekisouRanks && input.gekisouRanks.some(r => r !== (input.gekisouRank ?? 1)) && !capabilities.gekisouRangeRanks) return false;
    if ((input.minComboBonus ?? 1) > 1 && !capabilities.minComboBonus) return false;
    if (effectiveMinJustWindowMs(input) > 0 && !capabilities.minJustWindow) return false;
    if (input.luckSamplingMode === "manual" && (input.luckSamples ?? 0) > 0 && !capabilities.luckSampling) return false;
  }
  if (effectiveCumulativeTiming(input) !== "nominal" && !capabilities.cumulativeTiming) return false;
  const frameRate = effectiveFrameRate(input);
  if (frameRate !== 60 && !(capabilities.frameRates ?? []).includes(frameRate)) return false;
  if (input.playMode === "pattern" && readsAccuracy(input) && !capabilities.patternPlay) return false;
  if (readsAccuracy(input) && input.playMode !== "pattern") {
    if ((input.greatPercent ?? 0) !== 0 && !capabilities.accuracy.great) return false;
    if (!playsGekisou(input)) {
      if ((input.goodPercent ?? 0) !== 0 && !capabilities.accuracy.good) return false;
      if ((input.badPercent ?? 0) !== 0 && !capabilities.accuracy.bad) return false;
      if ((input.missPercent ?? 0) !== 0 && !capabilities.accuracy.miss) return false;
    }
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
export type DeckGoalGap = "song" | "challengeSong" | "event" | "eventItem" | "arenaSong" | "arenaSchedule" | "play" | "rewardMix" | "rateSong" | null;
export function goalGap(input: DeckGoalInput, event: DeckEvent | null): DeckGoalGap {
  if (isEventGoal(input.goal) && !event) return "event";
  const layout = rewardLayoutOf(input);
  if (layout && (!statedTerms(layout, input.rewards) || effectiveAggregation(input) !== "expected")) return "rewardMix";
  if (usesEventItemRewards(input) && !event?.itemId) return "eventItem";
  if (layout?.auto && !event?.challengeMusics.some(row => row.id === input.challengeMusicId)) return "rateSong";
  const kind = solverGoalKind(input);
  if (readsAccuracy(input) && input.playMode === "pattern" && (!Number.isSafeInteger(input.missEvery) || input.missEvery < 0)) return "play";
  if (kind === "arenaLive" && input.arenaRule !== undefined) {
    if (!input.arenaRule) return "arenaSchedule";
    if (input.arenaRule.mode === "shared") {
      if (isEventPayoffGoal(input.goal) || effectiveAggregation(input) !== "expected") return "arenaSchedule";
      return (input.arenaSongEntries?.length ?? 0) > 0 || input.musicId !== null ? null : "arenaSong";
    }
    if (input.allSongs) return null;
    return (input.arenaSongEntries?.length ?? 0) > 0 || input.musicId !== null ? null : "arenaSong";
  }
  if (input.allSongs && kind !== "power") return null;
  if (kind === "arenaLive") return input.arenaMusicId === null ? "arenaSong" : null;
  if (isChallengeInput(input)) return input.challengeMusicId !== null && event?.challengeMusics.some(row => row.id === input.challengeMusicId) ? null : "challengeSong";
  if (kind === "power") return input.powerSong && input.musicId === null ? "song" : null;
  return input.musicId === null ? "song" : null;
}

/** Card choices for this run only; excluded cards still count as owned. Member card and snap master IDs. */
export interface DeckRunConstraints {
  includeMembers: readonly string[];
  includeSnaps?: readonly string[];
  excludeMembers: readonly string[];
  excludeSnaps: readonly string[];
  leader?: string | null;
  noSnaps?: boolean;
  /** Minimum COMBO, LUCK, and JUST Gekisou member counts (`0..=5`, sum `<= 5`). */
  minMissionMembers?: readonly [number, number, number];
}

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

/** The levels a goal input ranks by, or null for a goal ranked by one reward. `worth` rates challenge points for a plan that reads it. */
export function requestLevels(input: DeckGoalInput, worth: ChallengeWorth | null = null): RewardTerm[][] | null {
  const layout = rewardLayoutOf(input);
  if (!layout) return null;
  const levels = rewardLevels(layout, input.rewards, worth);
  if (!levels) throw new Error(layout.auto && !worth ? "The worth of a challenge point is not known yet" : "A reward rate is missing");
  return levels;
}

export interface DeckRecommendationContext {
  event: DeckEvent | null;
  now: number;
  constraints: DeckRunConstraints;
  /** True when the user explicitly selected a template/historical event or simulated bonuses outside live window. */
  manualEvent?: boolean;
  /** Custom simulated event bonus rows overriding the template event's `MasterEventEffect` table. */
  eventEffects?: readonly DeckEventEffect[];
}

/**
 * The request that rates challenge points, or null for a goal input that does not read their worth: the best team
 * of the challenge live on the chosen challenge song, for the goal's reward and the rewards converted at stated rates.
 */
export function challengeRateRequest(input: DeckGoalInput, context: DeckRecommendationContext): string | null {
  return usesChallengeRate(input) ? recommendationRequest(challengeRateInput(input), context, { teams: 1 }) : null;
}

/**
 * The request text of a goal input. Throws when `goalGap` is not null. The held event's ID is sent for event
 * objectives and power with event bonuses enabled. A goal input that rates challenge points by a challenge live
 * takes its `worth` from the answer to `challengeRateRequest`.
 */
export function recommendationRequest(input: DeckGoalInput, context: DeckRecommendationContext,
  options: { worth?: ChallengeWorth | null; teams?: number; songScope?: { field: "musicIds" | "challengeMusicIds" | "arenaMusicIds"; ids: readonly number[] } } = {}): string {
  if (input.goal === "challengePoints" && ["challengeLive", "challengeSkip"].includes(input.venue)) throw new Error("Challenge Live spends challenge points; choose an ordinary venue to earn them");
  const gap = goalGap(input, context.event);
  if (gap) throw new Error(`The goal still needs: ${gap}`);
  const kind = solverGoalKind(input), event = context.event;
  const isGekisou = playsGekisou(input);
  const great = fraction(input.greatPercent);
  const good = isGekisou ? 0 : fraction(Math.min(input.goodPercent ?? 0, Math.max(0, 100 - input.greatPercent)));
  const bad = isGekisou ? 0 : fraction(Math.min(input.badPercent ?? 0, Math.max(0, 100 - input.greatPercent - (input.goodPercent ?? 0))));
  const miss = isGekisou ? 0 : fraction(Math.min(input.missPercent ?? 0, Math.max(0, 100 - input.greatPercent - (input.goodPercent ?? 0) - (input.badPercent ?? 0))));
  const hasLowerJudgements = good > 0 || bad > 0 || miss > 0;
  const timing = effectiveCumulativeTiming(input);
  const frameRate = effectiveFrameRate(input);
  const extraAccuracyFields = `${good > 0 ? `,"goodFraction":${good}` : ""}${bad > 0 ? `,"badFraction":${bad}` : ""}${miss > 0 ? `,"missFraction":${miss}` : ""}`;
  const playTail = `${extraAccuracyFields}${timing !== "nominal" ? `,"cumulativeTiming":${JSON.stringify(timing)}` : ""}${frameRate !== 60 ? `,"frameRate":${frameRate}` : ""}`;
  const accuracy = isGekisou
    ? `{"greatFraction":${great},"justFraction":${fraction(Math.min(input.justPercent, 100 - input.greatPercent))}}`
    : `{"greatFraction":${great}${extraAccuracyFields}}`;
  const play = input.playMode === "pattern"
    ? `"play":{"kind":"pattern","greatFraction":${great},"justFraction":${isGekisou ? fraction(Math.min(input.justPercent, 100 - input.greatPercent)) : 0},"missEvery":${input.missEvery}${playTail}}`
    : (timing !== "nominal" || frameRate !== 60 || hasLowerJudgements)
      ? `"play":{"greatFraction":${great}${playTail}}`
      : `"accuracy":${accuracy}`;
  const song = `"musicId":${input.musicId},"difficulty":${JSON.stringify(input.difficulty)}`;
  const rank = Math.min(5, Math.max(1, Math.trunc(input.gekisouRank ?? 1)));
  const clampRank = (value: number) => Math.min(5, Math.max(1, Math.trunc(value)));
  const rawRanks = isGekisou && kind !== "missionLive" && input.gekisouRanks
    ? [clampRank(input.gekisouRanks[0]), clampRank(input.gekisouRanks[1]), clampRank(input.gekisouRanks[2])] as const
    : null;
  const ranksJson = rawRanks && rawRanks.some(r => r !== rank) ? `,"ranks":${JSON.stringify(rawRanks)}` : "";
  const minComboBonus = isGekisou && Number.isSafeInteger(input.minComboBonus) && (input.minComboBonus ?? 1) > 1
    ? Math.min(MAX_GEKISO_INPUT_COUNT, input.minComboBonus!)
    : null;
  const minJustWindowMs = isGekisou ? effectiveMinJustWindowMs(input) : 0;
  const luckSamples = isGekisou && input.luckSamplingMode === "manual" && Number.isSafeInteger(input.luckSamples) && (input.luckSamples ?? 0) > 0
    ? Math.min(MAX_GEKISO_INPUT_COUNT, input.luckSamples!)
    : null;
  const gekisouExtras = `${ranksJson}${minComboBonus !== null ? `,"minComboBonus":${minComboBonus}` : ""}${minJustWindowMs > 0 ? `,"minJustWindowMs":${minJustWindowMs}` : ""}${luckSamples !== null ? `,"luckSamples":${luckSamples}` : ""}`;
  let goal: string;
  switch (kind) {
    case "battleLive": case "missionLive": goal = `{"kind":"${kind}",${song}${kind === "battleLive" ? `,"rank":${rank}` : ""}${gekisouExtras},${play}}`; break;
    case "arenaLive": {
      if (input.arenaRule) {
        const arenaJson = JSON.stringify({
          bandId: input.arenaRule.bandId,
          musicType: input.arenaRule.musicType,
          missions: [input.arenaRule.missions[0], input.arenaRule.missions[1], input.arenaRule.missions[2]],
          ...(input.arenaRule.mode ? { mode: input.arenaRule.mode } : {}),
        });
        const entries = input.arenaSongEntries && input.arenaSongEntries.length > 0 && !options.songScope
          ? input.arenaSongEntries.map(entry => ({ musicId: entry.musicId, difficulty: entry.difficulty }))
          : null;
        goal = entries
          ? `{"kind":"arenaLive","arena":${arenaJson},"songs":${JSON.stringify(entries)},"rank":${rank}${gekisouExtras},${play}}`
          : `{"kind":"arenaLive","arena":${arenaJson},${song},"rank":${rank}${gekisouExtras},${play}}`;
      } else {
        goal = `{"kind":"arenaLive","arenaMusicId":${input.arenaMusicId},"difficulty":${JSON.stringify(input.difficulty)},"rank":${rank}${gekisouExtras},${play}}`;
      }
      break;
    }
    case "freeLive": goal = `{"kind":"freeLive",${song},${play}}`; break;
    case "challengeLive": goal = `{"kind":"challengeLive","challengeMusicId":${input.challengeMusicId},"difficulty":${JSON.stringify(input.difficulty)},${play}}`; break;
    case "skip": goal = isChallengeInput(input) ? `{"kind":"skip","challengeMusicId":${input.challengeMusicId},"difficulty":${JSON.stringify(input.difficulty)}}` : `{"kind":"skip",${song}}`; break;
    default: goal = `{"kind":"power"${input.powerSong ? `,"musicId":${input.musicId}` : ""},"eventParameter":${input.eventParameter && !!event}}`;
  }
  if (options.songScope) {
    if (!options.songScope.ids.length) throw new Error("The song scope is empty");
    const multiSongPrefix = input.multiSongMode === "mean" && supportsCrossSongMean(input) ? `"multiSong":"mean",` : "";
    goal = goal.replace("{", `{${multiSongPrefix}${JSON.stringify(options.songScope.field)}:${JSON.stringify(options.songScope.ids)},`);
  }
  if (kind !== "power" && kind !== "arenaLive") {
    const rule = activeSongRules(input.songRules, isGekisou);
    if (rule) goal = goal.replace("{", `{"songRules":${JSON.stringify(rule)},`);
  }
  const parts = [`"format":${JSON.stringify(REQUEST_FORMAT)}`, `"goal":${goal}`];
  if (effectiveAggregation(input) === "maximum") parts.push('"aggregation":"maximum"');
  const consumption = isChallengeInput(input) ? input.challengePoints : Math.min(MAX_BOOST, Math.max(0, Math.trunc(input.boosts)));
  if (isEventPayoffGoal(input.goal)) {
    const fields = (kind: EventReward) => `"kind":${JSON.stringify(kind)},"eventId":${event!.id}${kind === "eventItems" ? `,"resourceType":${ITEM_RESOURCE_TYPE},"resourceId":${event!.itemId}` : ""}`;
    const levels = requestLevels(input, options.worth ?? null);
    const metric = levels ? `{"kind":"combined","consumption":${consumption},"levels":[${levels.map(terms => `[${terms.map(term => `{${fields(term.kind)},"weight":${term.weight}}`).join(",")}]`).join(",")}]}`
      : `{${fields(input.goal as EventReward)},"consumption":${consumption}}`;
    const clock = kind === "skip" ? `{"kind":"skip","serverNowJstTicks":${jstTicks(context.now)}}`
      : `{"kind":"played","liveStartJstTicks":null,"serverNowJstTicks":${jstTicks(context.now)}}`;
    parts.push(`"metric":${metric}`, `"eventContext":{"resultClock":${clock},"rewardProjection":true}`);
    const players = Math.min(5, Math.max(1, Math.trunc(input.rewardPlayers ?? 5)));
    const othersJson = input.othersAverageScore === null ? "null" : String(Math.max(0, Math.trunc(input.othersAverageScore)));
    if (isNetworkInput(input)) {
      if (input.rewardRoomMode === "solo") {
        parts.push(`"room":{"mode":"solo","players":1,"othersAverageScore":null}`);
      } else {
        parts.push(`"room":{"players":${players},"othersAverageScore":${othersJson}}`);
      }
    } else if (kind === "freeLive" && input.rewardRoomMode === "battle") {
      parts.push(`"room":{"mode":"battle","players":${players},"othersAverageScore":${othersJson}}`);
    }
  } else if (kind !== "power") parts.push(`"metric":{"kind":"score"}`);
  const { includeMembers, includeSnaps, excludeMembers, excludeSnaps, leader, noSnaps, minMissionMembers } = context.constraints;
  const leaderJson = leader == null || leader === "" ? "null" : ids([leader])[0]!;
  if (event && usesEventData(input) && (context.manualEvent || context.eventEffects !== undefined)) {
    parts.push('"manualEvent":true');
    if (context.eventEffects !== undefined) {
      parts.push(`"eventEffects":${JSON.stringify(context.eventEffects)}`);
    }
  }
  const requiredSnapsPart = !noSnaps && includeSnaps && includeSnaps.length > 0 ? `,"includeSnaps":[${ids(includeSnaps).join(",")}]` : "";
  const missionPart = isGekisou && minMissionMembers && minMissionMembers.some(v => v > 0)
    ? `,"minMissionMembers":${JSON.stringify([minMissionMembers[0], minMissionMembers[1], minMissionMembers[2]])}`
    : "";
  parts.push(`"eventIds":[${event && usesEventData(input) ? event.id : ""}]`,
    `"constraints":{"leader":${leaderJson},"includeMembers":[${ids(includeMembers).join(",")}]${requiredSnapsPart},"excludeMembers":[${ids(excludeMembers).join(",")}],"excludeSnaps":[${ids(excludeSnaps).join(",")}],"noSnaps":${noSnaps === true ? "true" : "false"}${missionPart}}`,
    `"k":${options.teams ?? RECOMMENDATION_COUNT}`, `"limits":{"timeLimitMs":${input.timeLimit === null ? "null" : input.timeLimit * 1000}}`);
  return `{${parts.join(",")}}`;
}
