import { DIFFICULTIES, SCORE_RANKS, type Difficulty, type LengthSource, type ScoreRank } from "./ranking";
import { BEST_RANKS, RANK_MAX, formatRanks, parseRanks, type Scenario, type ScenarioId, type ScenarioSupport } from "./scenario";
import { axisGoal } from "./pareto";
import { parseSnapQuery, writeSnapQuery, type SnapQueryState } from "./snap-query";

/**
 * The chart data tool's choices live in the query, as on ournotes-player's chart data page (the page's language is
 * the site locale, its theme the site setting):
 *   ?v=rank|charts|guide &band=<id> &d=<difficulty>[,...] &q=<search>
 *   &r=efficiency|event|speed|level|notes|long|short|skip &sp=density|bpmMax|bpm   (ranking, speed measure)
 *   &len=bgm|chart &oh=<seconds> &x=<percent>[,...] &frontier                      (efficiency)
 *   &gk=free &rk=<r>[,<r>,<r>]                        (play scenario: Free Live, else Gekisou Live with a rank 1-5
 *                                                      per range; default Gekisou Live at rank 1 everywhere)
 *   &p=<power> &tr=<rank> &n=<players>                (event: rank chance; Gekisou Live room size, default 5)
 *   &ax=<figure> &ay=<figure>                                                      (scatter axes)
 *   &c=<scoreId>                                                                   (the chart detail open)
 */
export const VIEWS = ["rank", "charts", "guide"] as const;
export type View = typeof VIEWS[number];
export const RANKS = ["efficiency", "event", "speed", "level", "notes", "long", "short", "skip"] as const;
export type RankBy = typeof RANKS[number];
/** Rankings that need the deck statistics. */
export const EFF_RANKS: ReadonlySet<RankBy> = new Set(["efficiency", "event", "skip"]);
export const SPEEDS = ["density", "bpmMax", "bpm"] as const;
export type SpeedBy = typeof SPEEDS[number];
export const AXES = ["displayLevel", "density", "bpm", "bpmMax", "notes", "bgmMs", "perMinute", "rate", "base", "skip"] as const;
export type Axis = typeof AXES[number];
/** Scatter figures that need the deck statistics. */
export const EFF_AXES: ReadonlySet<Axis> = new Set(["perMinute", "rate", "base", "skip"]);
/** Skill values are entered in percent, up to X_MAX. */
export const SKILL_SLOTS = 5;
const DEFAULT_SKILLS = "100,100,100,100,100";

export interface ChartDataState extends SnapQueryState {
  view: View;
  band: string;
  diffs: Difficulty[];
  search: string;
  rankBy: RankBy;
  speedBy: SpeedBy;
  len: LengthSource;
  /** Seconds. */
  overhead: number;
  /** Percent per member. */
  skills: number[];
  frontier: boolean;
  power: number;
  target: ScoreRank;
  /** The play scenario (see `playScenario`): Gekisou Live at `ranks`, or Free Live. */
  mode: ScenarioId;
  /** Gekisou Live rank per range, 1..5. */
  ranks: number[];
  /** Percent of Great judgements over every note. */
  great: number;
  /** Percent of Just judgements inside the Just mission ranges (Gekisou Live). */
  just: number;
  /** Gekisou Live room size for the score ranks, 1..5. */
  room: number;
  ax: Axis;
  ay: Axis;
  xGoal: "min" | "max";
  yGoal: "min" | "max";
  chart: number | null;
}

/** What the defaults depend on: whether the file has deck statistics, and which scenarios it can show. */
export interface QueryContext {
  hasStats: boolean;
  support: Pick<ScenarioSupport, "free" | "ranks" | "just">;
}

const oneOf = <T extends string>(values: readonly T[], value: string | null): value is T => value !== null && (values as readonly string[]).includes(value);
const defaultRank = (ctx: QueryContext): RankBy => (ctx.hasStats ? "efficiency" : "speed");
const defaultY = (ctx: QueryContext): Axis => (ctx.hasStats ? "perMinute" : "density");
const pct = (value: string | null, fallback: number) => value === null || !Number.isFinite(Number(value)) ? fallback : Math.min(100, Math.max(0, Math.round(Number(value))));

/** The scenario the figures are computed for: the state's scenario with its accuracy. */
export function playScenario(state: Pick<ChartDataState, "mode" | "ranks" | "great" | "just">): Scenario {
  return { id: state.mode, ranks: state.ranks, just: state.just / 100, great: state.great / 100 };
}

/** The Gekisou Live room size the score ranks use: 0 (solo thresholds) in Free Live. */
export function roomSize(state: Pick<ChartDataState, "mode" | "room">): number {
  return state.mode === "battle" ? state.room : 0;
}

export function parseChartDataQuery(search: string, ctx: QueryContext): ChartDataState {
  const q = new URLSearchParams(search);
  const has = ctx.support;
  const skills = (q.get("x") || DEFAULT_SKILLS).split(",").map(Number).filter((x) => Number.isFinite(x) && x >= 0).slice(0, SKILL_SLOTS);
  while (skills.length < SKILL_SLOTS) skills.push(0);
  let rankBy: RankBy = oneOf(RANKS, q.get("r")) ? q.get("r") as RankBy : defaultRank(ctx);
  if (!ctx.hasStats && EFF_RANKS.has(rankBy)) rankBy = "speed";
  const ax = q.get("ax"), ay = q.get("ay"), view = q.get("v"), speed = q.get("sp"), target = q.get("tr");
  const parsedAx = oneOf(AXES, ax) ? ax : "displayLevel";
  const parsedAy = oneOf(AXES, ay) ? ay : defaultY(ctx);
  return {
    ...parseSnapQuery(q),
    view: oneOf(VIEWS, view) ? view : "rank",
    band: q.get("band") || "",
    diffs: (q.get("d") || "expert").split(",").filter((d): d is Difficulty => oneOf(DIFFICULTIES, d)),
    search: q.get("q") || "",
    rankBy,
    speedBy: oneOf(SPEEDS, speed) ? speed : "density",
    len: q.get("len") === "chart" ? "chart" : "bgm",
    overhead: Math.min(600, Math.max(0, Number(q.get("oh") ?? 30) || 0)),
    skills,
    frontier: q.has("frontier"),
    power: Math.max(0, Math.round(Number(q.get("p")) || 0)),
    target: oneOf(SCORE_RANKS, target) ? target : "SS",
    mode: q.get("gk") === "free" && has.free ? "free" : "battle",
    ranks: has.ranks ? parseRanks(q.get("rk")) : [...BEST_RANKS],
    great: pct(q.get("gr"), 0),
    just: has.just ? pct(q.get("jr"), 100) : 100,
    room: Math.min(RANK_MAX, Math.max(1, Math.round(Number(q.get("n")) || 5))),
    ax: parsedAx,
    ay: parsedAy,
    xGoal: q.get("xg") === "max" ? "max" : q.get("xg") === "min" ? "min" : axisGoal(parsedAx),
    yGoal: q.get("yg") === "min" ? "min" : q.get("yg") === "max" ? "max" : axisGoal(parsedAy),
    chart: Number(q.get("c")) || null,
  };
}

/** The query of a state, defaults left out; "" for the defaults. */
export function serializeChartDataQuery(state: ChartDataState, ctx: QueryContext): string {
  const p = new URLSearchParams();
  const put = (k: string, v: string | number | null, def?: string | number | null) => {
    if (v !== def && v !== "" && v !== null && v !== undefined) p.set(k, String(v));
  };
  put("v", state.view, "rank");
  put("band", state.band, "");
  put("d", state.diffs.join(","), "expert");
  put("q", state.search, "");
  put("r", state.rankBy, defaultRank(ctx));
  put("sp", state.speedBy, "density");
  put("len", state.len, "bgm");
  put("oh", state.overhead, 30);
  put("x", state.skills.join(","), DEFAULT_SKILLS);
  put("p", state.power, 0);
  put("tr", state.target, "SS");
  put("gk", state.mode, "battle");
  put("rk", formatRanks(state.ranks), "");
  put("gr", state.great, 0);
  put("jr", state.just, 100);
  put("n", state.room, 5);
  put("ax", state.ax, "displayLevel");
  put("ay", state.ay, defaultY(ctx));
  put("xg", state.xGoal, axisGoal(state.ax));
  put("yg", state.yGoal, axisGoal(state.ay));
  put("c", state.chart, null);
  writeSnapQuery(p, state);
  let text = p.toString();
  if (state.frontier) text += `${text ? "&" : ""}frontier`;
  return text;
}
