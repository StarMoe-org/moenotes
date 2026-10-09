import type { BoxCard, CardBox, CardFieldName, CardKind } from "@/lib/box/model";
import { parseFraction, parseInterval, type DeckFraction, type DeckInterval } from "./interval";
import { isChallengePointPriority, type ChallengePointPriority, type DeckAggregation } from "./goals";

/** The answer of a recommendation, `ournotes-deck.account-recommendation/1`, as the page reads it. */
export const ANSWER_FORMAT = "ournotes-deck.account-recommendation/1";

export interface DeckPair { member: number; snap: number | null }
export interface DeckPayoffValue { score: number; exact: DeckFraction | null; interval: DeckInterval | null }
export interface DeckValue extends DeckPayoffValue { payoff: DeckPayoffValue | null }
export type DeckEventRewards = Record<"challengePoints" | "eventPoints" | "eventItems", DeckPayoffValue & { exact: DeckFraction; interval: null }>;
export interface DeckOrderStat { score: number; order: number[] }
export interface DeckTeam {
  rank: number;
  rankCertified: boolean;
  leader: DeckPair;
  others: DeckPair[];
  power: number;
  value: DeckValue | null;
  eventRewards?: DeckEventRewards;
  orders: { count: number; min: DeckOrderStat; median: DeckOrderStat; max: DeckOrderStat } | null;
  bestOrder: DeckOrderStat | null;
  /** Slots 0..4 of the formation screen; the leader sits in slot 2. */
  layout: { members: number[]; snaps: (number | null)[] };
}
export interface DeckOptimality { proven: boolean; lowerBound: number | null; upperBound: number | null; fraction: number | null }
export interface DeckIssue { path: string; code: string; message: string }
export type DeckPhase = "preprocess" | "search" | "proof" | "done";
export interface DeckAnswer {
  final: boolean;
  status: "ok" | "incomplete" | "invalid" | "failed";
  missing: DeckIssue[];
  errors: DeckIssue[];
  result: null | {
    phase: DeckPhase;
    elapsedMs: number | null;
    optimality: DeckOptimality;
    teams: DeckTeam[];
    coversAllOwnedCards: boolean;
    metric?: string;
    secondaryPriority?: ChallengePointPriority;
    resourceType?: number;
    resourceId?: number;
    aggregation: DeckAggregation;
    goalKind: string | null;
    exitReason: string | null;
    play?: { judged: number; misses: number } | null;
  };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const int = (value: unknown): number => { if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Expected an integer"); return value; };

function pair(value: unknown): DeckPair {
  if (!record(value)) throw new Error("Invalid team member");
  return { member: int(value.member), snap: value.snap === null || value.snap === undefined ? null : int(value.snap) };
}
function value(raw: unknown): DeckValue | null {
  if (!record(raw) || num(raw.score) === null) return null;
  const payoff = record(raw.payoff) && num(raw.payoff.score) !== null ? { score: raw.payoff.score as number, exact: parseFraction(raw.payoff.exact), interval: parseInterval(raw.payoff.interval) } : null;
  return { score: raw.score as number, exact: parseFraction(raw.exact), interval: parseInterval(raw.interval), payoff };
}
function stat(raw: unknown): DeckOrderStat {
  if (!record(raw) || num(raw.score) === null || !Array.isArray(raw.order)) throw new Error("Invalid order statistic");
  return { score: raw.score as number, order: raw.order.map(int) };
}
function exactReward(raw: unknown): DeckEventRewards["challengePoints"] {
  if (!record(raw) || num(raw.score) === null || raw.interval !== null) throw new Error("Invalid exact event reward");
  const exact = parseFraction(raw.exact);
  if (!exact) throw new Error("Missing exact event reward");
  return { score: raw.score as number, exact, interval: null };
}
function eventRewards(raw: unknown): DeckEventRewards {
  if (!record(raw)) throw new Error("Missing event rewards for challenge-point priority");
  return { challengePoints: exactReward(raw.challengePoints), eventPoints: exactReward(raw.eventPoints), eventItems: exactReward(raw.eventItems) };
}
function team(raw: unknown, index: number, inheritedRankProof: boolean, requireEventRewards: boolean): DeckTeam {
  if (!record(raw) || !record(raw.layout) || !Array.isArray(raw.others)) throw new Error("Invalid team");
  const layout = raw.layout as Record<string, unknown>;
  if (!Array.isArray(layout.members) || layout.members.length !== 5 || !Array.isArray(layout.snaps) || layout.snaps.length !== 5) throw new Error("Invalid layout");
  const orders = record(raw.orders) ? { count: int(raw.orders.count), min: stat(raw.orders.min), median: stat(raw.orders.median), max: stat(raw.orders.max) } : null;
  const teamValue = value(raw.value);
  if (requireEventRewards && !teamValue?.payoff) throw new Error("Missing challenge-point payoff");
  return { rank: num(raw.rank) ?? index + 1, rankCertified: raw.rankCertified === undefined ? inheritedRankProof : raw.rankCertified === true, leader: pair(raw.leader), others: raw.others.map(pair), power: num(raw.power) ?? 0, value: teamValue, orders,
    ...(requireEventRewards ? { eventRewards: eventRewards(raw.eventRewards) } : {}),
    bestOrder: record(raw.bestOrder) ? stat(raw.bestOrder) : null,
    layout: { members: layout.members.map(int), snaps: layout.snaps.map(item => item === null ? null : int(item)) } };
}
function issues(raw: unknown): DeckIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(record).map(item => ({ path: String(item.path ?? ""), code: String(item.code ?? ""), message: String(item.message ?? "") }));
}

/** Parse an answer text; throws on a text that is not an answer of this format. */
export function parseDeckAnswer(json: string): DeckAnswer {
  const raw: unknown = JSON.parse(json);
  if (!record(raw) || raw.format !== ANSWER_FORMAT) throw new Error("Not a recommendation answer");
  const status = raw.status;
  if (status !== "ok" && status !== "incomplete" && status !== "invalid" && status !== "failed") throw new Error("Unknown answer status");
  let result: DeckAnswer["result"] = null;
  if (status === "ok" && record(raw.result)) {
    const r = raw.result, o = record(r.optimality) ? r.optimality : {};
    const phase = r.phase === "preprocess" || r.phase === "search" || r.phase === "proof" || r.phase === "done" ? r.phase : "search";
    const account = record(r.account) && record(r.account.cards) ? r.account.cards : {};
    if (r.aggregation !== undefined && r.aggregation !== "expected" && r.aggregation !== "maximum") throw new Error("Unknown result aggregation");
    const metric = record(r.metric) ? r.metric : {};
    const secondaryPriority = metric.secondaryPriority;
    const hasPriority = secondaryPriority !== undefined && secondaryPriority !== null;
    if (hasPriority && (!isChallengePointPriority(secondaryPriority) || metric.kind !== "challengePoints"
      || r.aggregation === "maximum" || metric.resourceType !== 1 || !Number.isSafeInteger(metric.resourceId)
      || (metric.resourceId as number) <= 0 || !Array.isArray(r.teams))) throw new Error("Invalid challenge-point priority result");
    result = {
      ...(hasPriority ? { secondaryPriority: secondaryPriority as ChallengePointPriority, resourceType: 1, resourceId: metric.resourceId as number } : {}),
      phase, elapsedMs: num(r.elapsedMs),
      aggregation: r.aggregation === "maximum" ? "maximum" : "expected",
      goalKind: record(r.goal) && typeof r.goal.kind === "string" ? r.goal.kind : null,
      exitReason: typeof r.exitReason === "string" ? r.exitReason : null,
      metric: record(r.metric) && typeof r.metric.kind === "string" ? r.metric.kind : record(r.goal) && r.goal.kind === "power" ? "power" : "score",
      play: record(r.goal) && record(r.goal.play) && num(r.goal.play.judged) !== null && num(r.goal.play.misses) !== null
        ? { judged: r.goal.play.judged as number, misses: r.goal.play.misses as number } : null,
      optimality: { proven: o.proven === true, lowerBound: num(o.lowerBound), upperBound: num(o.upperBound), fraction: num(o.fraction) },
      teams: Array.isArray(r.teams) ? r.teams.map((raw, index) => team(raw, index, o.proven === true, hasPriority)) : [],
      coversAllOwnedCards: account.coversAllOwnedCards !== false,
    };
  }
  return { final: raw.final === true, status, missing: issues(raw.missing), errors: issues(raw.errors), result };
}

/** A solver answer whose WASM ran out of memory: the message the page shows instead of a generic crash. */
export const isOutOfMemory = (message: string): boolean => /out of memory|memory access out of bounds|allocation|RangeError.*memory/i.test(message);

/** What an issue asks of the user. */
export type DeckIssueTarget =
  | { kind: "card"; cardKind: CardKind; masterId: string; field: CardFieldName | null; card: BoxCard | null }
  | { kind: "vip" }
  | { kind: "player"; area: "characters" | "bandItems" | "memory" }
  | { kind: "request" }
  | { kind: "other" };

const CARD_FIELDS: Readonly<Record<string, CardFieldName>> = {
  _exp: "level", _awakeCount: "awake", _rank: "rank", _liveSkillLevel: "liveSkillLevel", _performanceSkillLevel: "gekisouSkillLevel",
};

/**
 * Map an issue back to the Box: a card (by the `_masterId` the message names, the list the path names and the field
 * the path ends with), the declared VIP rank, a player area, or the request.
 */
export function issueTarget(issue: DeckIssue, box: CardBox | null): DeckIssueTarget {
  const { path } = issue;
  if (path.startsWith("declared._vip")) return { kind: "vip" };
  const list = /^_player\._(memberCards|supportCards)\[\d+\](?:\.(_\w+))?/.exec(path);
  if (list) {
    const cardKind: CardKind = list[1] === "memberCards" ? "member" : "snap";
    const masterId = /_masterId (\d+)/.exec(issue.message)?.[1];
    if (!masterId) return { kind: "other" };
    const field = list[2] ? CARD_FIELDS[list[2]] ?? null : null;
    const card = box?.cards.find(item => item.kind === cardKind && item.identity.value === masterId) ?? null;
    return { kind: "card", cardKind, masterId, field: cardKind === "snap" && (field === "awake" || field === "liveSkillLevel" || field === "gekisouSkillLevel") ? null : field, card };
  }
  if (path.startsWith("_player._characters")) return { kind: "player", area: "characters" };
  if (path.startsWith("_player._bandItems")) return { kind: "player", area: "bandItems" };
  if (path.startsWith("_player._memory")) return { kind: "player", area: "memory" };
  if (path === "request" || /^(goal|metric|aggregation|constraints|eventIds|eventContext|room|limits|k)\b/.test(path)) return { kind: "request" };
  return { kind: "other" };
}

/** Issues grouped for the page: per card (in Box order), then VIP, player areas, the request and the rest. */
export interface DeckIssueGroups {
  cards: { card: BoxCard | null; cardKind: CardKind; masterId: string; fields: CardFieldName[]; issues: DeckIssue[] }[];
  vip: DeckIssue[];
  player: { area: "characters" | "bandItems" | "memory"; issues: DeckIssue[] }[];
  request: DeckIssue[];
  other: DeckIssue[];
}
export function groupIssues(answer: DeckAnswer, box: CardBox | null): DeckIssueGroups {
  const groups: DeckIssueGroups = { cards: [], vip: [], player: [], request: [], other: [] };
  for (const issue of [...answer.errors, ...answer.missing]) {
    const target = issueTarget(issue, box);
    if (target.kind === "card") {
      let entry = groups.cards.find(item => item.cardKind === target.cardKind && item.masterId === target.masterId);
      if (!entry) groups.cards.push(entry = { card: target.card, cardKind: target.cardKind, masterId: target.masterId, fields: [], issues: [] });
      if (target.field && !entry.fields.includes(target.field)) entry.fields.push(target.field);
      entry.issues.push(issue);
    } else if (target.kind === "vip") groups.vip.push(issue);
    else if (target.kind === "player") {
      let entry = groups.player.find(item => item.area === target.area);
      if (!entry) groups.player.push(entry = { area: target.area, issues: [] });
      entry.issues.push(issue);
    } else if (target.kind === "request") groups.request.push(issue);
    else groups.other.push(issue);
  }
  const order = (entry: DeckIssueGroups["cards"][number]) => entry.card ? box!.cards.indexOf(entry.card) : Number.MAX_SAFE_INTEGER;
  groups.cards.sort((a, b) => order(a) - order(b));
  return groups;
}
