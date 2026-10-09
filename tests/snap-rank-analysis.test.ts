import { expect, test } from "bun:test";
import { parseSnapRankProgress, snapRankFigures, SNAP_POWER_DOMAIN } from "../src/lib/chart-data/snap-rank";
import type { SnapRankProgress } from "../src/lib/chart-data/snap-types";

const identity = { scoreId: 10, power: 1090877, threshold: 1000000, powerDomain: { ...SNAP_POWER_DOMAIN } };
const complete = (): SnapRankProgress => ({
  format: "ournotes.replay-rank-result/1", status: "complete", completedOrders: 120, totalOrders: 120, code: null, reason: null,
  result: { ...identity, orderModel: "uniformSkillOrder120", orderScores: [...Array(30).fill(1000000), ...Array(90).fill(900000)],
    scoreSum: 111000000, orderCount: 120, minScore: 900000, maxScore: 1000000, targetHitCount: 30,
    need: { status: "exact", power: 1200000, scoreSum: 120000000, previousScoreSum: 119999880 } },
});

test("complete order statistics give the same chance and cycle rate to both views", () => {
  const status = parseSnapRankProgress(JSON.stringify(complete()), identity);
  expect(snapRankFigures(status.result!, 120000)).toEqual({ score: 925000, chance: 0.25, perHour: 30, goal: 7.5, need: 1200000 });
  expect(snapRankFigures(status.result!, null).goal).toBeNull();
});

test("zero hits and an unproved inverse still retain complete current-power statistics", () => {
  const value = complete();
  value.result!.orderScores.fill(0);
  Object.assign(value.result!, { scoreSum: 0, minScore: 0, maxScore: 0, targetHitCount: 0, need: { status: "unproven", reason: "No interval certificate" } });
  const status = parseSnapRankProgress(JSON.stringify(value), identity);
  expect(snapRankFigures(status.result!, 120000)).toEqual({ score: 0, chance: 0, perHour: 30, goal: 0, need: null });
});

test("the transport rejects stale target, power, domain and incomplete distributions", () => {
  const changes: Array<(value: SnapRankProgress) => void> = [
    value => { value.result!.scoreId++; }, value => { value.result!.power++; }, value => { value.result!.threshold++; },
    value => { value.result!.powerDomain = { min: 2, max: 20000000 }; }, value => { value.result!.orderScores.pop(); },
    value => { value.result!.scoreSum++; }, value => { value.result!.targetHitCount = 31; },
    value => { value.completedOrders = 119; }, value => { value.status = "running"; },
    value => { value.result!.need = { status: "exact", power: 1000, scoreSum: 120000000, previousScoreSum: 120000000 }; },
  ];
  for (const change of changes) {
    const value = complete(); change(value);
    expect(() => parseSnapRankProgress(JSON.stringify(value), identity)).toThrow("invalid or mismatched");
  }
});

test("running and unsupported states never publish a partial distribution", () => {
  const running: SnapRankProgress = { ...complete(), status: "running", completedOrders: 7, result: null };
  expect(parseSnapRankProgress(JSON.stringify(running), identity).result).toBeNull();
  const unsupported = { ...running, status: "unsupported", code: "unsupported-domain", reason: "Unproved schedule" };
  expect(parseSnapRankProgress(JSON.stringify(unsupported), identity).status).toBe("unsupported");
  expect(() => parseSnapRankProgress(JSON.stringify({ ...unsupported, result: complete().result }), identity)).toThrow();
});
