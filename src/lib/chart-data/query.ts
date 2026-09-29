import { DIFFICULTIES, SCORE_RANKS, type Difficulty, type LengthSource, type ScoreRank } from "./ranking";
import { BEST_RANKS, RANGE_COUNT, SCENARIOS, rangeRank, type Scenario } from "./scenario";

/**
 * The chart data tool's choices live in the query, as on ournotes-player's chart data page (the page's language is
 * the site locale, its theme the site setting):
 *   ?v=rank|charts|guide &band=<id> &d=<difficulty>[,...] &q=<search>
 *   &r=efficiency|event|speed|level|notes|long|short|skip &sp=density|bpmMax|bpm   (ranking, speed measure)
 *   &sc=free|battle &br=<rank>,<rank>,<rank>                                       (scenario, Gekisou Live ranks)
 *   &len=bgm|chart &oh=<seconds> &x=<percent>[,...] &frontier                      (efficiency)
 *   &p=<power> &tr=<rank> &gr=<Great percent>                                      (event: rank chance)
 *   &jk=off                                                                        (no jackets)
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

export interface ChartDataState {
  view: View;
  band: string;
  diffs: Difficulty[];
  search: string;
  rankBy: RankBy;
  speedBy: SpeedBy;
  scenario: Scenario;
  len: LengthSource;
  /** Seconds. */
  overhead: number;
  /** Percent per member. */
  skills: number[];
  frontier: boolean;
  power: number;
  target: ScoreRank;
  /** Percent of Great judgements. */
  great: number;
  jackets: boolean;
  ax: Axis;
  ay: Axis;
  chart: number | null;
}

/** What the defaults depend on: whether the file has deck statistics, and the scenario it opens with. */
export interface QueryContext {
  hasStats: boolean;
  defaultScenario: Scenario;
}

const oneOf = <T extends string>(values: readonly T[], value: string | null): value is T => value !== null && (values as readonly string[]).includes(value);

const defaultRank = (ctx: QueryContext): RankBy => (ctx.hasStats ? "efficiency" : "speed");
const defaultY = (ctx: QueryContext): Axis => (ctx.hasStats ? "perMinute" : "density");
const ranksText = (ranks: readonly number[]) => [...Array(RANGE_COUNT).keys()].map((i) => rangeRank({ id: "battle", ranks }, i)).join(",");

export function parseChartDataQuery(search: string, ctx: QueryContext): ChartDataState {
  const q = new URLSearchParams(search);
  const skills = (q.get("x") || DEFAULT_SKILLS).split(",").map(Number).filter((x) => Number.isFinite(x) && x >= 0).slice(0, SKILL_SLOTS);
  while (skills.length < SKILL_SLOTS) skills.push(0);
  let rankBy: RankBy = oneOf(RANKS, q.get("r")) ? q.get("r") as RankBy : defaultRank(ctx);
  if (!ctx.hasStats && EFF_RANKS.has(rankBy)) rankBy = "speed";
  const sc = q.get("sc");
  const scenario: Scenario = oneOf(SCENARIOS, sc)
    ? { id: sc, ranks: sc === "battle" && q.get("br") ? (q.get("br") as string).split(",").map(Number) : BEST_RANKS }
    : ctx.defaultScenario;
  const ax = q.get("ax"), ay = q.get("ay"), view = q.get("v"), speed = q.get("sp"), target = q.get("tr");
  return {
    view: oneOf(VIEWS, view) ? view : "rank",
    band: q.get("band") || "",
    diffs: (q.get("d") || "expert").split(",").filter((d): d is Difficulty => oneOf(DIFFICULTIES, d)),
    search: q.get("q") || "",
    rankBy,
    speedBy: oneOf(SPEEDS, speed) ? speed : "density",
    scenario: { id: scenario.id, ranks: [...Array(RANGE_COUNT).keys()].map((i) => rangeRank(scenario, i)) },
    len: q.get("len") === "chart" ? "chart" : "bgm",
    overhead: Math.min(600, Math.max(0, Number(q.get("oh") ?? 30) || 0)),
    skills,
    frontier: q.has("frontier"),
    power: Math.max(0, Math.round(Number(q.get("p")) || 0)),
    target: oneOf(SCORE_RANKS, target) ? target : "SS",
    great: Math.min(100, Math.max(0, Number(q.get("gr")) || 0)),
    jackets: q.get("jk") !== "off",
    ax: oneOf(AXES, ax) ? ax : "displayLevel",
    ay: oneOf(AXES, ay) ? ay : defaultY(ctx),
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
  put("sc", state.scenario.id, ctx.defaultScenario.id);
  if (state.scenario.id === "battle") put("br", ranksText(state.scenario.ranks), ranksText(BEST_RANKS));
  put("len", state.len, "bgm");
  put("oh", state.overhead, 30);
  put("x", state.skills.join(","), DEFAULT_SKILLS);
  put("p", state.power, 0);
  put("tr", state.target, "SS");
  put("gr", state.great, 0);
  put("jk", state.jackets ? null : "off", null);
  put("ax", state.ax, "displayLevel");
  put("ay", state.ay, defaultY(ctx));
  put("c", state.chart, null);
  let text = p.toString();
  if (state.frontier) text += `${text ? "&" : ""}frontier`;
  return text;
}
