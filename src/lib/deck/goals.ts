import type { MusicDifficulty } from "@/lib/music/difficulty";

/**
 * What a team is for, in the player's terms, and the solver request (`ournotes-deck.recommendation-request/2`) each
 * goal sends. Event goals exist only while an event is held.
 */
export const EVENT_GOALS = ["challenge", "eventPoints", "eventItems"] as const;
export const EVERYDAY_GOALS = ["battle", "free", "power"] as const;
export const DECK_GOALS = [...EVENT_GOALS, ...EVERYDAY_GOALS] as const;
export type DeckGoal = typeof DECK_GOALS[number];
export const DEFAULT_DECK_GOAL: DeckGoal = "battle";
export const isEventGoal = (goal: DeckGoal): boolean => (EVENT_GOALS as readonly string[]).includes(goal);

/** Where an event live is played. */
export const DECK_VENUES = ["battleLive", "freeLive", "challengeLive", "skip"] as const;
export type DeckVenue = typeof DECK_VENUES[number];
/** Boosts spent on a battle, free or skipped live: 0..10. A challenge live spends challenge points instead. */
export const MAX_BOOST = 10;
export const CHALLENGE_POINT_COSTS = [200, 400, 800, 1600] as const;
export type ChallengePointCost = typeof CHALLENGE_POINT_COSTS[number];

export const REQUEST_FORMAT = "ournotes-deck.recommendation-request/2";
/** Teams returned per run. */
export const RECOMMENDATION_COUNT = 5;
/** `MasterReward` resource type of an item. */
const ITEM_RESOURCE_TYPE = 1;

export interface DeckChallengeMusic { id: number; musicId: number }
/** A master event as the deck page reads it; times are master dates with their server offset. */
export interface DeckEvent {
  id: number;
  name: string;
  startAt: string;
  endAt: string;
  /** The event item an event live yields, or null. */
  itemId: number | null;
  challengeMusics: readonly DeckChallengeMusic[];
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
  musicId: number | null;
  difficulty: MusicDifficulty;
  /** `MasterChallengeMusic._id` of the chosen challenge song. */
  challengeMusicId: number | null;
  venue: DeckVenue;
  boosts: number;
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
  goal, musicId: null, difficulty: "expert", challengeMusicId: null, venue: "freeLive", boosts: 0, challengePoints: 200,
  greatPercent: 0, justPercent: 100, powerSong: false, eventParameter: true, othersAverageScore: null,
});

/** The solver goal kind a goal input runs as. */
export function solverGoalKind(input: Pick<DeckGoalInput, "goal" | "venue">): string {
  switch (input.goal) {
    case "battle": return "battleLive";
    case "free": return "freeLive";
    case "power": return "power";
    case "challenge": return "challengeLive";
    case "eventPoints": case "eventItems": return input.venue;
  }
}
/** The solver metric kind, or null for power. */
export function solverMetricKind(goal: DeckGoal): string | null {
  return goal === "power" ? null : goal === "eventPoints" ? "eventPoints" : goal === "eventItems" ? "eventItems" : "score";
}
/** Whether the goal input plays a live with gekisou (only a battle live does). */
export const playsGekisou = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => solverGoalKind(input) === "battleLive";
/** Whether the goal input reads a play style (a played live; not power or a skip). */
export const readsAccuracy = (input: Pick<DeckGoalInput, "goal" | "venue">): boolean => !["power", "skip"].includes(solverGoalKind(input));

/** `DeckSolver.capabilities()`: what the loaded engine computes. */
export interface DeckSolverCapabilities {
  goals: readonly string[];
  metrics: Readonly<Record<string, readonly string[]>>;
  accuracy: { great: boolean; just: boolean };
}

export function parseCapabilities(json: string | null): DeckSolverCapabilities | null {
  if (json === null) return null;
  let value: unknown;
  try { value = JSON.parse(json); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const strings = (list: unknown) => Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  const metrics: Record<string, string[]> = {};
  if (raw.metrics && typeof raw.metrics === "object") for (const [kind, list] of Object.entries(raw.metrics)) metrics[kind] = strings(list);
  const accuracy = raw.accuracy && typeof raw.accuracy === "object" ? raw.accuracy as Record<string, unknown> : {};
  return { goals: strings(raw.goals), metrics, accuracy: { great: accuracy.great === true, just: accuracy.just === true } };
}

/** Whether the engine computes a goal input's goal kind and metric. */
export function computes(capabilities: DeckSolverCapabilities, input: Pick<DeckGoalInput, "goal" | "venue">): boolean {
  const kind = solverGoalKind(input), metric = solverMetricKind(input.goal);
  if (!capabilities.goals.includes(kind)) return false;
  return metric === null || (capabilities.metrics[kind] ?? []).includes(metric);
}
/** Whether any venue of a goal is computed; a goal whose venues are all unsupported is shown as coming soon. */
export function computesGoal(capabilities: DeckSolverCapabilities, goal: DeckGoal): boolean {
  const venues: readonly DeckVenue[] = goal === "eventPoints" || goal === "eventItems" ? DECK_VENUES : ["freeLive"];
  return venues.some(venue => computes(capabilities, { goal, venue }));
}

/** What the goal input still needs before it can run. */
export type DeckGoalGap = "song" | "challengeSong" | "event" | "eventItem" | null;
export function goalGap(input: DeckGoalInput, event: DeckEvent | null): DeckGoalGap {
  if (isEventGoal(input.goal) && !event) return "event";
  if (input.goal === "eventItems" && !event?.itemId) return "eventItem";
  const kind = solverGoalKind(input);
  if (kind === "challengeLive") return input.challengeMusicId !== null && event?.challengeMusics.some(row => row.id === input.challengeMusicId) ? null : "challengeSong";
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
  const gap = goalGap(input, context.event);
  if (gap) throw new Error(`The goal still needs: ${gap}`);
  const kind = solverGoalKind(input), event = context.event;
  const great = fraction(input.greatPercent);
  const accuracy = playsGekisou(input) ? `{"greatFraction":${great},"justFraction":${fraction(Math.min(input.justPercent, 100 - input.greatPercent))}}` : `{"greatFraction":${great}}`;
  const song = `"musicId":${input.musicId},"difficulty":${JSON.stringify(input.difficulty)}`;
  let goal: string;
  switch (kind) {
    case "battleLive": goal = `{"kind":"battleLive",${song},"rank":1,"accuracy":${accuracy}}`; break;
    case "freeLive": goal = `{"kind":"freeLive",${song},"accuracy":${accuracy}}`; break;
    case "challengeLive": goal = `{"kind":"challengeLive","challengeMusicId":${input.challengeMusicId},"difficulty":${JSON.stringify(input.difficulty)},"accuracy":${accuracy}}`; break;
    case "skip": goal = `{"kind":"skip",${song}}`; break;
    default: goal = `{"kind":"power"${input.powerSong ? `,"musicId":${input.musicId}` : ""},"eventParameter":${input.eventParameter && !!event}}`;
  }
  const parts = [`"format":${JSON.stringify(REQUEST_FORMAT)}`, `"goal":${goal}`];
  const consumption = kind === "challengeLive" ? input.challengePoints : Math.min(MAX_BOOST, Math.max(0, Math.trunc(input.boosts)));
  if (input.goal === "eventPoints" || input.goal === "eventItems") {
    const metric = input.goal === "eventPoints" ? `{"kind":"eventPoints","eventId":${event!.id},"consumption":${consumption}}`
      : `{"kind":"eventItems","eventId":${event!.id},"resourceType":${ITEM_RESOURCE_TYPE},"resourceId":${event!.itemId},"consumption":${consumption}}`;
    const clock = kind === "skip" ? `{"kind":"skip","serverNowJstTicks":${jstTicks(context.now)}}`
      : `{"kind":"played","liveStartJstTicks":null,"serverNowJstTicks":${jstTicks(context.now)}}`;
    parts.push(`"metric":${metric}`, `"eventContext":{"resultClock":${clock}}`);
    if (kind === "battleLive") parts.push(`"room":{"players":5,"othersAverageScore":${input.othersAverageScore === null ? "null" : Math.max(0, Math.trunc(input.othersAverageScore))}}`);
  } else if (kind !== "power") parts.push(`"metric":{"kind":"score"}`);
  const { includeMembers, excludeMembers, excludeSnaps } = context.constraints;
  parts.push(`"eventIds":[${event ? event.id : ""}]`,
    `"constraints":{"leader":null,"includeMembers":[${ids(includeMembers).join(",")}],"excludeMembers":[${ids(excludeMembers).join(",")}],"excludeSnaps":[${ids(excludeSnaps).join(",")}],"noSnaps":false}`,
    `"k":${RECOMMENDATION_COUNT}`, `"limits":{"timeLimitMs":null}`);
  return `{${parts.join(",")}}`;
}
