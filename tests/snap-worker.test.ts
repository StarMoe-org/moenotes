import { describe, expect, test } from "bun:test";
import { SnapRankingClient, isCurrentSnapCatalogue, snapProfileKey, snapSourceKey, type SnapRankingCatalogue, type SnapRankingSource, type SnapRankingState, type SnapWorkerPort, type SnapWorkerRequest, type SnapWorkerResponse } from "../src/lib/chart-data/snap-client";
import { createSnapWorkerHandler } from "../src/lib/chart-data/snap-worker";
import { SnapReplayError, type LoadedSnapReplay } from "../src/lib/chart-data/snap-bridge";
import type { SnapEvaluationProfile } from "../src/lib/chart-data/snap-types";

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
    expect(messages.at(-1)).toMatchObject({ kind: "error", code: "unsupported", phase: "measure", revision: 9 });
  });
  test("bounded cache does not grow with profiles", async () => {
    const handler = createSnapWorkerHandler(() => {}, { load: async () => loaded, catalogue: () => catalogue, validate: () => {}, yieldControl: async () => {},
      evaluator: () => ({ evaluate: (scoreId) => ({ format: "ournotes.replay-result/1", scoreId, complete: true, score: 1, life: 1, combo: 1, randomDraws: 0, convertedJudgements: 0 }), dispose: () => {} }) }, 2);
    await handler.handle({ kind: "measure", revision: 1, source, profile: profile(), scoreIds: [10, 11, 12] });
    expect(handler.cacheSize()).toBe(2);
  });
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
