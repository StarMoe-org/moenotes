import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assetConfig } from "../src/config/assets";
import { sha256Hex, type DeckSolverRuntime } from "../src/lib/deck/runtime-source";
import { DeckWorkerClient, type DeckRecommendJob, type DeckWorkerPort } from "../src/lib/deck/worker-client";
import { DECK_WORKER_PROTOCOL, deckWorkerInit, isCurrentDeckWorkerReply, parseDeckWorkerEvent, type DeckDataCatalog, type DeckWorkerInit } from "../src/lib/deck/worker-protocol";
const runtimeDir = path.join(import.meta.dir, "..", "public", "deck");
// The Worker core is plain JavaScript served from public/.
const { createDeckWorkerCore, loadDeckSolverModule } = await import(path.join(runtimeDir, "deck-worker-core.mjs")) as {
  createDeckWorkerCore(platform: Record<string, unknown>): { handle(message: unknown): Promise<void> };
  loadDeckSolverModule(files: { glue: ArrayBuffer; wasm: ArrayBuffer }): Promise<new (deckData: Uint8Array) => { datasetId: string }>;
};
const encode = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const digest = (bytes: Uint8Array) => sha256Hex(bytes.slice().buffer);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const BIG = "9007199254740993";

/**
 * A synthetic wasm-bindgen `--target web` glue module: a default init export taking `{module_or_path}` and a
 * `DeckSolver` class with the solver's interface. `recommend` echoes the exact input text and calls back
 * `request.progress` times before returning, or throws when `request.crash` is set.
 */
function syntheticGlue({ datasetId, capabilities = "'{\"objectives\":[\"score\"]}'", exportSolver = true }: { datasetId: string; capabilities?: string; exportSolver?: boolean }) {
  return `let wasm = null;
export default async function init(options) {
  const bytes = options && options.module_or_path;
  if (!(bytes instanceof ArrayBuffer)) throw new Error("init expects the WASM bytes");
  wasm = new Uint8Array(bytes);
  if (wasm[0] !== 0 || wasm[1] !== 0x61 || wasm[2] !== 0x73 || wasm[3] !== 0x6d) throw new Error("not a WASM module");
}
${exportSolver ? "export " : ""}class DeckSolver {
  constructor(deckData) {
    if (!wasm) throw new Error("init has not run");
    if (!(deckData instanceof Uint8Array)) throw new Error("deck data must be bytes");
    const data = JSON.parse(new TextDecoder().decode(deckData));
    if (data.format !== "nnnotes.deck-data/1") throw new Error("invalid deck data");
    this.datasetId = ${JSON.stringify(datasetId)};
  }
  capabilities() { return ${capabilities}; }
  recommend(accountJson, requestJson, onProgress, intervalMs) {
    const request = JSON.parse(requestJson);
    if (request.crash) throw new Error("RuntimeError: unreachable");
    for (let step = 1; step <= request.progress; step++) onProgress && onProgress('{"step":' + step + ',"final":false,"account":' + accountJson + '}');
    return '{"step":' + request.progress + ',"final":true,"intervalMs":' + intervalMs + ',"account":' + accountJson + '}';
  }
}
export { DeckSolver as Solver };
`;
}

const BASE = "https://data.example.invalid/replay";
const EMPTY_CATALOG: DeckDataCatalog = { eventItemRewards: [], eventIds: [], musics: [], challengeMusics: [], arenaMusics: [] };
const CATALOG: DeckDataCatalog = { eventItemRewards: [{ id: 2, itemId: 90, normal: true, challenge: true }], eventIds: [2], musics: [{ id: 100076, difficulties: [], hasLuck: null }, { id: 100110, difficulties: ["hard"], hasLuck: true }, { id: 100111, difficulties: ["easy", "expert"], hasLuck: false }],
  challengeMusics: [{ id: 4, eventId: 2, musicId: 100111 }], arenaMusics: [{ id: 7, musicId: 100110 }] };
function catalogueData() {
  return { format: "nnnotes.deck-data/1", provenance: { region: "tw", deck: { commit: "0123abcd" } },
    master: {
      MasterEvent: { columns: ["_nameTextId", "_id", "_eventItemId", "_liveEventRewardGroup", "_challengeLiveEventRewardGroup"], rows: [["Event_Name_0002", 2, 90, 20, 30]] },
      MasterLiveEventReward: { columns: ["_id", "_group", "_eventGroup", "_scoreRank", "_resourceType", "_resourceId", "_resourceCount", "_probability"],
        rows: [[1, 500, 20, 1, 1, 90, 3, 10000], [2, 501, 20, 2, 1, 90, 7, 10000]] },
      MasterChallengeLiveEventReward: { columns: ["_id", "_group", "_eventGroup", "_scoreRank", "_resourceType", "_resourceId", "_resourceCount", "_probability"],
        rows: [[1, 600, 30, 1, 1, 90, 5, 10000], [2, 601, 30, 2, 1, 90, 9, 10000]] },
      MasterLiveMusic: { columns: ["_hardID", "_id", "_expertID", "_normalID", "_easyID", "_gekisouMission3", "_gekisouMission1", "_gekisouMission2"], rows: [
        [10011102, 100111, 10011103, 10011101, 10011100, 3, 1, 3], [10011002, 100110, 10011003, 10011001, 10011000, 3, 2, 1], [0, 100076, 0, 0, 0, null, null, null]] },
      MasterChallengeMusic: { columns: ["_liveMusicId", "_id", "_eventId"], rows: [[100111, 4, 2]] },
      MasterArenaMusic: { columns: ["_liveMusicId", "_id"], rows: [[100110, 7]] },
    }, charts: [{ scoreId: 10011103 }, { scoreId: 10011002 }, { scoreId: 10011100 }] };
}
async function fixture(options: { data?: unknown; glue?: Parameters<typeof syntheticGlue>[0] | ((sha: string) => Parameters<typeof syntheticGlue>[0]); commit?: string } = {}) {
  const deckData = encode(options.data ?? { format: "nnnotes.deck-data/1", provenance: { region: "tw", deck: { commit: "0123abcd" } }, master: {}, charts: [] });
  const deckSha = await digest(deckData);
  const glueOptions = typeof options.glue === "function" ? options.glue(deckSha) : options.glue ?? { datasetId: deckSha };
  const glue = encode(syntheticGlue(glueOptions)), wasm = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  const files = new Map<string, Uint8Array>([[`${BASE}/deck-data.json`, deckData], [`${BASE}/solver.js`, glue], [`${BASE}/solver_bg.wasm`, wasm]]);
  const init: DeckWorkerInit = { type: "init", protocol: DECK_WORKER_PROTOCOL,
    deckDataUrl: `${BASE}/deck-data.json`, deckDataSha256: deckSha, deckDataBytes: deckData.length,
    wasmUrl: `${BASE}/solver_bg.wasm`, wasmSha256: await digest(wasm), wasmBytes: wasm.length,
    glueUrl: `${BASE}/solver.js`, glueSha256: await digest(glue), glueBytes: glue.length, modelCommit: options.commit ?? "0123abcd" };
  const runtime: DeckSolverRuntime = { server: "intl", pointer: { kind: "build", url: `${BASE}/build.json` }, manifest: { url: `${BASE}/manifest.json`, sha256: "a".repeat(64) },
    deckData: { url: init.deckDataUrl, sha256: init.deckDataSha256, bytes: init.deckDataBytes },
    engine: { model: { commit: "0123abcd" }, js: { url: init.glueUrl, sha256: init.glueSha256, bytes: init.glueBytes }, wasm: { url: init.wasmUrl, sha256: init.wasmSha256, bytes: init.wasmBytes }, build: null },
    modelCommit: init.modelCommit, override: false };
  return { files, init, runtime, deckSha };
}

type Message = Record<string, unknown>;
function core(files: Map<string, Uint8Array>, overrides: Record<string, unknown> = {}) {
  const posted: Message[] = [], requested: string[] = [];
  const worker = createDeckWorkerCore({
    post: (message: Message) => { posted.push(message); },
    fetch: async (url: string) => { requested.push(url); const body = files.get(url); return body ? new Response(body.slice()) : new Response("missing", { status: 404 }); },
    ...overrides,
  });
  return { worker, posted, requested };
}
const run = (jobId: string, inputRevision: number, request: Record<string, unknown>, accountJson = `{"cards":[${BIG}]}`) =>
  ({ type: "run", jobId, inputRevision, accountJson, requestJson: JSON.stringify(request), progressIntervalMs: 250 });

describe("deck Worker core", () => {
  test("verifies and loads the solver, then forwards each progress and the result as exact text", async () => {
    const { files, init, deckSha } = await fixture(), { worker, posted, requested } = core(files);
    await worker.handle(init);
    expect(requested.sort()).toEqual([init.deckDataUrl, init.glueUrl, init.wasmUrl].sort());
    expect(posted).toEqual([{ type: "ready", datasetId: deckSha, initMs: expect.any(Number), capabilitiesJson: '{"objectives":["score"]}', catalog: EMPTY_CATALOG }]);
    await worker.handle(run("job-1", 7, { progress: 3 }));
    expect(posted.slice(1)).toEqual([
      ...[1, 2, 3].map((step) => ({ type: "progress", jobId: "job-1", inputRevision: 7, resultJson: `{"step":${step},"final":false,"account":{"cards":[${BIG}]}}` })),
      { type: "result", jobId: "job-1", inputRevision: 7, resultJson: `{"step":3,"final":true,"intervalMs":250,"account":{"cards":[${BIG}]}}` },
    ]);
  });

  test("reports master scene IDs and only the difficulties whose charts are loaded", async () => {
    const { files, init, deckSha } = await fixture({ data: catalogueData() }), { worker, posted } = core(files);
    await worker.handle(init);
    expect(posted).toEqual([{ type: "ready", datasetId: deckSha, initMs: expect.any(Number), capabilitiesJson: '{"objectives":["score"]}', catalog: CATALOG }]);
    await worker.handle(init);
    expect(posted[1]).toEqual(posted[0]);
  });

  test("event reward coverage follows eventGroup and validates entire grades in both tables", async () => {
    for (const table of ["MasterLiveEventReward", "MasterChallengeLiveEventReward"] as const) {
      for (const variant of ["valid", "groupOnly", "multiple", "otherResource", "weighted", "marker", "missingMarker", "duplicateId", "unknownGrade", "missingTable", "malformedRow", "otherEvent"] as const) {
        const data = catalogueData();
        const rewards = data.master[table];
        const row = rewards.rows[0]!;
        if (variant === "groupOnly") rewards.rows.forEach(row => { row[1] = row[2]!; row[2] = 99; });
        if (variant === "multiple" || variant === "otherResource" || variant === "weighted") {
          const extra = [...row]; extra[0] = 3;
          if (variant === "otherResource") { extra[4] = 2; extra[5] = 91; }
          if (variant === "weighted") { row[7] = 5000; extra[7] = 5000; }
          rewards.rows.push(extra);
        }
        if (variant === "marker") row[7] = 9999;
        if (variant === "missingMarker") { rewards.columns.pop(); rewards.rows.forEach(row => row.pop()); }
        if (variant === "duplicateId") rewards.rows.push([...row]);
        if (variant === "unknownGrade") row[3] = -1;
        if (variant === "missingTable") rewards.rows = [];
        if (variant === "malformedRow") rewards.rows.push([3]);
        if (variant === "otherEvent") { const extra = [...row]; extra[0] = 3; extra[2] = 99; extra[7] = 5000; rewards.rows.push(extra); }
        const { files, init } = await fixture({ data }), { worker, posted } = core(files);
        await worker.handle(init);
        const supported = variant === "valid" || variant === "otherEvent";
        expect(posted[0]).toMatchObject({ type: "ready", catalog: { eventItemRewards: [{ id: 2, itemId: 90,
          normal: table === "MasterLiveEventReward" ? supported : true,
          challenge: table === "MasterChallengeLiveEventReward" ? supported : true }] } });
        expect(parseDeckWorkerEvent(posted[0])).not.toBeNull();
      }
    }
  });

  test("mission coverage distinguishes LUCK in every range from known and unknown non-LUCK missions", async () => {
    const cases = [
      { missions: [2, 1, 3], hasLuck: true }, { missions: [1, 2, 3], hasLuck: true }, { missions: [1, 3, 2], hasLuck: true },
      { missions: [1, 3, 1], hasLuck: false }, { missions: [null, 1, 3], hasLuck: null }, { missions: ["2", 1, 3], hasLuck: null },
      { missions: [1, 4, 3], hasLuck: null }, { missions: [null, 2, null], hasLuck: true },
    ];
    const data = catalogueData();
    const { files, init } = await fixture({ data: { ...data, master: { MasterLiveMusic: {
      columns: ["_id", "_gekisouMission1", "_gekisouMission2", "_gekisouMission3"],
      rows: cases.map(({ missions }, index) => [index + 1, ...missions]),
    } } } });
    const { worker, posted } = core(files);
    await worker.handle(init);
    expect(posted[0]).toMatchObject({ type: "ready", catalog: { musics: cases.map(({ hasLuck }, index) => ({ id: index + 1, difficulties: [], hasLuck })) } });
    expect(parseDeckWorkerEvent(posted[0])).not.toBeNull();
  });

  test("missing mission columns remain unknown", async () => {
    const data = catalogueData();
    const { files, init } = await fixture({ data: { ...data, master: { MasterLiveMusic: { columns: ["_id"], rows: [[1]] } } } });
    const { worker, posted } = core(files);
    await worker.handle(init);
    expect(posted[0]).toMatchObject({ type: "ready", catalog: { musics: [{ id: 1, difficulties: [], hasLuck: null }] } });
  });

  test("empty, malformed and ambiguous master rows never claim available IDs", async () => {
    const data = catalogueData();
    const { files, init } = await fixture({ data: { ...data, master: {
      MasterEvent: { columns: ["_id", "_id"], rows: [[2, 3]] },
      MasterLiveMusic: { columns: ["_id", "_expertID"], rows: [[100111, 10011103], [100111, 10011103], [100110], ["100076", 10011103]] },
      MasterChallengeMusic: { columns: ["_id", "_liveMusicId"], rows: [[4, 100111]] },
      MasterArenaMusic: { columns: [], rows: [] },
    } } }), { worker, posted } = core(files);
    await worker.handle(init);
    expect(posted[0]).toMatchObject({ type: "ready", catalog: EMPTY_CATALOG });
  });

  test("chart IDs must be safe integers and match the song's difficulty columns", async () => {
    const data = catalogueData();
    const { files, init } = await fixture({ data: { ...data, charts: [null, { scoreId: "10011103" }, { scoreId: 10011102.5 }, { scoreId: Number.MAX_SAFE_INTEGER + 1 }, { scoreId: 10011100 }] } });
    const { worker, posted } = core(files);
    await worker.handle(init);
    expect(posted[0]).toMatchObject({ type: "ready", catalog: { ...CATALOG,
      musics: [{ id: 100076, difficulties: [], hasLuck: null }, { id: 100110, difficulties: [], hasLuck: true }, { id: 100111, difficulties: ["easy"], hasLuck: false }] } });
  });

  test("catalogue parsing preserves the exact deck bytes passed to the solver", async () => {
    const data = JSON.stringify(catalogueData()).replace('"charts":', `"integer":${BIG},"charts":`);
    const { files, init, deckSha } = await fixture({ data });
    let received: Uint8Array | null = null;
    const { worker, posted } = core(files, { loadSolver: async () => class {
      datasetId = deckSha;
      constructor(bytes: Uint8Array) { received = bytes; }
    } });
    await worker.handle(init);
    expect(received).toEqual(files.get(init.deckDataUrl)!);
    expect(new TextDecoder().decode(received!)).toContain(`"integer":${BIG}`);
    expect(posted[0]).toMatchObject({ type: "ready", datasetId: deckSha, catalog: CATALOG });
  });

  test("a SHA-256 or size that differs from the init message is an integrity failure", async () => {
    const changed = await fixture();
    const body = changed.files.get(changed.init.deckDataUrl)!.slice();
    body[body.length - 2] ^= 1;
    changed.files.set(changed.init.deckDataUrl, body);
    const hash = core(changed.files);
    await hash.worker.handle(changed.init);
    expect(hash.posted).toEqual([{ type: "failed", code: "integrity", message: expect.stringContaining("deck data: SHA-256") }]);

    const sized = await fixture(), size = core(sized.files);
    await size.worker.handle({ ...sized.init, wasmBytes: sized.init.wasmBytes + 1 });
    expect(size.posted).toEqual([{ type: "failed", code: "integrity", message: expect.stringContaining("engine WASM: 8 bytes") }]);
  });

  test("a solver that reports another dataset is an integrity failure", async () => {
    const { files, init } = await fixture({ glue: { datasetId: "f".repeat(64) } }), { worker, posted } = core(files);
    await worker.handle(init);
    expect(posted).toEqual([{ type: "failed", code: "integrity", message: expect.stringContaining(`dataset ${"f".repeat(64)}`) }]);
  });

  test("deck data of another model commit is an identity failure; a null commit skips the check", async () => {
    const { files, init } = await fixture({ commit: "ffff0000" }), mismatch = core(files);
    await mismatch.worker.handle(init);
    expect(mismatch.posted).toEqual([{ type: "failed", code: "identity", message: expect.stringContaining("model 0123abcd") }]);
    const skipped = core(files);
    await skipped.worker.handle({ ...init, modelCommit: null });
    expect(skipped.posted[0]).toMatchObject({ type: "ready" });
  });

  test("download failures are network failures", async () => {
    const { files, init } = await fixture();
    files.delete(init.glueUrl);
    const missing = core(files);
    await missing.worker.handle(init);
    expect(missing.posted).toEqual([{ type: "failed", code: "network", message: expect.stringContaining("HTTP 404") }]);
    const offline = core(files, { fetch: async () => { throw new TypeError("Failed to fetch"); } });
    await offline.worker.handle(init);
    expect(offline.posted[0]).toMatchObject({ type: "failed", code: "network" });
  });

  test("glue without DeckSolver, or a constructor that rejects the data, is an init failure", async () => {
    const noExport = await fixture({ glue: (sha) => ({ datasetId: sha, exportSolver: false }) }), a = core(noExport.files);
    await a.worker.handle(noExport.init);
    expect(a.posted).toEqual([{ type: "failed", code: "init", message: expect.stringContaining("exports no DeckSolver") }]);
    const rejected = await fixture(), b = core(rejected.files, { loadSolver: async () => class { constructor() { throw new Error("invalid deck data"); } } });
    await b.worker.handle(rejected.init);
    expect(b.posted).toEqual([{ type: "failed", code: "init", message: "DeckSolver: invalid deck data" }]);
  });

  test("a solver that throws during a run is a runtime failure, and the Worker refuses later runs", async () => {
    const { files, init } = await fixture(), { worker, posted } = core(files);
    await worker.handle(init);
    await worker.handle(run("job-1", 1, { crash: true }));
    expect(posted.at(-1)).toEqual({ type: "failed", jobId: "job-1", inputRevision: 1, code: "runtime", message: "RuntimeError: unreachable" });
    await worker.handle(run("job-2", 2, { progress: 0 }));
    expect(posted.at(-1)).toMatchObject({ type: "failed", jobId: "job-2", code: "runtime" });
  });

  test("a run sent during initialization waits for it; malformed and out-of-order messages are protocol failures", async () => {
    const { files, init } = await fixture(), { worker, posted } = core(files);
    await worker.handle(run("early", 1, { progress: 0 }));
    expect(posted).toEqual([{ type: "failed", jobId: "early", inputRevision: 1, code: "protocol", message: "The Worker is not initialized" }]);
    posted.length = 0;
    await Promise.all([worker.handle(init), worker.handle(run("queued", 2, { progress: 1 }))]);
    expect(posted.map((message) => message.type)).toEqual(["ready", "progress", "result"]);
    await worker.handle(init);
    expect(posted.at(-1)).toMatchObject({ type: "ready" });
    await worker.handle({ ...init, deckDataSha256: "b".repeat(64) });
    expect(posted.at(-1)).toEqual({ type: "failed", code: "protocol", message: "This Worker is bound to another runtime" });
    await worker.handle({ type: "run", jobId: "job", inputRevision: 1, accountJson: {}, requestJson: "{}", progressIntervalMs: 0 });
    expect(posted.at(-1)).toMatchObject({ type: "failed", jobId: "job", code: "protocol" });
    await worker.handle({ ...init, protocol: "moenotes.deck-worker/0" });
    await worker.handle("init");
    await worker.handle({ type: "cancel" });
    expect(posted.slice(-3).map((message) => message.code)).toEqual(["protocol", "protocol", "protocol"]);
  });

  test("the default loader imports the verified glue as an ES module and initializes it with the WASM bytes", async () => {
    const { files, init } = await fixture();
    const DeckSolver = await loadDeckSolverModule({ glue: files.get(init.glueUrl)!.slice().buffer, wasm: files.get(init.wasmUrl)!.slice().buffer });
    expect(new DeckSolver(files.get(init.deckDataUrl)!).datasetId).toBe(init.deckDataSha256);
  });
});

/** A Worker driven by the test: records what the page posts and delivers what the test emits. */
class ScriptedPort implements DeckWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: Message[] = [];
  terminated = false;
  postMessage(message: unknown) { this.posted.push(message as Message); }
  terminate() { this.terminated = true; }
  emit(data: Message) { this.onmessage?.({ data } as MessageEvent); }
}
function scripted() {
  const ports: ScriptedPort[] = [];
  const client = new DeckWorkerClient((url) => { expect(url).toMatch(/\/deck\/deck-worker\.js$/); const port = new ScriptedPort(); ports.push(port); return port; }, "https://site.example.invalid/deck/deck-worker.js");
  return { client, ports };
}
const DATASET = "d".repeat(64);
const ready = { type: "ready", datasetId: DATASET, initMs: 12, capabilitiesJson: null };

async function job(runtime: DeckSolverRuntime, jobId: string, inputRevision: number, progress: string[] = []): Promise<DeckRecommendJob> {
  return { runtime, jobId, inputRevision, accountJson: "{}", requestJson: "{}", progressIntervalMs: 100, onProgress: (text) => progress.push(text) };
}

describe("deck Worker client", () => {
  test("creates the Worker on first use, initializes it once, forwards current progress and drops stale replies", async () => {
    const { runtime } = await fixture(), { client, ports } = scripted();
    expect(ports).toHaveLength(0);
    const progress: string[] = [];
    const outcome = client.run(await job(runtime, "job-1", 3, progress));
    expect(ports).toHaveLength(1);
    const port = ports[0]!;
    expect(port.posted).toEqual([deckWorkerInit(runtime)]);
    port.emit(ready);
    await tick();
    expect(port.posted[1]).toEqual({ type: "run", jobId: "job-1", inputRevision: 3, accountJson: "{}", requestJson: "{}", progressIntervalMs: 100 });
    port.emit({ type: "progress", jobId: "job-0", inputRevision: 3, resultJson: "stale job" });
    port.emit({ type: "progress", jobId: "job-1", inputRevision: 2, resultJson: "stale revision" });
    port.emit({ type: "failed", jobId: "job-0", code: "runtime", message: "stale failure" });
    port.emit({ type: "progress", jobId: "job-1", inputRevision: 3, resultJson: "p1" });
    port.emit({ type: "result", jobId: "job-1", inputRevision: 2, resultJson: "stale result" });
    port.emit({ type: "result", jobId: "job-1", inputRevision: 3, resultJson: "final" });
    expect(await outcome).toEqual({ status: "complete", jobId: "job-1", inputRevision: 3, datasetId: DATASET, resultJson: "final" });
    expect(progress).toEqual(["p1"]);

    const second = client.run(await job(runtime, "job-2", 4));
    await tick();
    expect(ports).toHaveLength(1);
    expect(port.posted.map((message) => message.type)).toEqual(["init", "run", "run"]);
    port.emit({ type: "result", jobId: "job-2", inputRevision: 4, resultJson: "second" });
    expect((await second).resultJson).toBe("second");
    expect(port.terminated).toBe(false);
  });

  test("stop terminates a running Worker, keeps the last progress, and the next run builds a new Worker", async () => {
    const { runtime } = await fixture(), { client, ports } = scripted();
    const outcome = client.run(await job(runtime, "job-1", 1));
    ports[0]!.emit(ready);
    await tick();
    ports[0]!.emit({ type: "progress", jobId: "job-1", inputRevision: 1, resultJson: "p1" });
    ports[0]!.emit({ type: "progress", jobId: "job-1", inputRevision: 1, resultJson: "p2" });
    expect(client.running).toBe(true);
    client.stop();
    expect(ports[0]!.terminated).toBe(true);
    expect(client.running).toBe(false);
    expect(await outcome).toEqual({ status: "stopped", jobId: "job-1", inputRevision: 1, datasetId: DATASET, resultJson: "p2" });
    ports[0]!.emit({ type: "result", jobId: "job-1", inputRevision: 1, resultJson: "late" });

    const next = client.run(await job(runtime, "job-2", 2));
    expect(ports).toHaveLength(2);
    expect(ports[1]!.posted).toEqual([deckWorkerInit(runtime)]);
    ports[1]!.emit(ready);
    await tick();
    ports[1]!.emit({ type: "result", jobId: "job-2", inputRevision: 2, resultJson: "fresh" });
    expect(await next).toMatchObject({ status: "complete", resultJson: "fresh" });
  });

  test("a new run supersedes a running one; stopping during initialization keeps the Worker for the next run", async () => {
    const { runtime } = await fixture(), { client, ports } = scripted();
    const waiting = client.run(await job(runtime, "job-1", 1));
    client.stop();
    expect(await waiting).toEqual({ status: "stopped", jobId: "job-1", inputRevision: 1, datasetId: null, resultJson: null });
    expect(ports[0]!.terminated).toBe(false);
    const first = client.run(await job(runtime, "job-2", 2));
    expect(ports).toHaveLength(1);
    ports[0]!.emit(ready);
    await tick();
    expect(ports[0]!.posted.map((message) => message.type)).toEqual(["init", "run"]);
    const second = client.run(await job(runtime, "job-3", 3));
    expect(await first).toEqual({ status: "superseded", jobId: "job-2", inputRevision: 2, datasetId: DATASET, resultJson: null });
    expect(ports[0]!.terminated).toBe(true);
    expect(ports).toHaveLength(2);
    ports[1]!.emit(ready);
    await tick();
    ports[1]!.emit({ type: "result", jobId: "job-3", inputRevision: 3, resultJson: "third" });
    expect((await second).resultJson).toBe("third");
  });

  test("initialization and runtime failures end the job with the Worker's code, and a failed Worker is replaced", async () => {
    const { runtime } = await fixture(), { client, ports } = scripted();
    const integrity = client.run(await job(runtime, "job-1", 1));
    ports[0]!.emit({ type: "failed", code: "integrity", message: "deck data: SHA-256 differs" });
    expect(await integrity).toEqual({ status: "failed", code: "integrity", message: "deck data: SHA-256 differs", jobId: "job-1", inputRevision: 1, datasetId: null, resultJson: null });
    expect(ports[0]!.terminated).toBe(true);

    const crash = client.run(await job(runtime, "job-2", 2));
    expect(ports).toHaveLength(2);
    ports[1]!.emit(ready);
    await tick();
    ports[1]!.emit({ type: "progress", jobId: "job-2", inputRevision: 2, resultJson: "p1" });
    ports[1]!.emit({ type: "failed", jobId: "job-2", inputRevision: 2, code: "runtime", message: "unreachable" });
    expect(await crash).toEqual({ status: "failed", code: "runtime", message: "unreachable", jobId: "job-2", inputRevision: 2, datasetId: DATASET, resultJson: "p1" });
    expect(ports[1]!.terminated).toBe(true);

    const error = client.run(await job(runtime, "job-3", 3));
    ports[2]!.onerror?.({ message: "script failed", preventDefault: () => undefined } as ErrorEvent);
    expect(await error).toMatchObject({ status: "failed", code: "init", message: "script failed" });
  });

  test("another runtime gets its own Worker; prepare reports readiness; invalid jobs fail before any Worker starts", async () => {
    const a = await fixture(), b = await fixture({ commit: "4567cdef" }), { client, ports } = scripted();
    const prepared = client.prepare(a.runtime);
    ports[0]!.emit(ready);
    expect(await prepared).toEqual({ status: "ready", datasetId: DATASET, initMs: 12, capabilitiesJson: null, catalog: null });
    const other = client.run(await job(b.runtime, "job-1", 1));
    expect(ports[0]!.terminated).toBe(true);
    expect(ports[1]!.posted[0]).toMatchObject({ type: "init", modelCommit: "4567cdef" });
    client.dispose();
    expect(await other).toMatchObject({ status: "stopped" });
    expect(ports[1]!.terminated).toBe(true);
    expect(await client.run({ ...await job(a.runtime, "", 1) })).toMatchObject({ status: "failed", code: "protocol" });
    expect(ports).toHaveLength(2);
  });

  test("prepare and onReady carry the catalogue of the initialized dataset", async () => {
    const { runtime } = await fixture(), { client, ports } = scripted();
    const prepared = client.prepare(runtime);
    ports[0]!.emit({ ...ready, catalog: CATALOG });
    const info = { datasetId: DATASET, initMs: 12, capabilitiesJson: null, catalog: CATALOG };
    expect(await prepared).toEqual({ status: "ready", ...info });
    const notices: unknown[] = [];
    const outcome = client.run({ ...await job(runtime, "job-catalog", 1), onReady: value => notices.push(value) });
    await tick();
    expect(notices).toEqual([info]);
    ports[0]!.emit({ type: "result", jobId: "job-catalog", inputRevision: 1, resultJson: "{}" });
    expect((await outcome).status).toBe("complete");
  });

  test("against the Worker core with synthetic glue: complete result, then stop with the last progress and rebuild", async () => {
    const { files, runtime, deckSha } = await fixture();
    const ports: DeckWorkerPort[] = [];
    // An in-process Worker: messages cross asynchronously in both directions, and nothing crosses once terminated.
    const factory = () => {
      let terminated = false;
      const port: DeckWorkerPort = { onmessage: null, onerror: null, terminate: () => { terminated = true; },
        postMessage: (message) => { const copy = structuredClone(message); setTimeout(() => { if (!terminated) void inner.handle(copy); }, 0); } };
      const inner = core(files, { post: (message: Message) => { const copy = structuredClone(message); setTimeout(() => { if (!terminated) port.onmessage?.({ data: copy } as MessageEvent); }, 0); } }).worker;
      ports.push(port);
      return port;
    };
    const client = new DeckWorkerClient(factory, "https://site.example.invalid/deck/deck-worker.js");
    const progress: string[] = [];
    const base = { runtime, accountJson: `{"cards":[${BIG}]}`, progressIntervalMs: 50 };
    expect(await client.run({ ...base, jobId: "job-1", inputRevision: 1, requestJson: '{"progress":2}', onProgress: (text) => progress.push(text) }))
      .toEqual({ status: "complete", jobId: "job-1", inputRevision: 1, datasetId: deckSha, resultJson: `{"step":2,"final":true,"intervalMs":50,"account":{"cards":[${BIG}]}}` });
    expect(progress).toHaveLength(2);

    let stopAfterFirst!: () => void;
    const stopped = client.run({ ...base, jobId: "job-2", inputRevision: 2, requestJson: '{"progress":5}', onProgress: () => stopAfterFirst() });
    stopAfterFirst = () => client.stop();
    expect(await stopped).toEqual({ status: "stopped", jobId: "job-2", inputRevision: 2, datasetId: deckSha, resultJson: `{"step":1,"final":false,"account":{"cards":[${BIG}]}}` });
    expect(ports).toHaveLength(1);
    expect((await client.run({ ...base, jobId: "job-3", inputRevision: 3, requestJson: '{"progress":0}' })).status).toBe("complete");
    expect(ports).toHaveLength(2);
  });
});

describe("deck Worker protocol and files", () => {
  test("ready accepts a reported catalogue and normalizes an absent catalogue to null", () => {
    expect(parseDeckWorkerEvent(ready)).toEqual({ ...ready, catalog: null });
    expect(parseDeckWorkerEvent({ ...ready, catalog: null })).toEqual({ ...ready, catalog: null });
    expect(parseDeckWorkerEvent({ ...ready, catalog: CATALOG })).toEqual({ ...ready, catalog: CATALOG });
    expect(parseDeckWorkerEvent({ ...ready, catalog: EMPTY_CATALOG })).toEqual({ ...ready, catalog: EMPTY_CATALOG });
  });

  test("ready rejects malformed catalogues instead of accepting their availability claims", () => {
    for (const catalog of [false, {}, { ...CATALOG, eventIds: [2, 2] }, { ...CATALOG, eventIds: [Number.MAX_SAFE_INTEGER + 1] },
      { ...CATALOG, musics: [{ id: 100111, difficulties: ["master"], hasLuck: false }] }, { ...CATALOG, musics: [{ id: 100111, difficulties: ["easy", "easy"], hasLuck: false }] },
      ...[undefined, 0, 1, "false", "true"].map(hasLuck => ({ ...CATALOG, musics: [{ id: 100111, difficulties: ["easy"], hasLuck }] })),
      { ...CATALOG, challengeMusics: [{ id: 4, eventId: "2", musicId: 100111 }] }, { ...CATALOG, arenaMusics: [{ id: 7, musicId: 0 }] }]) {
      expect(parseDeckWorkerEvent({ ...ready, catalog })).toBeNull();
    }
  });

  test("reward coverage requires event-bound IDs and boolean scene support", () => {
    const supported = { id: 2, itemId: 90, normal: true, challenge: true };
    for (const eventItemRewards of [null, {}, [supported, supported], [{ ...supported, id: 3 }],
      [{ ...supported, itemId: 0 }], [{ ...supported, normal: 1 }], [{ ...supported, challenge: "true" }]]) {
      expect(parseDeckWorkerEvent({ ...ready, catalog: { ...CATALOG, eventItemRewards } })).toBeNull();
    }
    expect(parseDeckWorkerEvent({ ...ready, catalog: { ...CATALOG, eventItemRewards: undefined } })).not.toBeNull();
  });

  test("reply parsing and binding", () => {
    expect(parseDeckWorkerEvent({ type: "ready", datasetId: "A".repeat(64), initMs: 1, capabilitiesJson: null })).toBeNull();
    expect(parseDeckWorkerEvent({ type: "progress", jobId: "j", inputRevision: 1.5, resultJson: "{}" })).toBeNull();
    expect(parseDeckWorkerEvent({ type: "failed", code: "unknown", message: "" })).toBeNull();
    const progress = parseDeckWorkerEvent({ type: "progress", jobId: "j", inputRevision: 2, resultJson: "{}" })!;
    expect(isCurrentDeckWorkerReply({ jobId: "j", inputRevision: 2 }, progress)).toBe(true);
    expect(isCurrentDeckWorkerReply({ jobId: "j", inputRevision: 3 }, progress)).toBe(false);
    expect(isCurrentDeckWorkerReply({ jobId: "k", inputRevision: 2 }, progress)).toBe(false);
  });

  test("the site serves the Worker shell and its core module from public/deck; the engine comes with the data", () => {
    expect(assetConfig.deck.workerUrl).toBe("/deck/deck-worker.js");
    expect(assetConfig.deck.recommendEngine).toBeNull();
    expect(readdirSync(runtimeDir).sort()).toEqual(["deck-worker-core.mjs", "deck-worker.js"]);
    expect(readFileSync(path.join(runtimeDir, "deck-worker.js"), "utf8")).toContain("import('./deck-worker-core.mjs')");
  });

  test("the Worker shell loads its core and answers in a real Worker", async () => {
    const worker = new Worker(path.join(runtimeDir, "deck-worker.js"));
    try {
      const reply = await new Promise<unknown>((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message));
        worker.postMessage({ type: "unknown" });
      });
      expect(reply).toEqual({ type: "failed", code: "protocol", message: "Unknown message type unknown" });
    } finally { worker.terminate(); }
  });
});
