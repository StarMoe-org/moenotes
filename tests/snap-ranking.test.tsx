import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import RankView from "../src/components/chart-data/RankView";
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
  return { locale: "en-US", tr: (key) => key, data, rows, pool: rows, byScore: new Map(rows.map((row) => [row.scoreId, row])), bands: new Map(),
    hasStats: true, support, state, update: () => {}, skills: [1, 1, 1, 1, 1], title: (row) => String(row.musicId), bandName: () => "", bandColor: () => "", jacketUrl: () => null,
    songHref: () => "#", previewHref: () => "#", lengthOf: (row) => row.chartMs, eff: () => ({ rate: null, perMinute: null }), openChart: () => {},
    snap: { active: true, profile, source, measurement: { ...emptySnapRanking(snapProfileKey(profile), 1), sourceKey: snapSourceKey(source), status: "complete", done: 1, total: 2,
      source: { manifestSha256: source.reference.sha256, dataSha256: "b".repeat(64), modelCommit: "frozen" },
      rows: new Map([[10, { scoreId: 10, score: measured, baselineScore: 1000000, delta: 234567, life: 1000, combo: 200, randomDraws: 4, convertedJudgements: 0 }]]) } } };
}

test("Snap event view shows fixed measurements without linear need, chance, frontier or room controls", () => {
  const ctx = context();
  ctx.state.rankBy = "event";
  ctx.state.frontier = true;
  const html = renderToStaticMarkup(<RankView ctx={ctx} />);
  expect(html).toContain(measured.toLocaleString());
  expect(html).toContain("snap.eventMeasurementHint");
  expect(html).toContain("snap.delta");
  expect(html).toContain("snap.perMinute");
  expect(html).not.toContain('class="c-need');
  expect(html).not.toContain('class="c-chance');
  expect(html).not.toContain('class="c-dom');
  expect(html).not.toContain("scenario.roomHint");
  expect(html).not.toContain('aria-label="target"');
  expect(html).toContain("chartsCount");
  // The missing second result remains missing; synthetic linear weights do not fill it.
  expect((html.match(/c-score/g) ?? []).length).toBe(3);
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
  expect(withNone).toContain("rankHint.efficiency");
  expect(withNone).not.toContain("snap.measurementHint");
  expect(withNone).not.toContain(measured.toLocaleString());
});
