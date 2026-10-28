import { parseRequest } from "./clock";
import { adaptData, optionalTable, table, type DeckData } from "./data";
import { adaptAccount, type AccountInput } from "./account";
import { adaptRequest, CAPABILITIES, HANEOKA_COMMIT, HANEOKA_PATCH_SHA, type RecommendationRequest } from "./request";
import { HaneokaWasm } from "./wasm";
let engine: HaneokaWasm | null = null;
export default async function init(options: { module_or_path: BufferSource }) {
  engine = await HaneokaWasm.create(options.module_or_path);
}
function orders(): number[][] {
  const result: number[][] = [];
  function visit(order: number[]) {
    if (order.length === 5) { result.push(order); return; }
    for (let i = 0; i < 5; i++) if (!order.includes(i)) visit([...order, i]);
  }
  visit([]); return result;
}
const ORDERS = orders();
function id(key: string): number { return Number(key.slice(1)); }
interface EngineAggregateSong {
  song: { songId: number; difficulty: number; baseSongId?: number };
  power: number;
  score: { mean: number; min: number; median: number; max: number };
}
interface EngineHit { song?: { songId: number; difficulty: number; baseSongId?: number; arenaMusicId?: number } | null; aggregate?: { kind: "mean"; songs: EngineAggregateSong[] }; lexVector?: string[]; members: string[]; snaps: (string | null)[]; power: number; key: number; skipScore?: number; score?: { orders: number[]; mean?: number } | null; event?: { mean: number; rewardSum: number | string; orders: number; selectedOrder?: number; sampled?: boolean; lower?: number; upper?: number }; levels?: { sum: string; terms: string[]; lower?: number; upper?: number; termBounds?: { lower: number; upper: number }[] }[] }
interface EngineResponse { results: { proven: boolean; bound: number | null; sampled?: boolean; hits?: EngineHit[] }[]; overall: EngineHit[]; elapsedMs: number | null }
function answer(response: EngineResponse, request: RecommendationRequest, coversAllOwnedCards: boolean, final: boolean, coverage?: number, seeds?: Pick<EngineHit, "members" | "snaps" | "song">[]) {
  const rows = response.results ?? [];
  const sampled = (response.overall ?? []).some(hit => hit.event?.sampled === true) || rows.some(row => row.sampled === true);
  const proven = final && !sampled && rows.length > 0 && rows.every(row => row.proven === true);
  const teams = (response.overall ?? []).map((hit, index) => {
    const members: number[] = hit.members.map(id), snaps: (number | null)[] = hit.snaps.map((key: string | null) => key === null ? null : id(key));
    const scores: number[] = hit.score?.orders ?? [];
    const ranked = scores.map((score, i) => ({ score, order: ORDERS[i]!.map(slot => members[slot]) })).sort((a, b) => a.score - b.score);
    const values = ranked.length === 120 ? { count: 120, min: ranked[0], median: {
      score: (ranked[59]!.score + ranked[60]!.score) / 2, order: ranked[59]!.score === ranked[60]!.score ? ranked[59]!.order : [],
    }, max: ranked[119] } : null;
    const reward = ["eventPoints", "eventItems", "challengePoints", "combined"].includes(request.metric?.kind ?? "");
    const combined = request.metric?.kind === "combined";
    const settlement = hit.event;
    if (reward && (!settlement || !(typeof settlement.rewardSum === "number" ? Number.isSafeInteger(settlement.rewardSum) : combined && /^-?\d+$/.test(settlement.rewardSum)) || !Number.isSafeInteger(settlement.orders) || settlement.orders < 1))
      throw new Error("haneoka-reward-certificate");
    const sampledReward = settlement?.sampled === true;
    if (sampledReward && (!Number.isFinite(settlement!.lower) || !Number.isFinite(settlement!.upper)
      || settlement!.lower! > Number(settlement!.rewardSum) / settlement!.orders || settlement!.upper! < Number(settlement!.rewardSum) / settlement!.orders))
      throw new Error("haneoka-reward-interval");
    const payoff = (sum: number | string, lower = settlement?.lower, upper = settlement?.upper) => ({ score: Number(sum) / settlement!.orders,
      exact: sampledReward ? null : { numerator: String(sum), denominator: String(settlement!.orders) },
      interval: sampledReward ? { lower: lower!, upper: upper! } : null });
    const maximumReward = reward && request.aggregation === "maximum" && request.goal.kind !== "skip";
    const selected = maximumReward ? settlement!.selectedOrder : undefined;
    if (maximumReward && (!Number.isInteger(selected) || selected! < 0 || selected! >= 120 || scores.length !== 120 || !sampledReward && settlement!.orders !== 1))
      throw new Error("haneoka-reward-order-certificate");
    const bestOrder = maximumReward ? { score: scores[selected!]!, payoff: Number(settlement!.rewardSum) / settlement!.orders, order: ORDERS[selected!]!.map(slot => members[slot]) } : values?.max ?? null;
    const pair = (i: number) => ({ member: members[i], snap: snaps[i] });
    return {
      rank: index + 1, rankCertified: proven, leader: pair(0), others: [1, 2, 3, 4].map(pair),
      power: hit.power, value: { score: request.goal.kind === "skip" ? hit.skipScore! : maximumReward ? bestOrder!.score : reward ? hit.score!.mean! : hit.key, exact: maximumReward && !sampledReward ? { numerator: String(bestOrder!.score), denominator: "1" } : null, interval: null,
        payoff: reward ? payoff(settlement!.rewardSum) : null }, orders: maximumReward || sampledReward ? null : values,
      ...(combined ? { levels: hit.levels!.map(level => ({ value: payoff(level.sum, level.lower, level.upper), terms: level.terms.map((sum, i) => payoff(sum, level.termBounds?.[i]?.lower, level.termBounds?.[i]?.upper)) })) } : {}),
      bestOrder: sampledReward && !maximumReward ? null : bestOrder,
      ...(hit.song && typeof hit.song.songId === "number" ? { song: { musicId: hit.song.baseSongId ?? hit.song.songId, difficulty: ["easy", "normal", "hard", "expert"][hit.song.difficulty] } } : {}),
      ...(hit.aggregate?.kind === "mean" && Array.isArray(hit.aggregate.songs) ? {
        aggregate: {
          kind: "mean" as const,
          songs: hit.aggregate.songs.map(part => ({
            song: { musicId: part.song.baseSongId ?? part.song.songId, difficulty: ["easy", "normal", "hard", "expert"][part.song.difficulty]! },
            power: part.power,
            mean: part.score.mean,
            min: part.score.min,
            median: part.score.median,
            max: part.score.max,
          })),
        },
      } : {}),
      layout: { members: [members[1], members[2], members[0], members[3], members[4]],
        snaps: [snaps[1], snaps[2], snaps[0], snaps[3], snaps[4]] },
    };
  });
  const bound = rows.length === 1 && Number.isFinite(rows[0]!.bound) ? rows[0]!.bound : null;
  const scopedIds = request.goal.multiSong === "mean" ? undefined : (request.goal.musicIds ?? request.goal.challengeMusicIds ?? request.goal.arenaMusicIds);
  const multiArenaIndividual = Array.isArray(request.goal.songs) && request.goal.songs.length > 1 && request.goal.arena?.mode !== "shared";
  const coverageTotal = scopedIds ? scopedIds.length : multiArenaIndividual ? request.goal.songs!.length : null;
  return JSON.stringify({
    format: "ournotes-deck.account-recommendation/1", status: "ok", final, missing: [], errors: [],
    ...(seeds ? { continuation: { teams: seeds.map(hit => ({ song: hit.song, members: hit.members, snaps: hit.snaps })) } } : {}),
    engine: { name: "Haneoka", commit: HANEOKA_COMMIT, patchSha256: HANEOKA_PATCH_SHA, source: "https://github.com/haneoka-gakuen/ournotes-team-builder" },
    result: { phase: proven ? "done" : "search", elapsedMs: response.elapsedMs ?? null, teams,
      account: { cards: { coversAllOwnedCards } },
      optimality: { proven, lowerBound: teams[0]?.value.payoff?.interval?.lower ?? teams[0]?.value.payoff?.score ?? teams[0]?.value.score ?? null, upperBound: bound, fraction: null },
      ...(coverageTotal !== null ? {
        coverage: { total: coverageTotal,
          covered: coverage ?? rows.filter(row => row.hits?.length).length, proven: rows.filter(row => row.proven).length } } : {}),
      goal: request.goal, metric: request.metric ?? { kind: "power" }, aggregation: request.aggregation ?? "expected",
      ...(sampled ? { rewardSampling: { kind: "fixedRoots", rootSeeds: [0, 1, 2, 3] } } : {}),
      exitReason: final && sampled ? "sampled" : final && !proven ? "timeLimit" : proven ? "complete" : null },
  });
}
/** The existing Moenotes Worker supplies its already verified dataset hash alongside the unchanged dataset bytes. */
export class DeckSolver {
  readonly datasetId: string;
  private readonly data: DeckData;
  private readonly handle: number;
  constructor(bytes: Uint8Array, options: { datasetId: string }) {
    if (!engine) throw new Error("haneoka-not-initialized");
    this.datasetId = options.datasetId;
    this.data = JSON.parse(new TextDecoder().decode(bytes));
    this.handle = engine.invoke<{ handle: number }>({ op: "create", data: adaptData(this.data, this.datasetId) }).handle;
  }
  capabilities() { return JSON.stringify(CAPABILITIES); }
  recommend(accountJson: string, requestJson: string, progress?: (json: string) => void, intervalMs = 250, seedJson?: string): string {
    const started = performance.now();
    const account = JSON.parse(accountJson) as AccountInput;
    let request: RecommendationRequest;
    let converted: ReturnType<typeof adaptRequest>;
    try { request = parseRequest(requestJson); converted = adaptRequest(this.data, request); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("haneoka-")) throw error;
      return JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "invalid", missing: [],
        errors: [{ path: "request", code: "unsupported_request", message: error.message }], result: null });
    }
    const box = adaptAccount(this.data, account, request, this.datasetId);
    if (box.missing.length || box.errors.length) return JSON.stringify({
      format: "ournotes-deck.account-recommendation/1", final: true,
      status: box.errors.length ? "invalid" : "incomplete", missing: box.missing, errors: box.errors, result: null,
    });
    let last = -Infinity;
    const songs = "songs" in converted.goal ? converted.goal.songs ?? [] : [];
    const gekiso = converted.goal.kind === "gekiso" || converted.goal.kind === "event" && "gekiso" in converted.goal;
    const musics = new Map((gekiso ? table(this.data, "MasterLiveMusic") : []).map(row => [row.id, row]));
    const arenas = new Map((request.goal.kind === "arenaLive" ? optionalTable(this.data, "MasterArenaMusic") : []).map(row => [row.id, row]));
    const overrideMissions = request.goal.arena?.missions ?? request.goal.songRules?.missions;
    const luck = gekiso && songs.some(song => {
      if (!song) return false;
      const arena = arenas.get("arenaMusicId" in song ? song.arenaMusicId : undefined);
      const music = musics.get("baseSongId" in song ? song.baseSongId : song.songId);
      return ["gekisouMission1", "gekisouMission2", "gekisouMission3"].some((field, idx) => (overrideMissions?.[idx] || arena?.[field] || music?.[field]) === 2);
    });
    const reserve = luck ? Math.min(40, converted.timeLimitMs ?? 0) : 0;
    const deadline = converted.timeLimitMs === null ? Infinity : performance.timeOrigin + started + converted.timeLimitMs - reserve;
    const warm: EngineHit[] = [];
    const candidates = new Map<string, EngineHit>();
    const covered = new Set<string>();
    const retainRewards = converted.goal.kind === "event" && "gekiso" in converted.goal || !!(request.goal.multiSong !== "mean" && (request.goal.musicIds ?? request.goal.challengeMusicIds ?? request.goal.arenaMusicIds)) || (Array.isArray(request.goal.songs) && request.goal.songs.length > 1 && request.goal.arena?.mode !== "shared");
    const combined = request.metric?.kind === "combined";
    const identity = (hit: EngineHit) => JSON.stringify([hit.song, combined ? hit.members : [...hit.members].sort(), ...(combined ? [hit.snaps] : [])]);
    const compare = (a: EngineHit, b: EngineHit) => {
      if (combined && a.lexVector && b.lexVector) for (let i = 0; i < a.lexVector.length; i++) {
        const av = BigInt(a.lexVector[i]!) * BigInt(b.event!.orders), bv = BigInt(b.lexVector[i]!) * BigInt(a.event!.orders);
        if (av !== bv) return av > bv ? -1 : 1;
      }
      return b.key - a.key || (retainRewards ? b.power - a.power : 0);
    };
    const remember = (hits: EngineHit[]) => {
      for (const hit of hits) {
        const key = identity(hit), previous = candidates.get(key);
        if (!previous || compare(hit, previous) < 0) candidates.set(key, hit);
      }
      const bySong = new Map<string, EngineHit[]>();
      for (const hit of candidates.values()) {
        const key = JSON.stringify(hit.song ?? null);
        const group = bySong.get(key) ?? [];
        group.push(hit); bySong.set(key, group);
      }
      candidates.clear();
      for (const hits of bySong.values()) for (const hit of hits.sort(compare).slice(0, converted.k)) candidates.set(identity(hit), hit);
    };
    const mergeWarm = (hits: EngineHit[]) => {
      if (!warm.length) return hits;
      const rosters = new Map<string, EngineHit>();
      for (const hit of [...warm, ...hits]) {
        const key = identity(hit);
        if (!rosters.has(key) || compare(hit, rosters.get(key)!) < 0) rosters.set(key, hit);
      }
      return [...rosters.values()].sort(compare).slice(0, converted.k);
    };
    engine!.onProgress = value => {
      const now = performance.now();
      const current = (value.hits ?? []) as EngineHit[];
      remember(current);
      for (const hit of current) if (hit.song) covered.add(JSON.stringify(hit.song));
      const hits = mergeWarm(current);
      if (retainRewards) warm.splice(0, warm.length, ...hits);
      if (!progress || now - last < intervalMs) return;
      last = now;
      progress(answer({ overall: hits, results: [], elapsedMs: performance.now() - started }, request, box.coversAllOwnedCards, false, covered.size, [...candidates.values()]));
    };
    try {
      const prepared: ReturnType<typeof adaptRequest> & { members: typeof box.members; snaps: typeof box.snaps; player: typeof box.player;
        unknownPolicy: string; deadline?: number; seeds?: Pick<EngineHit, "members" | "snaps" | "song">[] } = { ...converted, ...(Number.isFinite(deadline) ? { deadline } : {}),
        members: box.members, snaps: box.snaps, player: box.player, unknownPolicy: "min" };
      if (seedJson) {
        let previous; try { previous = JSON.parse(seedJson); } catch { throw new Error("haneoka-continuation"); }
        const hits = previous?.continuation?.teams;
        if (!Array.isArray(hits) || hits.length > Math.max(1, this.data.charts.length) * Math.max(10, converted.k) || hits.some(hit =>
          !hit || typeof hit !== "object" || !Array.isArray(hit.members) || hit.members.length !== 5 || !Array.isArray(hit.snaps) || hit.snaps.length !== 5
          || hit.members.some((key: unknown) => typeof key !== "string" || !/^m[1-9]\d*$/.test(key)) || hit.snaps.some((key: unknown) => key !== null && (typeof key !== "string" || !/^s[1-9]\d*$/.test(key))))) throw new Error("haneoka-continuation");
        prepared.seeds = hits.map(hit => ({ song: hit.song, members: hit.members, snaps: hit.snaps }));
        if ("songs" in prepared.goal && Array.isArray(prepared.goal.songs)) {
          const priority = new Map<string, number>();
          for (const [i, team] of (Array.isArray(previous.result?.teams) ? previous.result.teams : []).entries())
            if (typeof team?.song?.musicId === "number" && typeof team.song?.difficulty === "string")
              priority.set(`${team.song.musicId}:${["easy", "normal", "hard", "expert"].indexOf(team.song.difficulty)}`, i);
          const position = (song: typeof prepared.goal.songs[number]) => song ? priority.get(`${"baseSongId" in song ? song.baseSongId : song.songId}:${song.difficulty}`) ?? Infinity : Infinity;
          prepared.goal.songs = [...prepared.goal.songs].sort((a, b) => position(a) - position(b));
        }
      }
      if (request.goal.kind === "freeLive" && request.metric?.kind === "combined" && !seedJson
        && performance.timeOrigin + performance.now() < deadline) {
        const proposals = engine!.invoke<EngineResponse>({ op: "run", handle: this.handle, charts: [converted.charts[0]!],
          request: { ...prepared, goal: { kind: "score", songs: [converted.charts[0]!.song], criterion: "max", play: converted.goal.play },
            deadline: Math.min(deadline, performance.timeOrigin + performance.now() + 100) } });
        prepared.seeds = [...(prepared.seeds ?? []), ...proposals.overall.flatMap(team => converted.constraints.leader !== null ? [team]
          : team.members.map((_, leader) => {
            const order = [leader, ...[0, 1, 2, 3, 4].filter(slot => slot !== leader)];
            return { ...team, members: order.map(slot => team.members[slot]!), snaps: order.map(slot => team.snaps[slot]!) };
          }))];
      }
      if (converted.goal.kind === "gekiso" && luck && !seedJson && request.goal.arena?.mode !== "shared" && request.goal.multiSong !== "mean"
        && performance.timeOrigin + performance.now() < deadline) {
        const song = converted.charts[0]!.song;
        const arena = "arena" in converted.goal ? converted.goal.arena : undefined;
        const proposals = engine!.invoke<EngineResponse>({ op: "run", handle: this.handle, charts: [converted.charts[0]!],
          request: { ...prepared, goal: { kind: "power", song, challengeEventId: null, ...(arena ? { arena } : {}) },
            deadline: Math.min(deadline, performance.timeOrigin + performance.now() + 100) } });
        for (const team of proposals.overall.slice(0, 1)) {
          if (performance.timeOrigin + performance.now() >= deadline) break;
          let preview: { power: number; score: { mean: number; max: number; orders: number[] } };
          try {
            preview = engine!.invoke<{ evaluations: typeof preview[] }>({
              op: "evaluateAll", handle: this.handle, charts: [converted.charts[0]!], request: { ...prepared,
                ...(converted.songRules ? { songRules: converted.songRules } : {}),
                team: { members: team.members, snaps: team.snaps, leader: team.members[0] }, songs: [song],
                gekiso: { accuracy: converted.goal.accuracy, rank: converted.goal.rank, seeds: 0, ...(arena ? { arena } : {}) }, event: null } }).evaluations[0]!;
          } catch (error) {
            if (error instanceof Error && error.message === "search-deadline") break;
            throw error;
          }
          warm.push({ ...team, power: preview.power, score: preview.score,
            key: converted.goal.criterion === "max" ? preview.score.max : preview.score.mean });
          remember(warm);
          for (const hit of warm) if (hit.song) covered.add(JSON.stringify(hit.song));
          if (progress && warm.length && performance.now() - last >= intervalMs) {
            last = performance.now();
            progress(answer({ results: [], overall: mergeWarm([]), elapsedMs: performance.now() - started }, request, box.coversAllOwnedCards, false, covered.size, [...candidates.values()]));
          }
        }
        prepared.seeds = [...(prepared.seeds ?? []), ...warm];
      }
      const response = engine!.invoke<EngineResponse>({ op: "run", handle: this.handle, charts: converted.charts,
        request: prepared }, true);
      response.overall = mergeWarm(response.overall);
      for (const row of response.results) remember(row.hits ?? []);
      response.elapsedMs = performance.now() - started;
      return answer(response, request, box.coversAllOwnedCards, true, undefined, [...candidates.values()]);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("moenotes-") && error.message !== "haneoka-continuation" && !["combined-reward-levels", "combined-reward-range", "combined-item-lottery", "skip-score-nonmonotone"].includes(error.message)) throw error;
      return JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "invalid", missing: [],
        errors: [{ path: "request", code: "unsupported_request", message: error.message }], result: null });
    } finally { engine!.onProgress = null; }
  }
  free() { engine!.invoke({ op: "dispose", handle: this.handle }); }
}
