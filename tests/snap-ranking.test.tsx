import { expect, spyOn, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import RankView from "../src/components/chart-data/RankView";
import ChartDetail from "../src/components/chart-data/ChartDetail";
import SnapRankingPanel from "../src/components/chart-data/SnapRankingPanel";
import * as SnapSkillPickerModule from "../src/components/chart-data/SnapSkillPicker";
import * as SnapMemberControlsModule from "../src/components/chart-data/SnapPairedMemberControls";
import { assetConfig } from "../src/config/assets";
import type { ChartDataContext } from "../src/components/chart-data/shared";
import { chartRows } from "../src/lib/chart-data/catalog";
import { parseChartDataQuery, serializeChartDataQuery } from "../src/lib/chart-data/query";
import { chartSnapProfile, snapMeasurementPlan } from "../src/lib/chart-data/snap-profile";
import { emptySnapRanking, snapProfileKey, snapSourceKey, type SnapRankingCatalogue, type SnapRankingSource } from "../src/lib/chart-data/snap-client";
import type { SnapEvaluationProfile, SnapRankResult, SnapTable } from "../src/lib/chart-data/snap-types";
import type { MusicData } from "../src/lib/chart-data/types";

const profile: SnapEvaluationProfile = { memberSkillPercent: [100, 100, 100, 100, 100], selections: [{ kind: "support", skillId: 1, level: 1 }, null, null, null, null],
  pairedMembers: [null, null, null, null, null], power: 300000, mode: { kind: "fixedSoloGekisou", ranks: [1, 1, 1] }, seed: 1,
  fps: 60, greatFraction: 0, justFraction: 1, skillOrder: [0, 1, 2, 3, 4] };
const source: SnapRankingSource = { site: "https://example.invalid/", reference: { format: "nnnotes.replay-manifest/1", manifestUrl: "replay.json", sha256: "a".repeat(64) }, expected: { region: "tw", masterVersion: "saved", modelCommit: "frozen" } };
const measured = 1234567;
function context(): ChartDataContext {
  const data: MusicData = { songs: [{ id: 1, title: { en: "First" }, charts: [{ scoreId: 10, difficulty: "expert", level: 25, musicLengthMs: 60000 }] },
    { id: 2, title: { en: "Second" }, charts: [{ scoreId: 11, difficulty: "expert", level: 25, musicLengthMs: 120000 }] }] };
  const rows = chartRows(data).map((row) => ({ ...row, base: 1, weights: [1, 1, 1, 1, 1] }));
  const support = { battle: true, free: true, ranks: true, just: true };
  const state = parseChartDataQuery("?oh=0", { hasStats: true, support });
  return { locale: "en-US", tr: (key, values) => key === "snap.measurementRow"
    ? `${key}: ${values!.score} / ${values!.baseline} / ${values!.delta}`
    : key === "snap.normalizedMeasurementHint" ? `${key}: ${values!.power}` : key,
    data, rows, pool: rows, byScore: new Map(rows.map((row) => [row.scoreId, row])), bands: new Map(),
    hasStats: true, support, state, update: () => {}, skills: [1, 1, 1, 1, 1], title: (row) => String(row.musicId), bandName: () => "", bandColor: () => "", jacketUrl: () => null,
    songHref: () => "#", previewHref: () => "#", lengthOf: (row) => row.chartMs, eff: () => ({ rate: null, perMinute: null }), openChart: () => {},
    snap: { active: true, profile, source, measurement: { ...emptySnapRanking(snapProfileKey(profile), 1), sourceKey: snapSourceKey(source), status: "complete", done: 1, total: 2,
      source: { manifestSha256: source.reference.sha256, dataSha256: "b".repeat(64), modelCommit: "frozen" },
      rows: new Map([[10, { scoreId: 10, score: measured, baselineScore: 1000000, delta: 234567, life: 1000, combo: 200, randomDraws: 4, convertedJudgements: 0 }]]) } } };
}

function panelMarkup(ctx: ChartDataContext, catalogue: SnapRankingCatalogue | null = null): string {
  return renderToStaticMarkup(<SnapRankingPanel ctx={ctx} catalogue={catalogue} measurement={emptySnapRanking()} loading={false}
    invalidMembers={[]} legality={undefined} issues={[]} available onOpen={() => {}} catalogueError={false} />);
}

test("member and Snap selection then clear all preserve the manual skills and shared power", () => {
  const OriginalPicker = SnapSkillPickerModule.default;
  const OriginalMemberControls = SnapMemberControlsModule.default;
  let picker: Parameters<typeof OriginalPicker>[0] | undefined;
  const members: Parameters<typeof OriginalMemberControls>[0][] = [];
  const pickerSpy = spyOn(SnapSkillPickerModule, "default").mockImplementation(props => {
    picker = props; return <OriginalPicker {...props} />;
  });
  const memberSpy = spyOn(SnapMemberControlsModule, "default").mockImplementation(props => {
    members.push(props); return <OriginalMemberControls {...props} />;
  });
  try {
    const ctx = context();
    const manual = [140, 130, 90, 110, 120];
    ctx.state.skills = [...manual]; ctx.state.power = 432100;
    ctx.update = patch => { ctx.state = { ...ctx.state, ...patch }; };
    const render = () => { members.length = 0; panelMarkup(ctx); };
    render();
    members[2]!.onChange({ memberId: 18, gekisouLevel: 3 });
    expect(ctx.state.skills).toEqual(manual);
    expect(ctx.state.power).toBe(432100);
    expect(ctx.state.snapSkills.some(Boolean)).toBe(false);
    render();
    picker!.onSelect(2, { kind: "support", skillId: 31, level: 5, cardId: 17 });
    expect(chartSnapProfile(ctx.state).profile.memberSkillPercent).toEqual(manual);
    expect(chartSnapProfile(ctx.state).profile.power).toBe(432100);
    render();
    picker!.onReset();
    expect(ctx.state.snapMembers).toEqual([null, null, null, null, null]);
    expect(ctx.state.snapSkills).toEqual([null, null, null, null, null]);
    expect(ctx.state.skills).toEqual(manual);
    expect(ctx.state.power).toBe(432100);
    const queryContext = { hasStats: true, support: ctx.support };
    const restored = parseChartDataQuery(serializeChartDataQuery(ctx.state, queryContext), queryContext);
    expect(restored.skills).toEqual(manual);
    expect(restored.power).toBe(432100);
    expect(chartSnapProfile(restored).profile.power).toBe(432100);
  } finally { pickerSpy.mockRestore(); memberSpy.mockRestore(); }
});

test("Snap ranking shows one shared power input in efficiency and event views", () => {
  for (const rankBy of ["efficiency", "event"] as const) {
    const ctx = context();
    ctx.state.rankBy = rankBy;
    ctx.state.snapSkills = profile.selections;
    ctx.state.power = 1090877;
    const html = panelMarkup(ctx) + renderToStaticMarkup(<RankView ctx={ctx} />);
    expect((html.match(/aria-label="power"/g) ?? []).length).toBe(1);
    expect(html).toContain('value="1090877"');
    expect(chartSnapProfile(ctx.state).profile.power).toBe(1090877);
  }
});

test("clear all is available for a member-only formation in both artwork layouts", () => {
  const saved = assetConfig.gameUiLibraries.tw;
  const resetButton = (html: string) => html.match(/<button\b[^>]*class="mn-cd-ghost"[^>]*>/)?.[0];
  try {
    for (const library of ["", "https://example.invalid/ui/manifest.json"]) {
      assetConfig.gameUiLibraries.tw = library;
      const ctx = context(); ctx.data.provenance = { region: "tw" };
      expect(resetButton(panelMarkup(ctx))).toContain('disabled=""');
      ctx.state.snapMembers[0] = { memberId: 1, gekisouLevel: null };
      const memberOnly = panelMarkup(ctx);
      expect(memberOnly).toContain('class="mn-cd-snap-member-clear"');
      expect(resetButton(memberOnly)).toBeDefined();
      expect(resetButton(memberOnly)).not.toContain("disabled");
      expect(memberOnly).not.toContain('class="mn-cd-snap-summary"');
      ctx.state.snapMembers[0] = null;
      expect(resetButton(panelMarkup(ctx))).toContain('disabled=""');
      ctx.state.snapSkills[1] = { kind: "support", skillId: 1, level: 1, cardId: 7 };
      expect(resetButton(panelMarkup(ctx))).not.toContain("disabled");
    }
  } finally { assetConfig.gameUiLibraries.tw = saved; }
});

test("a region without a UI manifest retains all five visible member and Snap controls", () => {
  const saved = { ...assetConfig.gameUiLibraries };
  try {
    Object.assign(assetConfig.gameUiLibraries, { tw: "", jp: "", kr: "", en: "" });
    for (const region of ["tw", "jp", "kr", "en"] as const) {
      const ctx = context(); ctx.data.provenance = { region };
      // A different region's valid configuration must not hide this region's ordinary controls.
      assetConfig.gameUiLibraries[region === "tw" ? "jp" : "tw"] = "https://example.invalid/ui/manifest.json";
      const html = panelMarkup(ctx);
      expect(html).toContain('class="mn-cd-snap-slots"');
      expect((html.match(/class="mn-cd-snap-slot-no"/g) ?? []).length).toBe(5);
      expect((html.match(/class="mn-cd-snap-member-name"/g) ?? []).length).toBe(5);
      expect((html.match(/aria-haspopup="dialog"/g) ?? []).length).toBe(10);
      expect(html).not.toContain("mn-cd-native-formation-stage");
      expect(html).not.toContain("mn-cd-snap-member-trigger-overlay");
      Object.assign(assetConfig.gameUiLibraries, { tw: "", jp: "", kr: "", en: "" });
    }
    assetConfig.gameUiLibraries.tw = "https://example.invalid/ui/manifest.json";
    const ctx = context(); ctx.data.provenance = { region: "tw" };
    expect(panelMarkup(ctx)).toContain("mn-cd-native-formation-stage");
    expect(panelMarkup(ctx)).toContain('data-renderer="nnnotes-ui"');
  } finally { Object.assign(assetConfig.gameUiLibraries, saved); }
});

test("selected cards retain existing thumbnail artwork when their UI manifest is absent", () => {
  const saved = assetConfig.gameUiLibraries.tw;
  try {
    assetConfig.gameUiLibraries.tw = "";
    const ctx = context();
    const provenance = { region: "tw", master: { version: "saved" }, deck: { commit: "frozen" } };
    ctx.data = { ...ctx.data, format: "nnnotes.music-data/1", provenance,
      gekisouCatalog: { members: [{ id: 1, name: { en: "Member One" } }], snaps: [{ id: 7, name: { en: "Snap Seven" } }] } };
    ctx.state.snapMembers[0] = { memberId: 1, gekisouLevel: null };
    ctx.state.snapSkills[0] = { kind: "support", skillId: 1, level: 1, cardId: 7 };
    const table = (rows: Record<string, unknown>[]): SnapTable => {
      const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
      return { columns, rows: rows.map(row => columns.map(key => row[key])) };
    };
    const catalogue: SnapRankingCatalogue = {
      source: { manifestSha256: source.reference.sha256, dataSha256: "b".repeat(64), modelCommit: "frozen" },
      choices: [{ key: "support:1:1", kind: "support", skillId: 1, level: 1, name: "Snap Seven", description: "", searchTerms: [],
        cardIds: [7], rankBindings: [{ cardId: 7, rank: 1, binding: 1 }], effectTypes: [2000], requirements: [], status: "supported" }],
      data: { format: "nnnotes.deck-data/1", provenance, charts: [], master: {
        MasterCharacter: table([{ _id: 10, _bandID: 1 }]), MasterGekisouSkillEffect: table([]),
        MasterMemberCard: table([{ _id: 1, _assetID: 101, _characterID: 10, _rarity: 4, _cardType: 1 }]),
        MasterSupportCard: table([{ _id: 7, _assetID: 707, _characterIDs: [10], _rarity: 4, _cardType: 1 }]),
      } },
    };
    const html = panelMarkup(ctx, catalogue);
    expect(html).toContain("MemberCard/101/member_thumbnail");
    expect(html).toContain("SupportCard/707/snap_thumbnail");
    expect(html).toContain("Member One");
    expect(html).toContain("Snap Seven");
    expect(html).not.toContain('data-renderer="nnnotes-ui"');
  } finally { assetConfig.gameUiLibraries.tw = saved; }
});

test("Snap efficiency uses the declared-power ratio and states its frontier capability", () => {
  const ctx = context();
  ctx.state.frontier = true;
  ctx.state.overhead = 30;
  for (const row of ctx.rows) row.weights = new Proxy(row.weights!, { get(target, key, receiver) {
    if (/^\d+$/.test(String(key))) throw new Error("Legacy linear weights must not be read for Snap ranking");
    return Reflect.get(target, key, receiver);
  } });
  const html = renderToStaticMarkup(<RankView ctx={ctx} />);
  expect(html).toContain("snap.normalizedMeasurementHint: 300,000");
  expect(html).toContain('class="num c-rate">4.115');
  expect(html).toContain('class="num c-perMinute hi"><span class="mn-cd-bar" style="--w:100%">2.743');
  expect(html).toContain('class="num dim c-relative">100.0%');
  expect(html).not.toContain('class=" c-dom"');
  expect(html).toContain('title="snap.measurementRow: 1,234,567 / 1,000,000 / +234,567"');
  expect(html).toContain('class="num c-rate">–');
  expect(html).not.toContain('class="c-score');
  expect(html).not.toContain("mn-cd-spread");
  expect(html).not.toContain("snap.fixedGekisou");
  expect(html).toContain("scenario.battle");
  expect(html).toContain("snap.frontierUnavailable");
  expect(html).not.toContain('type="checkbox"');
});
function rankedContext(): ChartDataContext {
  const ctx = context();
  ctx.state.rankBy = "event";
  ctx.state.mode = "free";
  ctx.state.target = "S";
  ctx.state.power = 1090877;
  ctx.state.skills = [130, 110, 150, 110, 130];
  ctx.state.great = 0;
  ctx.state.overhead = 0;
  ctx.lengthOf = () => 120000;
  ctx.snap!.profile = { ...profile, mode: { kind: "normal" }, power: ctx.state.power,
    memberSkillPercent: [130, 110, 150, 110, 130], justFraction: 0 };
  for (const row of ctx.rows) row.scoreRanks = [{ rank: "S", requiredScore: 1000000, battleRequiredScore: 9000000 }];
  ctx.snap!.analysis = { model: "uniformSkillOrder120", target: "S", powerDomain: { min: 1, max: 20000000 },
    targets: ctx.rows.map(row => ({ scoreId: row.scoreId, threshold: 1000000 })) };
  const result: SnapRankResult = { scoreId: 10, power: ctx.state.power, threshold: 1000000, orderModel: "uniformSkillOrder120",
    orderScores: [...Array(30).fill(1000000), ...Array(90).fill(900000)], scoreSum: 111000000, orderCount: 120,
    minScore: 900000, maxScore: 1000000, targetHitCount: 30, powerDomain: { min: 1, max: 20000000 },
    need: { status: "exact", power: 1200000, scoreSum: 120000000, previousScoreSum: 119999880 } };
  const baseline: SnapRankResult = { ...result, orderScores: Array(120).fill(500000), scoreSum: 60000000,
    minScore: 500000, maxScore: 500000, targetHitCount: 0, need: { status: "outsideDomain" } };
  const row = ctx.snap!.measurement.rows.get(10)!;
  ctx.snap!.measurement = { ...ctx.snap!.measurement, profileKey: snapProfileKey(ctx.snap!.profile, ctx.snap!.analysis),
    rows: new Map([[10, { ...row, rank: { status: "complete", result, baseline } }]]) };
  return ctx;
}

test("Snap event shows the exact order hit rate and required power with pending rows explicit", () => {
  const ctx = rankedContext();
  ctx.state.frontier = true;
  for (const row of ctx.rows) row.weights = new Proxy(row.weights!, { get(target, key, receiver) {
    if (/^\d+$/.test(String(key))) throw Error("Snap rank must use native statistics");
    return Reflect.get(target, key, receiver);
  } });
  const html = renderToStaticMarkup(<RankView ctx={ctx} />);
  expect(html).toContain('class="num c-need">1,200,000');
  expect(html).toContain('class="mn-cd-chance c1">25%');
  expect(html).toContain('class="num c-goal hi"><span class="mn-cd-bar" style="--w:100%">7.50');
  expect(html).toContain('class="num c-perHour">30.0');
  expect(html).toContain('class="num c-need">snap.rank.pending');
  expect(html).toContain("snap.rank.summary");
  expect(html).not.toContain('class=" c-dom"');
  expect(html).not.toContain("scenario.roomHint");
  expect(html).toContain('aria-label="target"');
  expect(html).toContain("snap.eventMeasurementHint");
});

test("Snap rank keeps zero percent distinct from unsupported and unproved metrics", () => {
  const ctx = rankedContext(), row = ctx.snap!.measurement.rows.get(10)!;
  if (row.rank?.status !== "complete") throw Error("Expected complete fixture");
  row.rank.result.targetHitCount = 0;
  row.rank.result.need = { status: "unproven", reason: "No interval certificate" };
  const rows = new Map(ctx.snap!.measurement.rows);
  rows.set(11, { ...row, scoreId: 11, rank: { status: "unsupported", code: "unsupported-domain", reason: "Unproved schedule" } });
  ctx.snap!.measurement = { ...ctx.snap!.measurement, rows };
  const html = renderToStaticMarkup(<RankView ctx={ctx} />);
  expect(html).toContain('class="mn-cd-chance c0">0%');
  expect(html).toContain('class="num c-goal hi"><span class="mn-cd-bar" style="--w:0%">0.00');
  expect(html).toContain("snap.rank.unproven");
  expect(html).toContain("snap.rank.unsupported");
});

test("terminal Worker failures show failed rank cells instead of pending cells", () => {
  const ctx = rankedContext();
  ctx.snap!.measurement = { ...ctx.snap!.measurement, status: "error", rows: new Map(), error: { code: "worker", message: "Worker failed" } };
  const ranking = renderToStaticMarkup(<RankView ctx={ctx} />);
  const detail = renderToStaticMarkup(<ChartDetail ctx={ctx} row={ctx.rows[0]!} />);
  expect(ranking).toContain('class="num c-need">snap.rank.error');
  expect(detail).toContain("snap.rank.error");
  expect(ranking).not.toContain("snap.rank.pending");
  expect(detail).not.toContain("snap.rank.pending");
});

test("changing the target clears prior rank values synchronously", () => {
  const ctx = rankedContext();
  ctx.state.target = "SS";
  for (const row of ctx.rows) row.scoreRanks.push({ rank: "SS", requiredScore: 2000000, battleRequiredScore: 9000000 });
  ctx.snap!.analysis = { ...ctx.snap!.analysis!, target: "SS", targets: [{ scoreId: 10, threshold: 2000000 }, { scoreId: 11, threshold: 2000000 }] };
  const html = renderToStaticMarkup(<RankView ctx={ctx} />);
  expect(html).not.toContain('class="num c-need">1,200,000');
  expect(html).not.toContain('class="mn-cd-chance c1">25%');
  expect(html).toContain("snap.rank.pending");
});

test("profile or source change hides old values before the next effect/Worker response", () => {
  const ctx = context();
  ctx.snap!.profile = { ...profile, seed: 7 };
  expect(renderToStaticMarkup(<RankView ctx={ctx} />)).not.toContain(measured.toLocaleString());
  ctx.snap!.profile = profile;
  ctx.snap!.source = { ...source, reference: { ...source.reference, sha256: "c".repeat(64) } };
  expect(renderToStaticMarkup(<RankView ctx={ctx} />)).not.toContain(measured.toLocaleString());
});
test("all None preserves the exact existing RankView markup", () => {
  const ctx = context();
  ctx.snap!.active = false;
  ctx.snap!.profile = { ...profile, selections: [null, null, null, null, null] };
  const withNone = renderToStaticMarkup(<RankView ctx={ctx} />);
  const { snap: _, ...plain } = ctx;
  expect(withNone).toBe(renderToStaticMarkup(<RankView ctx={plain} />));
  expect(withNone).toContain('class="c-rate');
  expect(withNone).toContain('class="c-dom');
  expect(withNone).not.toContain("snap.measurementHint");
  expect(withNone).not.toContain(measured.toLocaleString());
});

test("Snap detail preserves point replay and uses the same selected-target rank statistics", () => {
  const ctx = rankedContext(), row = ctx.rows[0]!;
  ctx.data.replay = source.reference;
  ctx.eff = () => { throw new Error("Legacy linear scoring must not run for an active Snap detail"); };
  const html = renderToStaticMarkup(<ChartDetail ctx={ctx} row={row} />);
  expect(html).toContain(measured.toLocaleString());
  expect(html).toContain("snap.baseline");
  expect(html).toContain("1,200,000");
  expect(html).toContain("25.0%");
  expect(html).toContain("7.50");
  expect(html).toContain("925,000");
  expect(html).not.toContain("9,000,000");
  expect(html).not.toContain("detail.needPower");
  expect(html).not.toContain("scenario.roomHint");
  expect(html).not.toContain("col.rate");
  expect(html).toContain("snap.timelineHint");
  expect(html).not.toContain('class="mn-cd-replay"');
  expect(html).not.toContain("detail.measures");
});

test("efficiency details prioritize the open chart and restrict rank analysis to that chart", () => {
  const ctx = context();
  const state = { ...ctx.state, view: "rank" as const, rankBy: "efficiency" as const, chart: 11 };
  const detail = snapMeasurementPlan(ctx.rows, state);
  expect(detail.scoreIds).toEqual([11, 10]);
  expect(detail.analysis?.targets.map(target => target.scoreId)).toEqual([11]);
  expect(snapMeasurementPlan(ctx.rows, { ...state, chart: null }).analysis).toBeUndefined();
  expect(snapMeasurementPlan(ctx.rows, { ...state, view: "charts" }).scoreIds).toEqual([11]);
  expect(snapMeasurementPlan(ctx.rows, { ...state, chart: 999 }).analysis).toBeUndefined();
  const event = snapMeasurementPlan(ctx.rows, { ...state, rankBy: "event" });
  expect(event.scoreIds).toEqual([11, 10]);
  expect(event.analysis?.targets.map(target => target.scoreId)).toEqual([10, 11]);
  expect(event.analysis).toEqual(snapMeasurementPlan(ctx.rows, { ...state, rankBy: "event", chart: 10 }).analysis);
});
