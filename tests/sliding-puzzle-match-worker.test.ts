import { describe, expect, test } from "bun:test";
import { confirmPuzzleObservation, fullPuzzleCropFields } from "../src/lib/sliding-puzzle/crop";
import { matchPuzzleFragments, type PuzzleFragmentMatchInput } from "../src/lib/sliding-puzzle/matching";
import { preparePuzzleMatch, readPuzzleMatchRequest, validatePuzzleMatchReply, type PuzzleMatchReply, type PuzzleMatchRequest } from "../src/lib/sliding-puzzle/match-protocol";
import { createPuzzleMatchHandler } from "../src/lib/sliding-puzzle/match-handler";
import { PuzzleWorkerClient, type PuzzleMatchJob, type PuzzleWorkerPort } from "../src/lib/sliding-puzzle/worker-client";
import { PUZZLE_WORKER_PROTOCOL } from "../src/lib/sliding-puzzle/worker-protocol";
import { createPuzzleWorkerHandler } from "../src/lib/sliding-puzzle/worker-handler";
import type { PuzzleSize } from "../src/lib/sliding-puzzle/model";

/** Pure color texture, with no printed numbers or hidden label pixels. */
function fixture(size: PuzzleSize = 3, inferred = false): { input: PuzzleFragmentMatchInput; cells: number[] } {
  const tile = 32, width = size * tile, height = width;
  const artwork = { width, height, rgba: new Uint8Array(width * height * 4) };
  let random = 123456789;
  for (let index = 0; index < artwork.rgba.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; artwork.rgba[index + channel] = 20 + random % 215; }
    artwork.rgba[index + 3] = 255;
  }
  const screenshot = { width, height, rgba: new Uint8Array(artwork.rgba.length) };
  const cells = Array.from({ length: size * size }, (_, index) => (index + 3) % (size * size));
  for (let index = 0; index < cells.length; index++) {
    const id = cells[index]!, dx = index % size * tile, dy = Math.floor(index / size) * tile;
    for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
      const output = ((dy + y) * width + dx + x) * 4;
      const input = ((Math.floor((id - 1) / size) * tile + y) * width + (id - 1) % size * tile + x) * 4;
      for (let channel = 0; channel < 3; channel++) screenshot.rgba[output + channel] = id === 0 ? 30 : artwork.rgba[input + channel]!;
      screenshot.rgba[output + 3] = 255;
    }
  }
  return { cells, input: { artworkSourceId: "tw:song:jacket", artwork, screenshot,
    observation: confirmPuzzleObservation("screenshot-hash", size, screenshot, fullPuzzleCropFields(screenshot), inferred ? null : cells.indexOf(0)) } };
}

const binding = Object.freeze({ jobId: "match-job", inputRevision: "review-1", artworkSourceId: "tw:song:jacket" });
const request = (input = fixture().input): PuzzleMatchRequest => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "match", requestId: 1, binding, input, timeLimitMs: 10000 });
const answer = (input = fixture().input): PuzzleMatchReply => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "matchResult", requestId: 1, binding, result: { status: "review", match: matchPuzzleFragments(input) } });

class Port implements PuzzleWorkerPort {
  onmessage: PuzzleWorkerPort["onmessage"] = null;
  onerror: PuzzleWorkerPort["onerror"] = null;
  onmessageerror: PuzzleWorkerPort["onmessageerror"] = null;
  sent: PuzzleMatchRequest[] = [];
  detached: number[] = [];
  terminated = 0;
  failPost = false;
  postMessage(message: unknown, transfer: Transferable[] = []) {
    if (this.failPost) throw new Error("post failed");
    this.sent.push(structuredClone(message, { transfer }));
    this.detached.push(...transfer.map(buffer => (buffer as ArrayBuffer).byteLength));
  }
  terminate() { this.terminated++; }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
  answer() {
    const sent = this.sent.at(-1)!;
    if (sent.type === "match") createPuzzleMatchHandler(reply => this.emit(reply))(sent);
    else createPuzzleWorkerHandler(reply => this.emit(reply))(sent);
  }
}

function harness(failPost = false) {
  let clock = 0;
  const ports: Port[] = [], timers = new Set<() => void>();
  const client = new PuzzleWorkerClient({ createWorker: () => { const port = new Port(); port.failPost = failPost; ports.push(port); return port; }, now: () => clock,
    schedule: callback => { const timer = () => { timers.delete(timer); callback(); }; timers.add(timer); return () => { timers.delete(timer); }; } });
  const job = (changes: Partial<PuzzleMatchJob> = {}): PuzzleMatchJob => ({ binding, input: fixture().input, timeLimitMs: 100, isCurrent: () => true, ...changes });
  return { client, ports, timers, job, setClock: (value: number) => { clock = value; }, fire: () => [...timers].forEach(callback => callback()) };
}

describe("puzzle image match protocol", () => {
  test("validates envelopes and bounds before admitting a Worker request", () => {
    expect(readPuzzleMatchRequest(request())?.binding).toEqual(binding);
    for (const value of [null, { ...request(), type: "solve" }, { ...request(), protocol: "old" }, { ...request(), requestId: 0 },
      { ...request(), timeLimitMs: 0 }, { ...request(), timeLimitMs: 120001 }, { ...request(), binding: { ...binding, inputRevision: "" } }]) {
      expect(readPuzzleMatchRequest(value)).toBeNull();
    }
  });

  test("copies only pixel views, snapshots metadata and transfers copies without detaching originals", () => {
    const { input } = fixture(), bytes = input.artwork.rgba as Uint8Array;
    const backing = new Uint8Array(bytes.length + 20).fill(241); backing.set(bytes, 8);
    const view = backing.subarray(8, 8 + bytes.length);
    const prepared = preparePuzzleMatch({ ...input, artwork: { ...input.artwork, rgba: view } });
    const snapshot = Array.from(new Uint8Array(prepared.input.artwork.rgba as ArrayBuffer));
    view[0] = 0;
    expect(new Uint8Array(prepared.input.artwork.rgba as ArrayBuffer)[0]).toBe(snapshot[0]);
    const transferred = structuredClone(prepared.input, { transfer: prepared.transfer });
    expect((prepared.input.artwork.rgba as ArrayBuffer).byteLength).toBe(0);
    expect((prepared.input.screenshot.rgba as ArrayBuffer).byteLength).toBe(0);
    expect(backing.byteLength).toBe(bytes.length + 20);
    expect((input.screenshot.rgba as Uint8Array).byteLength).toBe(bytes.length);
    expect(Array.from(new Uint8Array(transferred.artwork.rgba as ArrayBuffer))).toEqual(snapshot);
    expect(Object.isFrozen(prepared.context.observation.cells)).toBe(true);
    expect("rgba" in prepared.context.artwork).toBe(false);
  });

  test("rejects mismatched dimensions, pixels and crop instead of constructing a match", () => {
    const { input } = fixture();
    for (const changed of [{ ...input, artworkSourceId: "" }, { ...input, artwork: { ...input.artwork, rgba: new ArrayBuffer(3) } },
      { ...input, screenshot: { ...input.screenshot, width: input.screenshot.width + 1 } },
      { ...input, artworkCrop: { x: -1, y: 0, width: 96, height: 96 } }, { ...input, policy: { maxPairCost: NaN } }]) {
      expect(() => preparePuzzleMatch(changed)).toThrow();
    }
  });

  test("accepts provided and inferred blanks at every size, always as a frozen review result", () => {
    for (const size of [3, 4, 5, 6, 7, 8] as const) for (const inferred of [false, true]) {
      const { input, cells } = fixture(size, inferred), prepared = preparePuzzleMatch(input);
      const result = validatePuzzleMatchReply(answer(input), 1, binding, prepared.context);
      expect(result.status).toBe("review");
      if (result.status !== "review") throw new Error("Expected review");
      expect(result.match.draftCells).toEqual(cells);
      expect(result.match.reviewRequired).toBe(true);
      expect(result.match.complete).toBe(true);
      expect(Object.isFrozen(result.match.cells[0]!.candidates)).toBe(true);
    }
  }, 15000);

  test("rejects changed sources, forged auto-approval, duplicate IDs, scores and observation coordinates", () => {
    const { input } = fixture(), prepared = preparePuzzleMatch(input), valid = answer(input);
    const mutations: ((value: any) => void)[] = [
      value => { value.binding.inputRevision = "other"; }, value => { value.type = "result"; },
      value => { value.result.match.reviewRequired = false; }, value => { value.result.match.artworkSourceId = "other"; },
      value => { value.result.match.observation.sourceId = "other"; }, value => { value.result.match.observation.cells[0].rect.x++; },
      value => { value.result.match.cells[0].proposedTileId = value.result.match.cells[1].proposedTileId; },
      value => { value.result.match.cells[0].candidates[0].cost = 0.9; }, value => { value.result.match.cells[0].assignmentMargin = Infinity; },
      value => { value.result.match.draftCells[0] = null; }, value => { value.result.match.complete = false; },
    ];
    for (const mutate of mutations) { const invalid = structuredClone(valid); mutate(invalid); expect(() => validatePuzzleMatchReply(invalid, 1, binding, prepared.context)).toThrow(); }
  });

  test("accepts bounded non-review outcomes without admitting an image assignment", () => {
    const { input } = fixture(), context = preparePuzzleMatch(input).context;
    for (const result of [{ status: "invalid" }, { status: "timeLimit" }, { status: "failed", code: "runtime" }] as const) {
      expect(validatePuzzleMatchReply({ ...answer(input), result }, 1, binding, context)).toEqual(result);
    }
    expect(() => validatePuzzleMatchReply({ ...answer(input), result: { status: "solved" } }, 1, binding, context)).toThrow();
  });

  test("preserves uncertain fragments instead of silently filling a global proposal", () => {
    const { input } = fixture(3, true);
    (input.artwork.rgba as Uint8Array).fill(255);
    const valid = answer(input), prepared = preparePuzzleMatch(input);
    const result = validatePuzzleMatchReply(valid, 1, binding, prepared.context);
    if (result.status !== "review") throw new Error("Expected review");
    expect(result.match.complete).toBe(false);
    expect(result.match.draftCells.some(cell => cell === null)).toBe(true);
    expect(result.match.blank.status).toBe("uncertain");
  });

  test("Worker revalidates source and buffers before computing, and normalizes failures and budgets", () => {
    const replies: PuzzleMatchReply[] = []; let called = 0, clock = 0;
    const handler = createPuzzleMatchHandler(reply => replies.push(reply), { now: () => clock, match: input => { called++; clock = 100; return matchPuzzleFragments(input); } });
    handler({ ...request(), binding: { ...binding, artworkSourceId: "other" } });
    expect(replies.at(-1)!.result).toEqual({ status: "failed", code: "protocol" });
    expect(called).toBe(0);
    handler({ ...request(), input: { ...fixture().input, artwork: { width: 96, height: 96, rgba: new ArrayBuffer(3) } } });
    expect(replies.at(-1)!.result.status).toBe("failed"); expect(called).toBe(0);
    handler({ ...request(), timeLimitMs: 100 });
    expect(replies.at(-1)!.result).toEqual({ status: "timeLimit" });
    const failure = createPuzzleMatchHandler(reply => replies.push(reply), { match: () => { throw new Error("private detail"); } });
    failure(request()); expect(replies.at(-1)!.result).toEqual({ status: "failed", code: "runtime" });
  });
});

describe("puzzle matching Worker lifecycle", () => {
  test("reuses a healthy match Worker and retains the original screenshot and artwork pixels", async () => {
    const h = harness(), job = h.job(), input = job.input;
    try {
      const first = h.client.match(job), port = h.ports[0]!;
      expect(port.detached).toEqual([0, 0]);
      expect((input.artwork.rgba as Uint8Array).byteLength).toBeGreaterThan(0);
      expect((input.screenshot.rgba as Uint8Array).byteLength).toBeGreaterThan(0);
      port.answer(); expect((await first).result.status).toBe("review");
      const retry = h.client.match(h.job()); port.answer(); expect((await retry).result.status).toBe("review");
      expect(h.ports).toHaveLength(1); expect(h.timers.size).toBe(0);
    } finally { h.client.dispose(); }
  });

  test("returns invalid pixel input locally without allocating a Worker", async () => {
    const h = harness(), input = fixture().input;
    const outcome = await h.client.match(h.job({ input: { ...input, screenshot: { ...input.screenshot, rgba: new ArrayBuffer(0) } } }));
    expect(outcome.result).toEqual({ status: "invalid" }); expect(h.ports).toHaveLength(0);
    h.client.dispose();
  });

  test("cancels immediately and ignores a late old Worker callback after a retry", async () => {
    const h = harness();
    try {
      const first = h.client.match(h.job()), old = h.ports[0]!, late = old.onmessage!;
      h.client.cancel(); expect((await first).result.status).toBe("cancelled"); expect(old.terminated).toBe(1);
      const retry = h.client.match(h.job());
      const oldRequest = old.sent[0]!;
      late({ data: { ...answer(oldRequest.input), requestId: oldRequest.requestId, binding: oldRequest.binding } } as MessageEvent);
      expect(h.client.running).toBe(true);
      h.ports[1]!.answer(); expect((await retry).result.status).toBe("review");
    } finally { h.client.dispose(); }
  });

  test("supersedes matching and solving in both directions without publishing the old task", async () => {
    const h = harness();
    try {
      const matching = h.client.match(h.job());
      const solving = h.client.run({ binding, input: { size: 3, cells: [1, 2, 3, 4, 5, 6, 7, 0, 8] }, timeLimitMs: 100, isCurrent: () => true });
      expect((await matching).result.status).toBe("stale"); expect(h.ports[0]!.terminated).toBe(1);
      const nextMatch = h.client.match(h.job()); expect((await solving).result.status).toBe("stale");
      expect(h.ports[1]!.terminated).toBe(1); h.ports[2]!.answer(); expect((await nextMatch).result.status).toBe("review");
    } finally { h.client.dispose(); }
  });

  test("rejects stale inputs, late results and malformed replies; early timeout wakeups are rearmed", async () => {
    const h = harness();
    try {
      let current = true;
      const stale = h.client.match(h.job({ isCurrent: () => current })); current = false; h.ports[0]!.answer();
      expect((await stale).result.status).toBe("stale");
      const timeout = h.client.match(h.job()); h.setClock(99.8); h.fire();
      expect(h.client.running).toBe(true); h.setClock(100); h.ports[1]!.answer();
      expect((await timeout).result.status).toBe("timeLimit");
      const malformed = h.client.match(h.job()); h.ports[2]!.emit({ nonsense: true });
      expect((await malformed).result).toEqual({ status: "failed", code: "protocol" });
      expect(h.timers.size).toBe(0);
    } finally { h.client.dispose(); }
  });

  test("normalizes post, message and runtime errors and settles disposal exactly once", async () => {
    for (const fault of ["post", "message", "runtime", "dispose"] as const) {
      const h = harness(fault === "post");
      const pending = h.client.match(h.job()), port = h.ports[0]!;
      if (fault === "post") expect((await pending).result).toEqual({ status: "failed", code: "message" });
      else if (fault === "message") { port.onmessageerror?.({} as MessageEvent); expect((await pending).result).toEqual({ status: "failed", code: "message" }); }
      else if (fault === "runtime") { port.onerror?.({ preventDefault() {} } as ErrorEvent); expect((await pending).result).toEqual({ status: "failed", code: "worker" }); }
      else { h.client.dispose(); expect((await pending).result.status).toBe("cancelled"); }
      h.client.dispose(); expect(h.timers.size).toBe(0);
    }
  });
});

describe("real image matching module Worker", () => {
  test("transfers owned copies into an isolated realm and returns review only for all six sizes", async () => {
    let created = 0;
    const client = new PuzzleWorkerClient({ createWorker: () => {
      created++;
      const worker = new Worker(new URL("../src/lib/sliding-puzzle/puzzle.worker.ts", import.meta.url), { type: "module" });
      const result: PuzzleWorkerPort = { onmessage: null, onerror: null, onmessageerror: null,
        postMessage: (message, transfer) => worker.postMessage(message, transfer ?? []), terminate: () => worker.terminate() };
      worker.onmessage = event => result.onmessage?.(event); worker.onerror = event => result.onerror?.(event); worker.onmessageerror = event => result.onmessageerror?.(event);
      return result;
    } });
    try {
      for (const size of [3, 4, 5, 6, 7, 8] as const) {
        const { input, cells } = fixture(size, true);
        const outcome = await client.match({ binding: { ...binding, jobId: `real-${size}` }, input, timeLimitMs: 10000, isCurrent: () => true });
        expect(outcome.result.status).toBe("review");
        if (outcome.result.status !== "review") throw new Error(`Matching failed for size ${size}: ${JSON.stringify(outcome.result)}`);
        expect(outcome.result.match.draftCells).toEqual(cells);
        expect(outcome.result.match.reviewRequired).toBe(true);
        expect((input.artwork.rgba as Uint8Array).byteLength).toBe(size * size * 32 * 32 * 4);
        expect((input.screenshot.rgba as Uint8Array).byteLength).toBe(size * size * 32 * 32 * 4);
      }
      expect(created).toBe(1);
    } finally { client.dispose(); }
  }, 20000);
});
