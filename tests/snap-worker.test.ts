import { describe, expect, test } from "bun:test";
import { SnapRankingClient, isCurrentSnapCatalogue, snapProfileKey, snapSourceKey, type SnapRankingCatalogue, type SnapRankingSource, type SnapRankingState, type SnapWorkerPort, type SnapWorkerRequest, type SnapWorkerResponse } from "../src/lib/chart-data/snap-client";
import { createSnapWorkerHandler } from "../src/lib/chart-data/snap-worker";
import { SnapReplayError, type LoadedSnapReplay } from "../src/lib/chart-data/snap-bridge";
import type { SnapEvaluationProfile, SnapRankProgress } from "../src/lib/chart-data/snap-types";
import type { SnapRankRequest } from "../src/lib/chart-data/snap-client";

const source: SnapRankingSource = { site: "https://example.invalid/", reference: { format: "nnnotes.replay-manifest/1", manifestUrl: "replay.json", sha256: "a".repeat(64) }, expected: { region: "tw", masterVersion: "saved", modelCommit: "frozen" } };
const identity = { manifestSha256: "a".repeat(64), dataSha256: "b".repeat(64), modelCommit: "frozen" };
const profile = (): SnapEvaluationProfile => ({ memberSkillPercent: [100, 120, 140, 160, 180], selections: [{ kind: "support", skillId: 1, level: 1 }, null, null, null, null],
  pairedMembers: [null, null, null, null, null], power: 300000, mode: { kind: "normal" }, seed: -1, fps: 60,
  greatFraction: 0.1, justFraction: 0.5, skillOrder: [4, 3, 2, 1, 0] });
const loaded: LoadedSnapReplay = { ...identity, data: { format: "nnnotes.deck-data/1", provenance: {}, master: {}, charts: [] }, factory: () => { throw Error("No scoring in transport tests"); } };
const catalogue: SnapRankingCatalogue = { choices: [], data: loaded.data, source: identity };

test("catalogue admission checks content identity even when source version strings are unchanged", () => {
  const current: SnapRankingCatalogue = { ...catalogue, data: { ...catalogue.data, provenance: { region: "tw", master: { version: "saved" }, deck: { commit: "frozen" } } } };
  const music = { replay: source.reference, provenance: { region: "tw", master: { version: "saved" }, deck: { commit: "frozen" } } };
  expect(isCurrentSnapCatalogue(current, music)).toBe(true);
  expect(isCurrentSnapCatalogue(current, { ...music, replay: { ...music.replay, sha256: "c".repeat(64) } })).toBe(false);
  expect(isCurrentSnapCatalogue(current, { ...music, provenance: { ...music.provenance, region: "jp" } })).toBe(false);
  expect(isCurrentSnapCatalogue(current, null)).toBe(false);
});

describe("Snap Worker transport and paired replay", () => {
  test("same seed/order/accuracy/context paired replay, then version/profile/chart cache", async () => {
    const messages: SnapWorkerResponse[] = [], used: SnapEvaluationProfile[] = [];
    let calls = 0, frees = 0;
    const handler = createSnapWorkerHandler((value) => messages.push(value), { load: async () => loaded, validate: () => {}, catalogue: () => catalogue,
      evaluator: (_, p) => { used.push(p); return { evaluate: (scoreId) => { calls++; return { format: "ournotes.replay-result/1", scoreId, complete: true,
        score: p.selections.some(Boolean) ? 250 : 100, life: 1000, combo: 20, randomDraws: 2, convertedJudgements: 0 }; }, dispose: () => { frees++; } }; },
      yieldControl: async () => {} });
    const request: SnapWorkerRequest = { kind: "measure", revision: 1, source, profile: profile(), scoreIds: [10, 11, 10] };
    await handler.handle(request);
    expect(calls).toBe(4);
    expect(frees).toBe(2);
    expect(used).toHaveLength(2);
    expect({ ...used[1]!, selections: used[0]!.selections }).toEqual(used[0]);
    expect(used[1]!.selections).toEqual([null, null, null, null, null]);
    const rows = messages.flatMap((value) => value.kind === "progress" ? value.rows : []);
    expect(rows.map((row) => [row.scoreId, row.score, row.baselineScore, row.delta])).toEqual([[10, 250, 100, 150], [11, 250, 100, 150]]);
    await handler.handle({ ...request, revision: 2 });
    expect(calls).toBe(4);
    expect(messages.at(-1)).toMatchObject({ kind: "complete", revision: 2, cacheHits: 4, done: 2, total: 2 });
    await handler.handle({ ...request, revision: 3, profile: { ...profile(), seed: 7 } });
    expect(calls).toBe(8);
    await handler.handle({ ...request, revision: 4, source: { ...source, reference: { ...source.reference, sha256: "c".repeat(64) } } });
    expect(calls).toBe(12);
  });
  test("cancel between charts releases both sessions and never declares completion", async () => {
    const messages: SnapWorkerResponse[] = [];
    let calls = 0, freed = 0;
    const handler = createSnapWorkerHandler((value) => messages.push(value), { load: async () => loaded, validate: () => {}, catalogue: () => catalogue,
      evaluator: () => ({ evaluate: (scoreId) => { calls++; return { format: "ournotes.replay-result/1", scoreId, complete: true, score: 100, life: 1, combo: 1, randomDraws: 0, convertedJudgements: 0 }; }, dispose: () => { freed++; } }),
      yieldControl: async () => { await handler.handle({ kind: "cancel", revision: 8 }); } });
    await handler.handle({ kind: "measure", revision: 8, source, profile: profile(), scoreIds: [10, 11, 12] });
    expect(calls).toBe(2);
    expect(freed).toBe(2);
    expect(messages.some((value) => value.kind === "complete")).toBe(false);
    expect(messages.at(-1)).toEqual({ kind: "cancelled", revision: 8 });
  });
  test("a missing paired context fails before allocation and cached-score lookup", async () => {
    const messages: SnapWorkerResponse[] = [];
    let allocations = 0;
    const handler = createSnapWorkerHandler((value) => messages.push(value), { load: async () => loaded, catalogue: () => catalogue,
      validate: () => { throw new SnapReplayError("needs-context", "Missing source-bound member"); },
      evaluator: () => { allocations++; throw Error("Must not run"); } });
    await handler.handle({ kind: "measure", revision: 2, source, profile: profile(), scoreIds: [10] });
    expect(allocations).toBe(0);
    expect(messages.at(-1)).toMatchObject({ kind: "error", phase: "measure", code: "needs-context", revision: 2 });
  });
  test("native replay errors still reach the client after session cleanup", async () => {
    const messages: SnapWorkerResponse[] = [];
    let freed = 0;
    const handler = createSnapWorkerHandler((value) => messages.push(value), { load: async () => loaded, catalogue: () => catalogue, validate: () => {},
      evaluator: () => ({ evaluate: () => { throw new SnapReplayError("unsupported", "Unsupported chart"); }, dispose: () => { freed++; } }) });
    await handler.handle({ kind: "measure", revision: 9, source, profile: profile(), scoreIds: [10] });
    expect(freed).toBe(1);
    expect(messages.flatMap(value => value.kind === "progress" ? value.rows : [])).toMatchObject([{ scoreId: 10, score: null, error: { code: "unsupported" } }]);
    expect(messages.at(-1)).toMatchObject({ kind: "complete", done: 1, revision: 9 });
  });
  test("bounded cache does not grow with profiles", async () => {
    const handler = createSnapWorkerHandler(() => {}, { load: async () => loaded, catalogue: () => catalogue, validate: () => {}, yieldControl: async () => {},
      evaluator: () => ({ evaluate: (scoreId) => ({ format: "ournotes.replay-result/1", scoreId, complete: true, score: 1, life: 1, combo: 1, randomDraws: 0, convertedJudgements: 0 }), dispose: () => {} }) }, 2);
    await handler.handle({ kind: "measure", revision: 1, source, profile: profile(), scoreIds: [10, 11, 12] });
    expect(handler.cacheSize()).toBe(2);
  });
});

function rankHarness(options: { unsupported?: number; cancel?: boolean; baselineUnsupported?: boolean } = {}) {
  const messages: SnapWorkerResponse[] = [];
  let jobs = 0, freedJobs = 0, freedSessions = 0, steps = 0;
  const handler = createSnapWorkerHandler(value => messages.push(value), {
    load: async () => loaded, catalogue: () => catalogue, validate: () => {},
    evaluator: (_, input) => {
      const score = input.selections.some(Boolean) ? 250 : 100;
      return {
        evaluate: scoreId => ({ format: "ournotes.replay-result/1", scoreId, complete: true, score,
          life: 1000, combo: 1, randomDraws: 0, convertedJudgements: 0 }),
        startRank: (scoreId, threshold, powerDomain) => {
          jobs++;
          let progress: SnapRankProgress = { format: "ournotes.replay-rank-result/1", status: "running", completedOrders: 0,
            totalOrders: 120, result: null, code: null, reason: null };
          if (options.unsupported === scoreId || options.baselineUnsupported && score === 100) {
            progress = { ...progress, status: "unsupported", code: "unsupported-domain", reason: "Unproved schedule" };
          }
          return { status: () => progress, advance: count => {
            steps++;
            const completedOrders = Math.min(120, progress.completedOrders + count);
            progress = { ...progress, completedOrders, status: completedOrders === 120 ? "complete" : "running",
              result: completedOrders === 120 ? { scoreId, power: input.power, threshold, powerDomain,
                orderModel: "uniformSkillOrder120", orderCount: 120, orderScores: Array(120).fill(score), scoreSum: score * 120,
                minScore: score, maxScore: score, targetHitCount: score >= threshold ? 120 : 0, need: { status: "outsideDomain" } } : null };
            return progress;
          }, dispose: () => { freedJobs++; } };
        },
        dispose: () => { freedSessions++; },
      };
    },
    yieldControl: async () => { if (options.cancel) await handler.handle({ kind: "cancel", revision: 1 }); },
  });
  const analysis: SnapRankRequest = { model: "uniformSkillOrder120", target: "S", powerDomain: { min: 1, max: 20000000 },
    targets: [{ scoreId: 10, threshold: 200 }, { scoreId: 11, threshold: 200 }] };
  const request: SnapWorkerRequest = { kind: "measure", revision: 1, source, profile: profile(), scoreIds: [10, 11], analysis };
  return { handler, messages, request, analysis, counts: () => ({ jobs, freedJobs, freedSessions, steps }) };
}

test("rank batches keep paired models, reuse exact caches and invalidate changed thresholds", async () => {
  const h = rankHarness();
  await h.handler.handle(h.request);
  expect(h.counts()).toEqual({ jobs: 4, freedJobs: 4, freedSessions: 2, steps: 120 });
  const rows = h.messages.flatMap(message => message.kind === "progress" ? message.rows : []);
  expect(rows.map(row => row.rank?.status)).toEqual(["complete", "complete"]);
  const rank = rows[0]!.rank!;
  if (rank.status !== "complete") throw Error("Expected complete rank");
  expect(rank.result.scoreSum / 120).toBe(250);
  expect(rank.baseline!.scoreSum / 120).toBe(100);
  expect(rank.result.targetHitCount).toBe(120);
  await h.handler.handle({ ...h.request, revision: 2 });
  expect(h.counts().jobs).toBe(4);
  expect(h.messages.at(-1)).toMatchObject({ kind: "complete", cacheHits: 6 });
  await h.handler.handle({ ...h.request, revision: 3, analysis: { ...h.analysis, targets: [{ scoreId: 10, threshold: 300 }, { scoreId: 11, threshold: 300 }] } });
  expect(h.counts().jobs).toBe(8);
});

test("cancelling within a rank batch frees the partial job without publishing its distribution", async () => {
  const h = rankHarness({ cancel: true });
  await h.handler.handle(h.request);
  expect(h.counts()).toEqual({ jobs: 1, freedJobs: 1, freedSessions: 2, steps: 1 });
  expect(h.messages.flatMap(message => message.kind === "progress" ? message.rows : [])).toEqual([]);
  expect(h.messages.at(-1)).toEqual({ kind: "cancelled", revision: 1 });
  expect(h.messages.some(message => message.kind === "complete")).toBe(false);
});

test("an unsupported chart leaves the next chart's complete rank intact", async () => {
  const h = rankHarness({ unsupported: 10 });
  await h.handler.handle(h.request);
  const rows = h.messages.flatMap(message => message.kind === "progress" ? message.rows : []);
  expect(rows.map(row => row.rank?.status)).toEqual(["unsupported", "complete"]);
  expect(h.messages.at(-1)).toMatchObject({ kind: "complete", done: 2 });
});

test("a missing baseline certificate keeps the selected formation's rank statistics", async () => {
  const h = rankHarness({ baselineUnsupported: true });
  await h.handler.handle(h.request);
  const row = h.messages.flatMap(message => message.kind === "progress" ? message.rows : [])[0]!;
  expect(row.rank).toMatchObject({ status: "complete", result: { targetHitCount: 120 }, baseline: null });
});

test("a missing threshold is explicit and does not allocate a rank job", async () => {
  const h = rankHarness();
  await h.handler.handle({ ...h.request, analysis: { ...h.analysis, targets: [{ scoreId: 10, threshold: null }, { scoreId: 11, threshold: null }] } });
  expect(h.counts().jobs).toBe(0);
  expect(h.messages.flatMap(message => message.kind === "progress" ? message.rows : []).map(row => row.rank?.status)).toEqual(["no-threshold", "no-threshold"]);
});

class FakeWorker implements SnapWorkerPort {
  requests: SnapWorkerRequest[] = [];
  stopped = false;
  message?: (event: MessageEvent<SnapWorkerResponse>) => void;
  error?: (event: ErrorEvent) => void;
  postMessage(value: SnapWorkerRequest) { this.requests.push(value); }
  addEventListener(type: "message", listener: (event: MessageEvent<SnapWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(type: "message" | "error", listener: ((event: MessageEvent<SnapWorkerResponse>) => void) | ((event: ErrorEvent) => void)) {
    if (type === "message") this.message = listener as (event: MessageEvent<SnapWorkerResponse>) => void;
    else this.error = listener as (event: ErrorEvent) => void;
  }
  removeEventListener(type: "message", listener: (event: MessageEvent<SnapWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message" | "error") { if (type === "message") delete this.message; else delete this.error; }
  terminate() { this.stopped = true; }
  emit(value: SnapWorkerResponse) { this.message?.({ data: value } as MessageEvent<SnapWorkerResponse>); }
}
test("client discards stale job/profile messages, independently accepts latest catalogue, and terminates", () => {
  const worker = new FakeWorker(), states: SnapRankingState[] = [], catalogues: SnapRankingCatalogue[] = [];
  const client = new SnapRankingClient((state) => states.push(state), (value) => catalogues.push(value), worker);
  client.loadCatalogue(source, "en-US");
  const catalogueRevision = worker.requests.at(-1)!.revision;
  client.measure(source, profile(), [10]);
  const oldRevision = worker.requests.at(-1)!.revision;
  const next = { ...profile(), seed: 7 };
  client.measure(source, next, [11]);
  const nextRevision = worker.requests.at(-1)!.revision;
  worker.emit({ kind: "complete", revision: oldRevision, profileKey: snapProfileKey(profile()), done: 1, total: 1, source: identity, cacheHits: 0 });
  expect(states.at(-1)?.status).toBe("loading");
  expect(states.at(-1)?.sourceKey).toBe(snapSourceKey(source));
  worker.emit({ kind: "catalogue", revision: catalogueRevision, catalogue });
  expect(catalogues).toEqual([catalogue]);
  worker.emit({ kind: "progress", revision: nextRevision, profileKey: snapProfileKey(profile()), done: 1, total: 1, rows: [], source: identity });
  expect(states.at(-1)?.done).toBe(0);
  worker.emit({ kind: "complete", revision: nextRevision, profileKey: snapProfileKey(next), done: 0, total: 0, source: identity, cacheHits: 0 });
  expect(states.at(-1)?.status).toBe("complete");
  client.dispose();
  expect(worker.stopped).toBe(true);
});

test("detail-first scheduling only analyzes requested ranks and reuses them across rank scopes", async () => {
  const h = rankHarness();
  await h.handler.handle({ ...h.request, scoreIds: [11, 10], analysis: { ...h.analysis, targets: [h.analysis.targets[1]!] } });
  const rows = h.messages.flatMap(message => message.kind === "progress" ? message.rows : []);
  expect(rows.map(row => row.scoreId)).toEqual([11, 10]);
  expect(rows.map(row => row.rank?.status)).toEqual(["complete", undefined]);
  expect(h.counts().jobs).toBe(2);
  await h.handler.handle({ ...h.request, revision: 2 });
  expect(h.counts().jobs).toBe(4);
  await h.handler.handle({ ...h.request, revision: 3, scoreIds: [11, 10] });
  expect(h.counts().jobs).toBe(4);
});
