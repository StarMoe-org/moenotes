/**
 * Exact event PT parking arithmetic over published event settlement tables.
 * Pure, independent of team search and chart replay; mirrors native Int32 PT settlement
 * (`CalculateEventPoint`) and signed 64-bit event-item settlement with a 32-bit cap.
 */
import { optionalTable, type DeckData } from "./data";

const MAX_REWARD = 0x7fffffff;
const MAX_REWARD_BIGINT = BigInt(MAX_REWARD);
const SCORE_RANK_NAMES = ["None", "E", "D", "C", "B", "A", "S", "SS"] as const;

export interface DeckParkingPlay {
  readonly rank: number;
  readonly points: number;
  readonly scoreMin: number;
  readonly scoreMax: number;
  readonly boosts: number;
  readonly cpCost: number;
  readonly cpGain: number;
}

export interface DeckParkingStep {
  readonly play: DeckParkingPlay;
  readonly count: number;
}

export interface DeckParkingPlan {
  readonly points: number;
  readonly plays: number;
  readonly totalBoosts: number;
  readonly totalCpCost: number;
  readonly totalCpGain: number;
  readonly steps: readonly DeckParkingStep[];
}

export interface DeckParkingResult {
  readonly exact: DeckParkingPlan | null;
  readonly below: DeckParkingPlan;
  readonly above: DeckParkingPlan | null;
}

/** Format a native score-rank enum (`0..7`) into its canonical badge string. */
export function scoreRankName(rank: number): string {
  return SCORE_RANK_NAMES[rank] ?? `#${rank}`;
}

/** Native signed-Int32 event PT settlement (`CalculateEventPoint`). */
export function settleEventPoints(baseAmount: number, bonusBp: number, rate: number): number {
  return Math.trunc(Math.imul(Math.imul((bonusBp + 10000) | 0, baseAmount | 0), rate | 0) / 10000);
}

/** Native signed-64-bit event reward settlement capped at `i32::MAX`. */
export function settleEventReward(baseAmount: number, bonusBp: number, rate: number, extraAmount = 0): number {
  const base = baseAmount | 0;
  const factor = (bonusBp + 10000) | 0;
  const boost = rate | 0;
  const extra = extraAmount | 0;
  const product = base * factor * boost;
  if (Number.isSafeInteger(product)) return Math.min(MAX_REWARD, Math.trunc(product / 10000) + extra) | 0;
  const wide = BigInt.asIntN(64, BigInt(base) * BigInt(factor) * BigInt(boost));
  const amount = wide / 10000n + BigInt(extra);
  return Number(BigInt.asIntN(32, amount < MAX_REWARD_BIGINT ? amount : MAX_REWARD_BIGINT));
}

export interface ParkingRulesInput {
  readonly route: "live" | "challenge" | "skip";
  readonly challenge: boolean;
  readonly consumption: number;
  readonly bonusBp: number;
  readonly scoreMin: number;
  readonly scoreMax: number;
  readonly battle?: boolean;
  readonly players?: number;
  readonly othersAverageScore?: number | null;
  readonly basePointsByRank: ReadonlyMap<number, number>;
  readonly cpByRank: ReadonlyMap<number, number>;
  readonly boostRates: ReadonlyMap<number, number>;
  readonly rankThresholds: readonly { readonly rank: number; readonly required: number; readonly battleRequired?: number }[];
  readonly skipRank?: number;
  readonly includeAllBoosts?: boolean;
}

/** Build reachable positive-PT play options from normalized rule tables. */
export function parkingPlaysFromRules(input: ParkingRulesInput): DeckParkingPlay[] {
  const {
    route, challenge, consumption, bonusBp, scoreMin, scoreMax,
    basePointsByRank, cpByRank, boostRates, rankThresholds, skipRank,
    battle = false, players = 5, othersAverageScore = null, includeAllBoosts = false,
  } = input;
  if (!Number.isFinite(bonusBp) || !Number.isFinite(scoreMin) || !Number.isFinite(scoreMax) || scoreMin > scoreMax) {
    return [];
  }
  if (challenge && consumption <= 0) return [];

  const consumptions = includeAllBoosts
    ? [...new Set([consumption, ...boostRates.keys()])].filter((c) => (challenge ? c > 0 : c >= 0)).sort((a, b) => a - b)
    : [consumption];

  const resolveRate = (cost: number): number | undefined => {
    const direct = boostRates.get(cost);
    if (direct !== undefined) return direct;
    return !challenge && cost === 0 ? 1 : undefined;
  };

  if (route === "skip") {
    const rank = skipRank ?? 3;
    const base = basePointsByRank.get(rank) ?? 0;
    const baseCp = challenge ? 0 : (cpByRank.get(rank) ?? 0);
    const fixedScore = Math.max(0, Math.trunc(scoreMin));
    const result: DeckParkingPlay[] = [];
    for (const cost of consumptions) {
      const rate = resolveRate(cost);
      if (rate === undefined) continue;
      const amount = settleEventPoints(base, bonusBp, rate);
      if (amount > 0) {
        result.push({
          rank,
          points: amount,
          scoreMin: fixedScore,
          scoreMax: fixedScore,
          boosts: challenge ? 0 : cost,
          cpCost: challenge ? cost : 0,
          cpGain: challenge ? 0 : Math.imul(baseCp, rate),
        });
      }
    }
    return result;
  }

  const thresholds = new Map<number, number>([[2, 0]]);
  const scale = battle && players >= 1 ? Math.sqrt(5 / players) * players : 1;
  for (const row of rankThresholds) {
    if (row.rank <= 2) continue;
    let required: number;
    if (battle) {
      const battleReq = row.battleRequired ?? 0;
      if (battleReq <= 0) continue;
      const roomRequired = Math.trunc(scale * battleReq);
      if (othersAverageScore !== null && players > 1) {
        required = Math.max(0, roomRequired - (players - 1) * Math.trunc(othersAverageScore));
      } else {
        required = Math.max(0, Math.ceil(roomRequired / Math.max(1, players)));
      }
    } else {
      required = row.required;
    }
    thresholds.set(row.rank, Math.min(thresholds.get(row.rank) ?? Infinity, required));
  }

  const sortedRanks = [...thresholds].sort((a, b) => a[0] - b[0]);
  const floorScore = Math.max(0, Math.floor(scoreMin));
  const ceilScore = Math.max(floorScore, Math.ceil(scoreMax));
  const out: DeckParkingPlay[] = [];

  for (const cost of consumptions) {
    const rate = resolveRate(cost);
    if (rate === undefined) continue;
    for (let index = 0; index < sortedRanks.length; index++) {
      const [rank, required] = sortedRanks[index]!;
      const nextRequired = Math.min(0x80000000, ...sortedRanks.slice(index + 1).map((row) => row[1]));
      const minimum = Math.max(floorScore, required);
      const maximum = Math.min(ceilScore, nextRequired - 1);
      const amount = settleEventPoints(basePointsByRank.get(rank) ?? 0, bonusBp, rate);
      if (minimum <= maximum && amount > 0) {
        out.push({
          rank,
          points: amount,
          scoreMin: minimum,
          scoreMax: maximum,
          boosts: challenge ? 0 : cost,
          cpCost: challenge ? cost : 0,
          cpGain: challenge ? 0 : Math.imul(cpByRank.get(rank) ?? 0, rate),
        });
      }
    }
  }
  return out;
}

/** Extract exact reachable parking options for a recommended team from verified `DeckData`. */
export function parkingPlaysForDeckData(
  data: DeckData,
  options: {
    readonly eventId: number;
    readonly songId: number | null;
    readonly route: "live" | "challenge" | "skip";
    readonly challenge: boolean;
    readonly consumption: number;
    readonly bonusBp: number;
    readonly scoreMin: number;
    readonly scoreMax: number;
    readonly battle?: boolean;
    readonly players?: number;
    readonly othersAverageScore?: number | null;
    readonly includeAllBoosts?: boolean;
  },
): DeckParkingPlay[] {
  const event = optionalTable(data, "MasterEvent").find((row) => row.id === options.eventId);
  if (!event) return [];
  const pointGroup = event[options.challenge ? "challengeLiveEventPointGroup" : "liveEventPointGroup"];
  const pointRows = optionalTable(data, options.challenge ? "MasterChallengeLiveEventPoint" : "MasterLiveEventPoint")
    .filter((row) => row.group === pointGroup);
  const basePointsByRank = new Map<number, number>();
  for (const row of pointRows) {
    if (typeof row.scoreRank === "number" && typeof row.value === "number") {
      basePointsByRank.set(row.scoreRank, row.value);
    }
  }
  if (basePointsByRank.size === 0) return [];

  const cpByRank = new Map<number, number>();
  if (!options.challenge) {
    for (const row of optionalTable(data, "MasterLiveChallengePoint")) {
      if (typeof row.scoreRank === "number" && typeof row.value === "number") {
        cpByRank.set(row.scoreRank, row.value);
      }
    }
  }

  const boostRates = new Map<number, number>();
  const costField = options.challenge ? "consumedChallengePointCount" : "consumedLiveBoostCount";
  for (const row of optionalTable(data, options.challenge ? "MasterChallengeMusicBoostBonus" : "MasterLiveMusicBoostBonus")) {
    const cost = row[costField];
    const rate = row.eventPointRate;
    if (typeof cost === "number" && typeof rate === "number") {
      boostRates.set(cost, rate);
    }
  }
  if (!options.challenge && !boostRates.has(0)) boostRates.set(0, 1);

  let skipRank = 3;
  if (options.route === "skip") {
    const param = optionalTable(data, "MasterParameter").find((row) => row.id === "live_skip_result_score_rank");
    if (typeof param?.value === "string") {
      const value = param.value.trim();
      if (/^[+-]?\d+$/.test(value)) {
        const parsed = Number(value);
        skipRank = Number.isInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647 ? parsed : 0;
      } else {
        const parts = value.split(",").map((name) => SCORE_RANK_NAMES.indexOf(name.trim() as (typeof SCORE_RANK_NAMES)[number]));
        skipRank = parts.includes(-1) ? 0 : parts.reduce((acc, next) => acc | next, 0);
      }
    }
  }

  const rankThresholds: { rank: number; required: number; battleRequired?: number }[] = [];
  if (options.route !== "skip") {
    const music = options.songId !== null
      ? optionalTable(data, "MasterLiveMusic").find((row) => row.id === options.songId)
      : undefined;
    const rankGroup = music?.liveScoreRankGroup ?? music?.scoreRankRewardGroup ?? music?.scoreRankGroup;
    const rankRows = optionalTable(data, "MasterLiveScoreRank");
    for (const row of rankRows) {
      if (rankGroup !== undefined && row.group !== undefined && row.group !== rankGroup) continue;
      const rank = typeof row.liveScoreRank === "number"
        ? row.liveScoreRank
        : typeof row.scoreRank === "number"
          ? row.scoreRank
          : typeof row.rank === "number"
            ? row.rank
            : null;
      const required = typeof row.requiredScore === "number" ? row.requiredScore : typeof row.score === "number" ? row.score : null;
      const battleRequired = typeof row.battleLiveRequiredScore === "number"
        ? row.battleLiveRequiredScore
        : typeof row.battleRequiredScore === "number"
          ? row.battleRequiredScore
          : undefined;
      if (rank !== null && required !== null) {
        rankThresholds.push({ rank, required, ...(battleRequired !== undefined ? { battleRequired } : {}) });
      }
    }
  }

  return parkingPlaysFromRules({
    route: options.route,
    challenge: options.challenge,
    consumption: options.consumption,
    bonusBp: options.bonusBp,
    scoreMin: options.scoreMin,
    scoreMax: options.scoreMax,
    ...(options.battle !== undefined ? { battle: options.battle } : {}),
    ...(options.players !== undefined ? { players: options.players } : {}),
    ...(options.othersAverageScore !== undefined ? { othersAverageScore: options.othersAverageScore } : {}),
    basePointsByRank,
    cpByRank,
    boostRates,
    rankThresholds,
    skipRank,
    ...(options.includeAllBoosts !== undefined ? { includeAllBoosts: options.includeAllBoosts } : {}),
  });
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function pairCounts(target: number, coins: readonly number[]): number[] | null {
  let best: number[] | null = null;
  let count = Infinity;
  for (let i = 0; i < coins.length; i++) {
    const a = coins[i]!;
    if (target % a === 0 && target / a < count) {
      best = coins.map((_, at) => (at === i ? target / a : 0));
      count = target / a;
    }
    for (let j = i + 1; j < coins.length; j++) {
      const b = coins[j]!;
      const g = gcd(a, b);
      if (target % g !== 0) continue;
      let oldR = a / g;
      let r = b / g;
      let oldS = 1;
      let s = 0;
      while (r !== 0) {
        const q = Math.floor(oldR / r);
        [oldR, r, oldS, s] = [r, oldR - q * r, s, oldS - q * s];
      }
      const modulus = BigInt(b / g);
      const x = Number((((BigInt(target / g) * BigInt(oldS)) % modulus) + modulus) % modulus);
      const y = (target - a * x) / b;
      if (y >= 0 && x + y < count) {
        best = coins.map((_, at) => (at === i ? x : at === j ? y : 0));
        count = x + y;
      }
    }
  }
  return best;
}

/**
 * Exact reachability over the integer event-PT reward lattice (`target >= 0`).
 * Returns an exact minimum-play plan when reachable, plus the nearest totals below and above.
 */
export function parkingPlan(target: number, plays: readonly DeckParkingPlay[]): DeckParkingResult {
  const validPlays = plays.filter(
    (play) =>
      Number.isSafeInteger(play.points) &&
      play.points > 0 &&
      Number.isFinite(play.scoreMin) &&
      Number.isFinite(play.scoreMax) &&
      play.scoreMin <= play.scoreMax,
  );
  // Prefer fewer boosts/CP and lower score rank when two plays settle to the exact same PT.
  const options = [...validPlays]
    .sort((a, b) => a.points - b.points || a.boosts - b.boosts || a.cpCost - b.cpCost || a.rank - b.rank)
    .filter((play, i, rows) => i === 0 || play.points !== rows[i - 1]!.points);

  const buildPlan = (counts: readonly number[]): DeckParkingPlan => {
    const steps = counts
      .flatMap((count, i) => (count > 0 ? [{ play: options[i]!, count }] : []))
      .sort((a, b) => b.play.points - a.play.points);
    return {
      points: steps.reduce((sum, step) => sum + step.count * step.play.points, 0),
      plays: steps.reduce((sum, step) => sum + step.count, 0),
      totalBoosts: steps.reduce((sum, step) => sum + step.count * step.play.boosts, 0),
      totalCpCost: steps.reduce((sum, step) => sum + step.count * step.play.cpCost, 0),
      totalCpGain: steps.reduce((sum, step) => sum + step.count * step.play.cpGain, 0),
      steps,
    };
  };

  const empty = buildPlan(options.map(() => 0));
  if (!Number.isFinite(target) || target <= 0) {
    return target === 0 ? { exact: empty, below: empty, above: empty } : { exact: null, below: empty, above: null };
  }
  const cleanTarget = Math.trunc(target);
  if (cleanTarget !== target || options.length === 0) {
    return { exact: null, below: empty, above: null };
  }

  const unit = options.map((row) => row.points).reduce(gcd);
  const coins = options.map((row) => row.points / unit);
  const floor = Math.floor(cleanTarget / unit);
  const ceil = Math.ceil(cleanTarget / unit);
  const minimum = coins[0]!;

  if (floor < minimum) {
    return {
      exact: null,
      below: empty,
      above: buildPlan(coins.map((_, i) => (i === 0 ? 1 : 0))),
    };
  }

  if (ceil <= 200_000) {
    const limit = ceil + minimum;
    const counts = new Int32Array(limit + 1).fill(0x3fffffff);
    const previous = new Int16Array(limit + 1).fill(-1);
    counts[0] = 0;
    for (let amount = minimum; amount <= limit; amount++) {
      for (let i = 0; i < coins.length && coins[i]! <= amount; i++) {
        const value = counts[amount - coins[i]!]! + 1;
        if (value < counts[amount]!) {
          counts[amount] = value;
          previous[amount] = i;
        }
      }
    }
    const reconstruct = (amount: number): DeckParkingPlan => {
      const result = coins.map(() => 0);
      let cursor = amount;
      while (cursor > 0) {
        const i = previous[cursor]!;
        result[i]!++;
        cursor -= coins[i]!;
      }
      return buildPlan(result);
    };
    let below = floor;
    let above = ceil;
    while (below > 0 && previous[below] === -1) below--;
    while (above <= limit && previous[above] === -1) above++;
    const exact = floor === ceil && below === floor ? reconstruct(floor) : null;
    return {
      exact,
      below: exact ?? reconstruct(below),
      above: exact ?? (above <= limit ? reconstruct(above) : null),
    };
  }

  const lower = pairCounts(floor, coins);
  const upper = ceil === floor ? lower : pairCounts(ceil, coins);
  if (lower && upper) {
    const below = buildPlan(lower);
    const above = buildPlan(upper);
    return { exact: floor === ceil ? below : null, below, above };
  }

  interface LatticeNode {
    residue: number;
    amount: number;
    count: number;
    previous: LatticeNode | null;
    coin: number;
  }
  const root: LatticeNode = { residue: 0, amount: 0, count: 0, previous: null, coin: -1 };
  const known = new Map<number, LatticeNode>([[0, root]]);
  const heap: LatticeNode[] = [root];
  const push = (node: LatticeNode) => {
    let at = heap.length;
    heap.push(node);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (heap[parent]!.amount <= node.amount) break;
      heap[at] = heap[parent]!;
      at = parent;
    }
    heap[at] = node;
  };
  while (heap.length > 0) {
    const node = heap[0]!;
    const tail = heap.pop()!;
    if (heap.length > 0) {
      let at = 0;
      while (at * 2 + 1 < heap.length) {
        let child = at * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]!.amount < heap[child]!.amount) child++;
        if (heap[child]!.amount >= tail.amount) break;
        heap[at] = heap[child]!;
        at = child;
      }
      heap[at] = tail;
    }
    if (known.get(node.residue) !== node) continue;
    for (let i = 1; i < coins.length; i++) {
      const amount = node.amount + coins[i]!;
      const residue = amount % minimum;
      const old = known.get(residue);
      if (
        amount > ceil + minimum ||
        (old && (old.amount < amount || (old.amount === amount && old.count <= node.count + 1)))
      ) {
        continue;
      }
      const next: LatticeNode = { residue, amount, count: node.count + 1, previous: node, coin: i };
      known.set(residue, next);
      push(next);
    }
  }

  let belowNode = root;
  let belowAmount = 0;
  let aboveNode = root;
  let aboveAmount = Math.ceil(ceil / minimum) * minimum;
  for (const node of known.values()) {
    if (node.amount <= floor) {
      const amount = node.amount + Math.floor((floor - node.amount) / minimum) * minimum;
      if (amount > belowAmount) {
        belowAmount = amount;
        belowNode = node;
      }
    }
    const amount = node.amount + Math.max(0, Math.ceil((ceil - node.amount) / minimum)) * minimum;
    if (amount < aboveAmount) {
      aboveAmount = amount;
      aboveNode = node;
    }
  }

  const fromLattice = (start: LatticeNode, amount: number): DeckParkingPlan => {
    const counts = coins.map(() => 0);
    counts[0] = (amount - start.amount) / minimum;
    let cursor: LatticeNode | null = start;
    while (cursor.previous) {
      counts[cursor.coin]!++;
      cursor = cursor.previous;
    }
    for (let i = coins.length - 1; i > 0; i--) {
      const common = gcd(minimum, coins[i]!);
      const batch = coins[i]! / common;
      const repeats = Math.floor(counts[0]! / batch);
      counts[0]! -= repeats * batch;
      counts[i]! += repeats * (minimum / common);
    }
    return buildPlan(counts);
  };

  const below = fromLattice(belowNode, belowAmount);
  const above = fromLattice(aboveNode, aboveAmount);
  return { exact: below.points === cleanTarget ? below : null, below, above };
}
