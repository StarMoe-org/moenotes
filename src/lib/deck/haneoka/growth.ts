import { parseRequest } from "./clock";
import { adaptAccount, type AccountInput } from "./account";
import { table, type DeckData } from "./data";
import { adaptRequest, type RecommendationRequest } from "./request";

export type DeckGrowthAction =
  | "level"
  | "levelCap"
  | "awake"
  | "rank"
  | "liveSkillLevel"
  | "gekisouSkillLevel"
  | "full";

export interface DeckGrowthTeamInput {
  readonly members: readonly number[];
  readonly snaps: readonly (number | null)[];
  readonly song?: { readonly musicId: number; readonly difficulty: string } | null;
  readonly aggregateSongs?: readonly { readonly musicId: number; readonly difficulty: string }[];
}

export interface DeckGrowthMetricSnapshot {
  readonly primary: number;
  readonly score: number | null;
  readonly power: number;
  readonly lexVector?: readonly string[];
  readonly orders?: number;
}

export interface DeckGrowthScenario {
  readonly slot: number;
  readonly kind: "member" | "snap";
  readonly cardId: number;
  readonly action: DeckGrowthAction;
  readonly from: number | null;
  readonly to: number | null;
  readonly after: DeckGrowthMetricSnapshot;
  readonly primaryGain: number;
  readonly scoreGain: number;
  readonly powerGain: number;
}

export interface DeckGrowthCardState {
  readonly slot: number;
  readonly kind: "member" | "snap";
  readonly cardId: number;
  readonly status: "upgradable" | "atCap" | "unknownState";
}

export interface DeckTeamGrowthReport {
  readonly format: "moenotes.deck-growth/1";
  readonly status: "ok" | "invalid" | "incomplete";
  readonly metricKind: string;
  readonly baseline: DeckGrowthMetricSnapshot | null;
  readonly scenarios: readonly DeckGrowthScenario[];
  readonly cards: readonly DeckGrowthCardState[];
  readonly elapsedMs: number;
  readonly message?: string;
}

interface RawGrowthHit {
  members: string[];
  snaps: (string | null)[];
  power: number;
  key: number;
  skipScore?: number;
  score?: { mean?: number; orders?: number[] } | null;
  event?: { mean: number; rewardSum: number | string; orders: number; selectedOrder?: number };
  levels?: { sum: string }[];
  lexVector?: string[];
  aggregate?: { kind: "mean"; songs: { power: number; score: { mean: number; max: number } }[] };
}

interface RawGrowthEngineResponse {
  overall: RawGrowthHit[];
}

export interface GrowthInvoker {
  run(charts: unknown[], request: Record<string, unknown>): RawGrowthEngineResponse;
}

const DIFFICULTIES = ["easy", "normal", "hard", "expert"];

function readMetric(request: RecommendationRequest, hit: RawGrowthHit): DeckGrowthMetricSnapshot {
  const metricKind = request.metric?.kind ?? "power";
  const reward = ["eventPoints", "eventItems", "challengePoints", "combined"].includes(metricKind);
  const maxAgg = request.aggregation === "maximum";
  const orders = hit.score?.orders ?? [];
  const bestOrderScore = orders.length ? Math.max(...orders) : null;
  const meanScore = typeof hit.score?.mean === "number"
    ? hit.score.mean
    : hit.aggregate?.songs.length
      ? hit.aggregate.songs.reduce((sum, item) => sum + item.score.mean, 0) / hit.aggregate.songs.length
      : null;
  const score = request.goal.kind === "skip"
    ? (typeof hit.skipScore === "number" ? hit.skipScore : null)
    : maxAgg && bestOrderScore !== null
      ? bestOrderScore
      : meanScore;

  let primary: number;
  if (request.goal.kind === "power") {
    primary = hit.power;
  } else if (reward && hit.event) {
    const denom = Math.max(1, hit.event.orders);
    if (metricKind === "combined" && hit.levels?.[0]?.sum !== undefined) {
      primary = Number(hit.levels[0].sum) / denom;
    } else {
      primary = Number(hit.event.rewardSum) / denom;
    }
  } else if (request.goal.kind === "skip") {
    primary = typeof hit.skipScore === "number" ? hit.skipScore : hit.key;
  } else {
    primary = hit.key;
  }

  return {
    primary,
    score,
    power: hit.power,
    ...(hit.lexVector ? { lexVector: hit.lexVector } : {}),
    ...(hit.event?.orders ? { orders: hit.event.orders } : {}),
  };
}

function compareLex(a: DeckGrowthMetricSnapshot, b: DeckGrowthMetricSnapshot): number {
  if (!a.lexVector || !b.lexVector || !a.orders || !b.orders) return 0;
  const len = Math.min(a.lexVector.length, b.lexVector.length);
  for (let i = 0; i < len; i++) {
    const av = BigInt(a.lexVector[i]!) * BigInt(b.orders);
    const bv = BigInt(b.lexVector[i]!) * BigInt(a.orders);
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

export function evaluateTeamGrowth(
  data: DeckData,
  datasetId: string,
  invoker: GrowthInvoker,
  accountJson: string,
  requestJson: string,
  teamJson: string,
): string {
  const started = performance.now();
  let account: AccountInput;
  let request: RecommendationRequest;
  let team: DeckGrowthTeamInput;
  let converted: ReturnType<typeof adaptRequest>;
  try {
    account = JSON.parse(accountJson) as AccountInput;
    request = parseRequest(requestJson);
    team = JSON.parse(teamJson) as DeckGrowthTeamInput;
    if (
      !team || typeof team !== "object"
      || !Array.isArray(team.members) || team.members.length !== 5
      || !Array.isArray(team.snaps) || team.snaps.length !== 5
      || team.members.some((id) => !Number.isInteger(id) || id <= 0)
      || team.snaps.some((id) => id !== null && (!Number.isInteger(id) || id <= 0))
    ) {
      throw new Error("haneoka-growth-team");
    }
    const singleSongGoal = (() => {
      const baseGoal = { ...request.goal };
      delete baseGoal.musicIds;
      delete baseGoal.challengeMusicIds;
      delete baseGoal.arenaMusicIds;
      if (team.aggregateSongs && team.aggregateSongs.length > 0 && baseGoal.kind === "arenaLive" && baseGoal.arena) {
        return { ...baseGoal, songs: team.aggregateSongs.map((s) => ({ musicId: s.musicId, difficulty: s.difficulty })) };
      }
      if (team.song && baseGoal.kind !== "power") {
        if (baseGoal.kind === "arenaLive" && baseGoal.arena) {
          return {
            ...baseGoal,
            arena: { ...baseGoal.arena, mode: "individual" },
            songs: [{ musicId: team.song.musicId, difficulty: team.song.difficulty }],
            musicId: team.song.musicId,
            difficulty: team.song.difficulty,
          };
        }
        return { ...baseGoal, musicId: team.song.musicId, difficulty: team.song.difficulty };
      }
      return baseGoal;
    })();
    converted = adaptRequest(data, {
      ...request,
      goal: singleSongGoal,
      k: 1,
      limits: { timeLimitMs: null },
    });
  } catch (error) {
    return JSON.stringify({
      format: "moenotes.deck-growth/1",
      status: "invalid",
      metricKind: "power",
      baseline: null,
      scenarios: [],
      cards: [],
      elapsedMs: performance.now() - started,
      message: error instanceof Error ? error.message : String(error),
    } satisfies DeckTeamGrowthReport);
  }

  const cleanRequest: RecommendationRequest = {
    ...request,
    constraints: {
      leader: team.members[0]!,
      includeMembers: [...team.members],
      excludeMembers: [],
      excludeSnaps: [],
      noSnaps: team.snaps.every((s) => s === null),
    },
  };
  const box = adaptAccount(data, account, cleanRequest, datasetId);
  if (box.missing.length || box.errors.length) {
    return JSON.stringify({
      format: "moenotes.deck-growth/1",
      status: box.errors.length ? "invalid" : "incomplete",
      metricKind: request.metric?.kind ?? "power",
      baseline: null,
      scenarios: [],
      cards: [],
      elapsedMs: performance.now() - started,
    } satisfies DeckTeamGrowthReport);
  }

  interface AdaptedMemberCard {
    key: string;
    cardId: number;
    level: number | null;
    rank: number | null;
    awake: number | null;
    liveSkillLevel: number | null;
    gekisoSkillLevel: number | null;
  }
  interface AdaptedSnapCard {
    key: string;
    cardId: number;
    level: number | null;
    rank: number | null;
  }

  const typedBoxMembers = box.members as AdaptedMemberCard[];
  const typedBoxSnaps = box.snaps as AdaptedSnapCard[];
  const memberKeys = team.members.map((id) => `m${id}`);
  const snapKeys = team.snaps.map((id) => (id === null ? null : `s${id}`));
  const teamMembers = memberKeys.map((key) => typedBoxMembers.find((m) => m.key === key));
  const nonNullSnapKeys = snapKeys.filter((key): key is string => key !== null);
  const teamSnaps = nonNullSnapKeys.map((key) => typedBoxSnaps.find((s) => s.key === key));
  if (teamMembers.some((m) => !m) || teamSnaps.some((s) => !s)) {
    return JSON.stringify({
      format: "moenotes.deck-growth/1",
      status: "invalid",
      metricKind: request.metric?.kind ?? "power",
      baseline: null,
      scenarios: [],
      cards: [],
      elapsedMs: performance.now() - started,
      message: "haneoka-growth-missing-team-card",
    } satisfies DeckTeamGrowthReport);
  }

  let pinnedCharts = converted.charts;
  let pinnedGoal: Record<string, unknown> = structuredClone(converted.goal) as Record<string, unknown>;
  if (team.song && !team.aggregateSongs?.length && "songs" in pinnedGoal && Array.isArray(pinnedGoal.songs) && pinnedGoal.songs.length > 1) {
    const diffIdx = DIFFICULTIES.indexOf(team.song.difficulty);
    const matchSong = (entry: { songId: number; difficulty: number; baseSongId?: number }) =>
      (entry.baseSongId ?? entry.songId) === team.song!.musicId && entry.difficulty === diffIdx;
    const filteredSongs = (pinnedGoal.songs as { songId: number; difficulty: number; baseSongId?: number }[]).filter(matchSong);
    const filteredCharts = converted.charts.filter((c) => matchSong(c.song));
    if (filteredSongs.length === 1 && filteredCharts.length === 1) {
      pinnedGoal = { ...pinnedGoal, songs: filteredSongs };
      pinnedCharts = filteredCharts;
    }
  }

  const buildRunPayload = (
    membersOverride: AdaptedMemberCard[],
    snapsOverride: AdaptedSnapCard[],
  ): Record<string, unknown> => ({
    ...converted,
    ...("aggregation" in converted && converted.aggregation === "mean" && (!("songs" in pinnedGoal) || !Array.isArray(pinnedGoal.songs) || pinnedGoal.songs.length <= 1)
      ? { aggregation: null }
      : {}),
    goal: pinnedGoal,
    members: membersOverride,
    snaps: snapsOverride,
    player: box.player,
    unknownPolicy: "min",
    constraints: {
      requiredMembers: [...memberKeys],
      excludedMembers: [],
      requiredSnaps: [...nonNullSnapKeys],
      excludedSnaps: [],
      leader: memberKeys[0]!,
      bindings: memberKeys.map((mKey, idx) => [mKey, snapKeys[idx]!]),
      noSnaps: nonNullSnapKeys.length === 0,
      minBonusPercent: null,
    },
    k: 1,
    timeLimitMs: null,
  });

  const baseMembers = teamMembers.map((m) => structuredClone(m!));
  const baseSnaps = teamSnaps.map((s) => structuredClone(s!));
  const baseResponse = invoker.run(pinnedCharts, buildRunPayload(baseMembers, baseSnaps));
  const baseHit = baseResponse.overall?.[0];
  if (!baseHit) {
    return JSON.stringify({
      format: "moenotes.deck-growth/1",
      status: "invalid",
      metricKind: request.metric?.kind ?? "power",
      baseline: null,
      scenarios: [],
      cards: [],
      elapsedMs: performance.now() - started,
      message: "haneoka-growth-empty-baseline",
    } satisfies DeckTeamGrowthReport);
  }

  const baseline = readMetric(request, baseHit);
  const memberMaster = new Map(table(data, "MasterMemberCard").map((row) => [Number(row.id), row]));
  const snapMaster = new Map(table(data, "MasterSupportCard").map((row) => [Number(row.id), row]));
  const awakeRows = table(data, "MasterMemberCardAwake");
  const levelLimitRows = table(data, "MasterMemberCardLevelLimit");
  const memberRankRows = table(data, "MasterMemberCardRank");
  const snapRankRows = table(data, "MasterSupportCardRank");
  const liveSkillRows = table(data, "MasterLiveSkillEffect");
  const gekisoSkillRows = table(data, "MasterGekisouSkillEffect");

  const goalKind = request.goal.kind;
  const powerOrSkip = goalKind === "power" || goalKind === "skip";
  const gekisoGoal = ["battleLive", "missionLive", "arenaLive"].includes(goalKind);

  const scenarios: DeckGrowthScenario[] = [];
  const cards: DeckGrowthCardState[] = [];

  const evalCandidate = (
    slot: number,
    kind: "member" | "snap",
    cardId: number,
    action: DeckGrowthAction,
    from: number | null,
    to: number | null,
    nextMembers: typeof baseMembers,
    nextSnaps: typeof baseSnaps,
  ) => {
    const res = invoker.run(pinnedCharts, buildRunPayload(nextMembers, nextSnaps));
    const hit = res.overall?.[0];
    if (!hit) return;
    const after = readMetric(request, hit);
    scenarios.push({
      slot,
      kind,
      cardId,
      action,
      from,
      to,
      after,
      primaryGain: after.primary - baseline.primary,
      scoreGain: (after.score ?? 0) - (baseline.score ?? 0),
      powerGain: after.power - baseline.power,
    });
  };

  for (let slot = 0; slot < 5; slot++) {
    const member = baseMembers[slot]!;
    const mRow = memberMaster.get(member.cardId);
    if (mRow) {
      const maxAwake = Math.max(
        1,
        ...awakeRows.filter((r) => r.group === mRow.memberCardAwakeGroup).map((r) => Number(r.awakeCount)),
      );
      const maxRank = Math.max(
        1,
        ...memberRankRows.filter((r) => r.group === mRow.memberCardRankGroup).map((r) => Number(r.rank)),
      );
      const levelLimitFor = (awakeStage: number) => {
        const found = levelLimitRows.find((r) => r.rarity === mRow.rarity && r.awakeCount === awakeStage);
        return found ? Number(found.limitLevel) : 90;
      };
      const maxLevel = levelLimitFor(maxAwake);
      const maxLiveSkill = Math.max(
        1,
        ...liveSkillRows.filter((r) => r.liveSkillID === mRow.liveSkillID).map((r) => Number(r.level)),
      );
      const maxGekisoSkill = Math.max(
        1,
        ...gekisoSkillRows.filter((r) => r.gekisouSkillID === mRow.gekisouSkillID).map((r) => Number(r.level)),
      );

      const hasUnknown =
        member.level === null
        || member.awake === null
        || member.rank === null
        || (!powerOrSkip && !gekisoGoal && member.liveSkillLevel === null)
        || (!powerOrSkip && gekisoGoal && member.gekisoSkillLevel === null);

      const countBefore = scenarios.length;
      if (member.level !== null && member.awake !== null) {
        const currentCap = levelLimitFor(member.awake);
        if (member.level < currentCap) {
          const plusOne = structuredClone(baseMembers);
          plusOne[slot] = { ...plusOne[slot]!, level: member.level + 1 };
          evalCandidate(slot, "member", member.cardId, "level", member.level, member.level + 1, plusOne, baseSnaps);
          if (member.level + 1 < currentCap) {
            const toCap = structuredClone(baseMembers);
            toCap[slot] = { ...toCap[slot]!, level: currentCap };
            evalCandidate(slot, "member", member.cardId, "levelCap", member.level, currentCap, toCap, baseSnaps);
          }
        }
      }
      if (member.awake !== null && member.awake < maxAwake) {
        const nextMembers = structuredClone(baseMembers);
        nextMembers[slot] = { ...nextMembers[slot]!, awake: member.awake + 1 };
        evalCandidate(slot, "member", member.cardId, "awake", member.awake, member.awake + 1, nextMembers, baseSnaps);
      }
      if (member.rank !== null && member.rank < maxRank) {
        const nextMembers = structuredClone(baseMembers);
        nextMembers[slot] = { ...nextMembers[slot]!, rank: member.rank + 1 };
        evalCandidate(slot, "member", member.cardId, "rank", member.rank, member.rank + 1, nextMembers, baseSnaps);
      }
      if (!powerOrSkip && !gekisoGoal && member.liveSkillLevel !== null && member.liveSkillLevel < maxLiveSkill) {
        const nextMembers = structuredClone(baseMembers);
        nextMembers[slot] = { ...nextMembers[slot]!, liveSkillLevel: member.liveSkillLevel + 1 };
        evalCandidate(slot, "member", member.cardId, "liveSkillLevel", member.liveSkillLevel, member.liveSkillLevel + 1, nextMembers, baseSnaps);
      }
      if (!powerOrSkip && gekisoGoal && member.gekisoSkillLevel !== null && member.gekisoSkillLevel < maxGekisoSkill) {
        const nextMembers = structuredClone(baseMembers);
        nextMembers[slot] = { ...nextMembers[slot]!, gekisoSkillLevel: member.gekisoSkillLevel + 1 };
        evalCandidate(slot, "member", member.cardId, "gekisouSkillLevel", member.gekisoSkillLevel, member.gekisoSkillLevel + 1, nextMembers, baseSnaps);
      }

      const alreadyFull =
        member.awake === maxAwake
        && member.level === maxLevel
        && member.rank === maxRank
        && (powerOrSkip || (gekisoGoal ? member.gekisoSkillLevel === maxGekisoSkill : member.liveSkillLevel === maxLiveSkill));

      if (!alreadyFull) {
        const fullMembers = structuredClone(baseMembers);
        fullMembers[slot] = {
          ...fullMembers[slot]!,
          awake: maxAwake,
          level: maxLevel,
          rank: maxRank,
          liveSkillLevel: powerOrSkip || gekisoGoal ? null : maxLiveSkill,
          gekisoSkillLevel: powerOrSkip || !gekisoGoal ? null : maxGekisoSkill,
        };
        evalCandidate(slot, "member", member.cardId, "full", null, null, fullMembers, baseSnaps);
      }

      cards.push({
        slot,
        kind: "member",
        cardId: member.cardId,
        status: alreadyFull ? "atCap" : hasUnknown && scenarios.length === countBefore + 1 ? "unknownState" : "upgradable",
      });
    }

    const snapKey = snapKeys[slot];
    if (snapKey !== null) {
      const snapIdx = baseSnaps.findIndex((s) => s.key === snapKey);
      const snap = snapIdx >= 0 ? baseSnaps[snapIdx] : undefined;
      const sRow = snap ? snapMaster.get(snap.cardId) : undefined;
      if (snap && sRow) {
        const groupRanks = snapRankRows.filter((r) => r.group === sRow.supportCardRankGroup);
        const maxRank = Math.max(1, ...groupRanks.map((r) => Number(r.rank)));
        const snapCapFor = (rankStage: number) => {
          const found = groupRanks.find((r) => r.rank === rankStage);
          return found ? Number(found.limitLevel) : 90;
        };
        const maxLevel = snapCapFor(maxRank);
        const hasUnknown = snap.level === null || snap.rank === null;
        const countBefore = scenarios.length;

        if (snap.level !== null && snap.rank !== null) {
          const currentCap = snapCapFor(snap.rank);
          if (snap.level < currentCap) {
            const plusOne = structuredClone(baseSnaps);
            plusOne[snapIdx] = { ...plusOne[snapIdx]!, level: snap.level + 1 };
            evalCandidate(slot, "snap", snap.cardId, "level", snap.level, snap.level + 1, baseMembers, plusOne);
            if (snap.level + 1 < currentCap) {
              const toCap = structuredClone(baseSnaps);
              toCap[snapIdx] = { ...toCap[snapIdx]!, level: currentCap };
              evalCandidate(slot, "snap", snap.cardId, "levelCap", snap.level, currentCap, baseMembers, toCap);
            }
          }
        }
        if (snap.rank !== null && snap.rank < maxRank) {
          const nextSnaps = structuredClone(baseSnaps);
          nextSnaps[snapIdx] = { ...nextSnaps[snapIdx]!, rank: snap.rank + 1 };
          evalCandidate(slot, "snap", snap.cardId, "rank", snap.rank, snap.rank + 1, baseMembers, nextSnaps);
        }

        const alreadyFull = snap.rank === maxRank && snap.level === maxLevel;
        if (!alreadyFull) {
          const fullSnaps = structuredClone(baseSnaps);
          fullSnaps[snapIdx] = { ...fullSnaps[snapIdx]!, rank: maxRank, level: maxLevel };
          evalCandidate(slot, "snap", snap.cardId, "full", null, null, baseMembers, fullSnaps);
        }

        cards.push({
          slot,
          kind: "snap",
          cardId: snap.cardId,
          status: alreadyFull ? "atCap" : hasUnknown && scenarios.length === countBefore + 1 ? "unknownState" : "upgradable",
        });
      }
    }
  }

  const combined = request.metric?.kind === "combined";
  scenarios.sort((a, b) => {
    if (combined) {
      const lex = compareLex(b.after, a.after);
      if (lex !== 0) return lex;
    }
    return (
      b.primaryGain - a.primaryGain
      || b.scoreGain - a.scoreGain
      || b.powerGain - a.powerGain
      || a.slot - b.slot
    );
  });

  return JSON.stringify({
    format: "moenotes.deck-growth/1",
    status: "ok",
    metricKind: request.metric?.kind ?? "power",
    baseline,
    scenarios,
    cards,
    elapsedMs: performance.now() - started,
  } satisfies DeckTeamGrowthReport);
}
