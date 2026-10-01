import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import RankView from "../src/components/chart-data/RankView";
import ChartDetail from "../src/components/chart-data/ChartDetail";
import type { ChartDataContext } from "../src/components/chart-data/shared";
import { chartRows } from "../src/lib/chart-data/catalog";
import { parseChartDataQuery } from "../src/lib/chart-data/query";
import { emptySnapRanking, snapProfileKey, snapSourceKey, type SnapRankingSource } from "../src/lib/chart-data/snap-client";
import type { SnapEvaluationProfile } from "../src/lib/chart-data/snap-types";
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

test("Snap efficiency preserves the existing columns using only the declared-power ratio", () => {
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
  expect(html).toContain('class=" c-dom">–');
  expect(html).toContain('title="snap.measurementRow: 1,234,567 / 1,000,000 / +234,567"');
  expect(html).toContain('class="num c-rate">–');
  expect(html).not.toContain('class="c-score');
  expect(html).not.toContain("mn-cd-spread");
  expect(html).not.toContain("snap.fixedGekisou");
  expect(html).toContain("scenario.battle");
  expect(html).toContain('title="snap.frontierUnavailable"');
  expect(html).toContain('type="checkbox" disabled=""');
  const ordinary = context(); ordinary.snap!.active = false;
  expect(html.match(/<thead>.*?<\/thead>/)?.[0]).toBe(renderToStaticMarkup(<RankView ctx={ordinary} />).match(/<thead>.*?<\/thead>/)?.[0]);
});
test("Snap event preserves pending event columns without deriving linear need, chance or dominance", () => {
  const ctx = context();
  ctx.state.rankBy = "event";
  ctx.state.frontier = true;
  ctx.state.power = 250000;
  for (const row of ctx.rows) {
    row.scoreRanks = [{ rank: "SS", requiredScore: 1000000, battleRequiredScore: 1000000 }];
    row.weights = new Proxy(row.weights!, { get(target, key, receiver) {
      if (/^\d+$/.test(String(key))) throw new Error("Legacy event model must not read linear weights for Snap ranking");
      return Reflect.get(target, key, receiver);
    } });
  }
  const html = renderToStaticMarkup(<RankView ctx={ctx} />);
  expect(html).toContain(measured.toLocaleString());
  expect(html).toContain("snap.eventMeasurementHint");
  expect(html).toContain('class="num c-need">–');
  expect(html).toContain('class="num c-chance">–');
  expect(html).toContain('class=" c-dom">–');
  expect(html).toContain('class="num c-goal hi"><span class="mn-cd-bar" style="--w:0%">–');
  expect(html).toContain('class="num c-perHour">60.0');
  expect(html).toContain('class="num c-perHour">30.0');
  expect(html).not.toContain("scenario.roomHint");
  expect(html).toContain('aria-label="target"');
  expect(html).toContain("chartsCount");
  // The missing second result remains missing; synthetic linear weights do not fill it.
  expect((html.match(/snap.measurementRow:/g) ?? []).length).toBe(1);
  expect(html).not.toContain('class="c-score');
  expect(html).not.toContain('class="c-delta');
  expect(html).not.toContain("mn-cd-beaten");
  const ordinary = context(); ordinary.snap!.active = false; ordinary.state.rankBy = "event"; ordinary.state.power = ctx.state.power;
  for (const row of ordinary.rows) row.scoreRanks = [{ rank: "SS", requiredScore: 1000000, battleRequiredScore: 1000000 }];
  expect(html.match(/<thead>.*?<\/thead>/)?.[0]).toBe(renderToStaticMarkup(<RankView ctx={ordinary} />).match(/<thead>.*?<\/thead>/)?.[0]);
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

test("Snap detail reuses the same point and raw solo thresholds without linear power or chance", () => {
  const ctx = context(), row = ctx.rows[0]!;
  row.scoreRanks = [{ rank: "SS", requiredScore: 7777777, battleRequiredScore: 9999999 }];
  ctx.data.replay = source.reference;
  ctx.eff = () => { throw new Error("Legacy linear scoring must not run for an active Snap detail"); };
  const html = renderToStaticMarkup(<ChartDetail ctx={ctx} row={row} />);
  expect(html).toContain(measured.toLocaleString());
  expect(html).toContain("snap.baseline");
  expect(html).toContain((7777777).toLocaleString());
  expect(html).not.toContain((9999999).toLocaleString());
  expect(html).not.toContain("detail.needPower");
  expect(html).not.toContain("scenario.roomHint");
  expect(html).not.toContain("col.rate");
  expect(html).toContain("snap.timelineHint");
  expect(html).not.toContain('class="mn-cd-replay"');
  expect(html).not.toContain("detail.measures");
});
