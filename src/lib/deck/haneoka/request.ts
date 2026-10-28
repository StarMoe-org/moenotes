import { rewardActive } from "./clock";
import { chartSource, integer, optionalTable, table, type DeckData } from "./data";
export interface RewardTermInput { kind: string; eventId?: number; resourceType?: number; resourceId?: number; weight: number }
export interface RecommendationRequest {
  format: string;
  goal: { kind: string; rank?: number; arenaMusicId?: number; musicIds?: number[]; challengeMusicIds?: number[]; arenaMusicIds?: number[]; multiSong?: "individual" | "mean"; eventParameter?: boolean; musicId?: number; difficulty?: string; challengeMusicId?: number;
    arena?: { bandId?: number; musicType?: number; missions?: number[]; mode?: string };
    songRules?: { musicType?: number; missions?: number[] };
    songs?: { musicId?: number; difficulty?: string }[];
    play?: { kind?: string; greatFraction?: number; justFraction?: number; missEvery?: number };
    accuracy?: { greatFraction?: number; justFraction?: number } };
  metric?: { kind: string; eventId?: number; consumption?: number; resourceType?: number; resourceId?: number; secondaryPriority?: string; levels?: RewardTermInput[][] };
  eventContext?: { rewardProjection?: boolean; resultClock?: { kind?: string; liveStartJstTicks?: number | null; serverNowJstTicks?: number | string } };
  room?: { players: number; othersAverageScore: number | null };
  aggregation?: "expected" | "maximum";
  eventIds?: number[];
  constraints?: { leader?: number | null; includeMembers?: (number | string)[]; excludeMembers?: (number | string)[];
    excludeSnaps?: (number | string)[]; noSnaps?: boolean };
  k: number;
  limits?: { timeLimitMs: number | null };
}
export const HANEOKA_COMMIT = "cf9b3c64f517e5033e0280e65a556bb7a67a83e3";
export const HANEOKA_PATCH_SHA = "b281a1b45f4069da2cf677f705087e8ca6f5468afff1dda7834247973c5c6d07";
export const CAPABILITIES = {
  goals: ["power", "freeLive", "challengeLive", "battleLive", "missionLive", "arenaLive", "skip"],
  metrics: { freeLive: ["score", "eventPoints", "eventItems", "challengePoints"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score", "eventPoints", "eventItems", "challengePoints"], missionLive: ["score", "eventPoints", "eventItems", "challengePoints"], arenaLive: ["score", "eventPoints", "eventItems", "challengePoints"], skip: ["score", "eventPoints", "eventItems", "challengePoints"] },
  aggregations: {
    expected: { freeLive: ["score", "eventPoints", "eventItems", "challengePoints"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score", "eventPoints", "eventItems", "challengePoints"], missionLive: ["score", "eventPoints", "eventItems", "challengePoints"], arenaLive: ["score", "eventPoints", "eventItems", "challengePoints"], skip: ["score", "eventPoints", "eventItems", "challengePoints"] },
    maximum: { freeLive: ["score", "eventPoints", "eventItems", "challengePoints"], challengeLive: ["score", "eventPoints", "eventItems"], battleLive: ["score", "eventPoints", "eventItems", "challengePoints"], missionLive: ["score", "eventPoints", "eventItems", "challengePoints"], arenaLive: ["score", "eventPoints", "eventItems", "challengePoints"], skip: ["score", "eventPoints", "eventItems", "challengePoints", "combined"] },
  },
  combinedMetric: { goals: ["freeLive", "challengeLive", "battleLive", "missionLive", "arenaLive", "skip"], kind: "combined", objective: "lexicographicWeightedExpectedSums", weights: "integer", maxLevels: 3, maxTerms: 9, maxWeight: 1_000_000_000 },
  eventItemRewards: { selection: "exactResultGrade", eventGroupField: "eventGroup", rowsPerGrade: 1, probabilityMarker: 10000 },
  crossSong: true, crossSongMean: true, songRules: true, resume: true, arenaRules: true, gekisouRank: true,
  accuracy: { great: true, just: true }, patternPlay: true, luckMissions: true, luckGreatConversions: true,
};
function adaptSingleRequest(data: DeckData, request: RecommendationRequest) {
  if (request.format !== "ournotes-deck.recommendation-request/2" || !CAPABILITIES.goals.includes(request.goal?.kind)
    || ![undefined, "score", "eventPoints", "eventItems", "challengePoints", "combined"].includes(request.metric?.kind) || ![undefined, "expected", "maximum"].includes(request.aggregation))
    throw new Error("haneoka-unsupported-request");
  const timeLimitMs = request.limits?.timeLimitMs ?? null;
  if (timeLimitMs !== null && (typeof timeLimitMs !== "number" || !Number.isFinite(timeLimitMs) || timeLimitMs < 0)) throw new Error("haneoka-budget");
  const kind: string = request.goal.kind;
  const rewards = ["eventPoints", "eventItems", "challengePoints", "combined"].includes(request.metric?.kind ?? "");
  const skip = kind === "skip";
  const gekiso = ["battleLive", "missionLive", "arenaLive"].includes(kind);
  if (rewards && (!["freeLive", "challengeLive", "skip", "battleLive", "missionLive", "arenaLive"].includes(kind)
    || gekiso && request.aggregation === "maximum" && request.metric?.kind === "combined"
    || request.aggregation === "maximum" && !skip && !["eventPoints", "eventItems", "challengePoints"].includes(request.metric!.kind)))
    throw new Error("haneoka-unsupported-reward-scene");
  if (rewards && ["battleLive", "arenaLive"].includes(kind) && (!request.room || !Number.isInteger(request.room.players) || request.room.players < 1 || request.room.players > 5
    || request.room.othersAverageScore !== null && (!Number.isInteger(request.room.othersAverageScore) || request.room.othersAverageScore < 0 || request.room.othersAverageScore > 2147483647)))
    throw new Error("haneoka-room");
  if (rewards && kind === "missionLive" && request.room !== undefined) throw new Error("haneoka-room");
  if (rewards && kind === "missionLive" && request.goal.rank !== undefined) throw new Error("haneoka-unsupported-rank");
  if (gekiso && request.goal.rank !== undefined && (!Number.isInteger(request.goal.rank) || request.goal.rank < 1 || request.goal.rank > 5)) throw new Error("haneoka-unsupported-rank");
  const rank = gekiso ? (request.goal.rank ?? 1) : 1;
  const parameterEvents = kind === "power" && request.goal.eventParameter ? request.eventIds ?? [] : [];
  if (parameterEvents.length > 1 || parameterEvents.some(id => !table(data, "MasterEvent").some(event => event.id === id)))
    throw new Error("haneoka-power-event");
  const arenaRule = kind === "arenaLive" && request.goal.arena !== undefined ? (() => {
    const raw = request.goal.arena;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("haneoka-arena-rule");
    const bandId = raw.bandId, musicType = raw.musicType, missions = raw.missions, mode = raw.mode;
    if (!Number.isInteger(bandId) || bandId! < 1 || bandId! > 5) throw new Error("haneoka-arena-band");
    if (!Number.isInteger(musicType) || !((musicType! >= 0 && musicType! <= 5) || musicType === 99)) throw new Error("haneoka-arena-type");
    if (!Array.isArray(missions) || missions.length !== 3 || missions.some(m => !Number.isInteger(m) || m < 0 || m > 3))
      throw new Error("haneoka-arena-missions");
    if (mode !== undefined && mode !== "shared" && mode !== "individual") throw new Error("haneoka-arena-mode");
    if (mode === "shared" && (rewards || request.aggregation === "maximum")) throw new Error("haneoka-arena-shared");
    return { bandId: bandId!, musicType: musicType!, missions: [missions[0]!, missions[1]!, missions[2]!], ...(mode ? { mode } : {}) };
  })() : null;
  const songRules = request.goal.songRules !== undefined ? (() => {
    if (kind === "power" || arenaRule !== null) throw new Error("haneoka-song-rules");
    const raw = request.goal.songRules;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("haneoka-song-rules");
    const musicType = raw.musicType ?? 0;
    const rawMissions = raw.missions ?? [0, 0, 0];
    if (!Number.isInteger(musicType) || !((musicType >= 0 && musicType <= 5) || musicType === 99)) throw new Error("haneoka-song-rules");
    if (!Array.isArray(rawMissions) || rawMissions.length !== 3 || rawMissions.some(m => !Number.isInteger(m) || m < 0 || m > 3))
      throw new Error("haneoka-song-rules");
    const missions: [number, number, number] = gekiso ? [rawMissions[0]!, rawMissions[1]!, rawMissions[2]!] : [0, 0, 0];
    return musicType !== 0 || missions.some(Boolean) ? { musicType, missions } : null;
  })() : null;
  const difficulty = ["easy", "normal", "hard", "expert"].indexOf(request.goal.difficulty ?? "");
  let musicId: unknown = request.goal.musicId, challengeEventId: number | null = null;
  const arena = kind === "arenaLive" && !arenaRule ? optionalTable(data, "MasterArenaMusic").find(row => row.id === request.goal.arenaMusicId) : null;
  if (kind === "arenaLive" && !arenaRule) {
    if (!arena) throw new Error("haneoka-arena-song");
    musicId = arena.liveMusicId;
  }
  if (kind === "challengeLive" || skip && request.goal.challengeMusicId !== undefined) {
    const challenge = table(data, "MasterChallengeMusic").find(row => row.id === request.goal.challengeMusicId);
    if (!challenge) throw new Error("haneoka-challenge-song");
    musicId = challenge.liveMusicId; challengeEventId = integer(challenge.eventId, "eventId");
  }
  const charts: { song: { songId: number; difficulty: number; baseSongId?: number; arenaMusicId?: number }; source: unknown }[] = [];
  let songs: { songId: number; difficulty: number; baseSongId?: number; arenaMusicId?: number }[] = [];
  let song: { songId: number; difficulty: number; baseSongId?: number; arenaMusicId?: number } | null = null;
  if (arenaRule && Array.isArray(request.goal.songs)) {
    if (!request.goal.songs.length || request.goal.songs.length > data.charts.length || rewards && request.goal.songs.length > 1)
      throw new Error("haneoka-arena-songs");
    const seen = new Set<string>();
    for (const item of request.goal.songs) {
      const diff = ["easy", "normal", "hard", "expert"].indexOf(item?.difficulty ?? "");
      if (!item || item.musicId == null || diff < 0) throw new Error("haneoka-song");
      const id = integer(item.musicId, "musicId");
      const pairKey = `${id}:${diff}`;
      if (seen.has(pairKey)) throw new Error("haneoka-arena-songs");
      seen.add(pairKey);
      const music = table(data, "MasterLiveMusic").find(row => row.id === id);
      if (!music) throw new Error("haneoka-song");
      if (Array.isArray(music.bandIDs) && music.bandIDs.length > 0 && !music.bandIDs.includes(arenaRule.bandId))
        throw new Error("haneoka-arena-song-band");
      const scoreId = integer(music[["easyID", "normalID", "hardID", "expertID"][diff]!], "scoreId");
      const entry = { songId: id, difficulty: diff };
      songs.push(entry);
      charts.push({ song: entry, source: chartSource(data, scoreId) });
    }
    song = songs[0]!;
  } else {
    song = musicId == null ? null : { songId: arena ? -integer(arena.id, "arenaId") : integer(musicId, "musicId"), difficulty: Math.max(0, difficulty), ...(arena ? { baseSongId: integer(musicId, "musicId"), arenaMusicId: integer(arena.id, "arenaId") } : {}) };
    if (kind !== "power") {
      if (!song || difficulty < 0) throw new Error("haneoka-song");
      const music = table(data, "MasterLiveMusic").find(row => row.id === musicId);
      if (!music) throw new Error("haneoka-song");
      if (arenaRule && Array.isArray(music.bandIDs) && music.bandIDs.length > 0 && !music.bandIDs.includes(arenaRule.bandId))
        throw new Error("haneoka-arena-song-band");
      const scoreId = integer(music[["easyID", "normalID", "hardID", "expertID"][difficulty]!], "scoreId");
      charts.push({ song, source: chartSource(data, scoreId) });
      songs = [song];
    }
  }
  const play: { greatFraction?: number; justFraction?: number; missEvery?: number } = request.goal.play ?? request.goal.accuracy ?? {};
  const great = play.greatFraction ?? 0;
  const just = play.justFraction ?? 1;
  if (![great, just].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
    || gekiso && great + just > 1) throw new Error("haneoka-accuracy");
  const criterion = request.aggregation === "maximum" ? "max" : "mean";
  const scoreGoal = kind === "power" || skip && !rewards ? { kind: skip ? "skip-score" as const : "power" as const, song, challengeEventId,
    ...(parameterEvents.length ? { parameterEventId: parameterEvents[0] }
      : skip && challengeEventId !== null && request.eventIds?.includes(challengeEventId) ? { parameterEventId: challengeEventId } : {}) }
    : gekiso ? { kind: "gekiso" as const, songs, criterion, rank, seeds: 0, ...(arenaRule ? { arena: arenaRule } : {}), accuracy: {
      great, just: great === 1 ? 0 : just / (1 - great), missEvery: play.missEvery ?? 0,
    } }
      : { kind: "score" as const, songs, criterion, challengeEventId, play: {
        kind: "custom", great, good: 0, bad: 0, miss: 0, missEvery: play.missEvery ?? 0,
      } };
  const key = (id: unknown, prefix: string) => prefix + integer(typeof id === "string" ? Number(id) : id, "constraint");
  const c = request.constraints ?? {};
  return {
    goal: rewards ? { ...eventGoal(data, request, song!, challengeEventId, "play" in scoreGoal ? scoreGoal.play : null),
      ...(arenaRule ? { arena: arenaRule } : {}),
      ...(scoreGoal.kind === "gekiso" ? { gekiso: { scene: kind, rank, accuracy: scoreGoal.accuracy }, room: request.room } : {}) } : scoreGoal, charts,
    constraints: {
      requiredMembers: (c.includeMembers ?? []).map((id: unknown) => key(id, "m")),
      excludedMembers: (c.excludeMembers ?? []).map((id: unknown) => key(id, "m")),
      requiredSnaps: [], excludedSnaps: (c.excludeSnaps ?? []).map((id: unknown) => key(id, "s")),
      leader: c.leader == null ? null : key(c.leader, "m"),
      noSnaps: c.noSnaps === true, bindings: [], minBonusPercent: null,
    },
    ...(songRules ? { songRules } : {}),
    k: integer(request.k, "k"), timeLimitMs,
  };
}

const CROSS_SONG_MEAN_KINDS = new Set(["freeLive", "challengeLive", "battleLive", "missionLive"]);

export function adaptRequest(data: DeckData, request: RecommendationRequest) {
  if (!request.goal || typeof request.goal !== "object") return adaptSingleRequest(data, request);
  const multiSong = request.goal.multiSong ?? "individual";
  if (multiSong !== "individual" && multiSong !== "mean") throw new Error("haneoka-cross-song-mean");
  const fields = ["musicIds", "challengeMusicIds", "arenaMusicIds"] as const;
  const supplied = fields.filter(field => request.goal[field] !== undefined);
  if (!supplied.length) {
    if (multiSong === "mean") throw new Error("haneoka-cross-song-mean");
    return adaptSingleRequest(data, request);
  }
  if (multiSong === "mean" && (request.aggregation === "maximum" || request.metric?.kind !== "score" || !CROSS_SONG_MEAN_KINDS.has(request.goal.kind))) {
    throw new Error("haneoka-cross-song-mean");
  }
  const field = supplied[0]!, ids = request.goal[field];
  const arenaWithRule = request.goal.kind === "arenaLive" && request.goal.arena !== undefined && request.goal.arena?.mode !== "shared";
  const wrongScope = field === "arenaMusicIds" ? request.goal.kind !== "arenaLive" || request.goal.arena !== undefined
    : field === "challengeMusicIds" ? !["challengeLive", "skip"].includes(request.goal.kind)
    : request.goal.kind === "challengeLive" || (request.goal.kind === "arenaLive" && !arenaWithRule) || request.goal.kind === "skip" && request.goal.challengeMusicId !== undefined;
  if (supplied.length !== 1 || wrongScope || request.goal.kind === "power" || !Array.isArray(ids) || !ids.length
    || ids.length > data.charts.length || new Set(ids).size !== ids.length || ids.some(id => !Number.isInteger(id) || id <= 0))
    throw new Error("haneoka-cross-song");
  const key = field === "musicIds" ? "musicId" : field === "challengeMusicIds" ? "challengeMusicId" : "arenaMusicId";
  const { songs: _songs, musicIds: _musicIds, challengeMusicIds: _challengeIds, arenaMusicIds: _arenaIds, multiSong: _multiSong, ...goalRest } = request.goal;
  const singles = ids.map(id => adaptSingleRequest(data, { ...request, goal: { ...goalRest, [key]: id } }));
  const first = singles[0]!;
  const songs = singles.map(single => "songs" in single.goal ? single.goal.songs![0]! : single.goal.song!);
  return { ...first, ...(multiSong === "mean" ? { aggregation: "mean" as const } : {}), goal: { ...first.goal, songs }, charts: singles.flatMap(single => single.charts) };
}

function eventGoal(data: DeckData, request: RecommendationRequest, song: { songId: number; difficulty: number },
  challengeEventId: number | null, play: unknown) {
  const metric = request.metric!, context = request.eventContext;
  // Projection keeps the reference event window and excludes persisted balances.
  const skip = request.goal.kind === "skip";
  if (context?.rewardProjection !== true || context.resultClock?.kind !== (skip ? "skip" : "played")
    || !skip && context.resultClock.liveStartJstTicks !== null || context.resultClock.serverNowJstTicks === undefined || metric.secondaryPriority !== undefined)
    throw new Error("haneoka-reward-context");
  const combined = metric.kind === "combined", levels = combined ? metric.levels : null;
  if (combined && (!Array.isArray(levels) || levels.length < 1 || levels.length > 3 || levels.flat().length > 9
    || levels.some(level => !Array.isArray(level) || !level.length || level.some(term => !term
      || !["eventPoints", "eventItems", "challengePoints"].includes(term.kind)
      || !Number.isSafeInteger(term.weight) || term.weight < 1 || term.weight > 1_000_000_000))))
    throw new Error("haneoka-combined-levels");
  if (combined && (metric.eventId !== undefined || metric.resourceType !== undefined || metric.resourceId !== undefined))
    throw new Error("haneoka-combined-fields");
  const terms = levels ? levels.flat() : [metric];
  const eventId = integer(terms[0]!.eventId, "eventId");
  if (terms.some(term => term.eventId !== eventId)) throw new Error("haneoka-combined-events");
  const event = table(data, "MasterEvent").find(row => row.id === eventId);
  if (!event || request.eventIds?.length !== 1 || request.eventIds[0] !== eventId
    || challengeEventId !== null && challengeEventId !== eventId) throw new Error("haneoka-reward-event");
  const consumption = integer(metric.consumption, "consumption"), challenge = challengeEventId !== null;
  if (!(challenge ? [200, 400, 800, 1600] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).includes(consumption))
    throw new Error("haneoka-unsupported-reward-consumption");
  const costField = challenge ? "consumedChallengePointCount" : "consumedLiveBoostCount";
  const boosts = table(data, challenge ? "MasterChallengeMusicBoostBonus" : "MasterLiveMusicBoostBonus",
    [costField, "eventPointRate", "liveMusicRewardRate"]).filter(row => row[costField] === consumption);
  if (consumption > 0 && boosts.length !== 1) throw new Error("haneoka-reward-boost-data");
  let skipRank: number | null = null;
  if (skip) {
    const parameter = table(data, "MasterParameter").find(row => row.id === "live_skip_result_score_rank");
    if (parameter?.type !== "String" || typeof parameter.value !== "string") throw new Error("haneoka-unsupported-skip-rank");
    const trim = (value: string) => value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
    const value = trim(parameter.value), names = ["None", "E", "D", "C", "B", "A", "S", "SS"];
    if (/^[+-]?\d+$/.test(value)) {
      const parsed = Number(value);
      skipRank = Number.isInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647 ? parsed : 0;
    } else {
      const ranks = value.split(",").map(name => names.indexOf(trim(name)));
      skipRank = ranks.includes(-1) ? 0 : ranks.reduce((rank, next) => rank | next, 0);
    }
  }
  if (terms.some(term => term.kind === "challengePoints")) {
    if (challenge) throw new Error("haneoka-challenge-spends-cp");
    const rows = table(data, "MasterLiveChallengePoint", ["scoreRank", "value"]);
    if (!rows.length || new Set(rows.map(row => row.scoreRank)).size !== rows.length
      || skipRank !== null && !rows.some(row => row.scoreRank === skipRank)) throw new Error("haneoka-reward-cp-table");
  }
  if (terms.some(term => term.kind === "eventPoints")) {
    const rows = table(data, challenge ? "MasterChallengeLiveEventPoint" : "MasterLiveEventPoint", ["group", "scoreRank", "value"])
      .filter(row => row.group === event[challenge ? "challengeLiveEventPointGroup" : "liveEventPointGroup"]);
    if (!rows.length || new Set(rows.map(row => row.scoreRank)).size !== rows.length
      || skipRank !== null && !rows.some(row => row.scoreRank === skipRank)) throw new Error("haneoka-reward-point-table");
  }
  const items = terms.filter(term => term.kind === "eventItems");
  if (items.length) {
    if (items.some(term => term.resourceType !== 1 || term.resourceId !== event.eventItemId || !term.resourceId))
      throw new Error("haneoka-reward-item");
    const group = event[challenge ? "challengeLiveEventRewardGroup" : "liveEventRewardGroup"];
    const rows = table(data, challenge ? "MasterChallengeLiveEventReward" : "MasterLiveEventReward",
      ["eventGroup", "scoreRank", "probability", "resourceType", "resourceId", "resourceCount"])
      .filter(row => row.eventGroup === group);
    const grades = new Set(rows.map(row => row.scoreRank));
    if (!rows.length || grades.size !== rows.length || skipRank !== null && !grades.has(skipRank) || rows.some(row => row.probability !== 10000
      || row.resourceType !== 1 || row.resourceId !== event.eventItemId)) throw new Error("haneoka-reward-item-table");
  }
  return { kind: "event" as const, route: skip ? "skip" : challenge ? "challenge" : "live", eventId, consumption, songs: [song],
    measure: combined ? "combined" : metric.kind === "eventItems" ? "items" : metric.kind === "challengePoints" ? "challenge-points" : "points",
    levels: levels?.map(level => level.map(term => ({ kind: ["eventPoints", "eventItems", "challengePoints"].indexOf(term.kind), weight: term.weight }))),
    criterion: request.aggregation === "maximum" ? "max" : "mean",
    rewardSemantics: "moenotes-v1", rewardActive: rewardActive(event.startAt, event.endAt, context.resultClock!.serverNowJstTicks!), challengeEventId, play };
}
