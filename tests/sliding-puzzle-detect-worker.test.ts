import { describe, expect, test } from "bun:test";
import { suggestPuzzleRegions } from "../src/lib/sliding-puzzle/detection";
import { createPuzzleDetectHandler } from "../src/lib/sliding-puzzle/detect-handler";
import { preparePuzzleDetect, PUZZLE_NO_ARTWORK, readPuzzleDetectRequest, validatePuzzleDetectReply, type PuzzleDetectInput, type PuzzleDetectReply, type PuzzleDetectRequest } from "../src/lib/sliding-puzzle/detect-protocol";
import { PuzzleWorkerClient, type PuzzleDetectJob, type PuzzleWorkerPort } from "../src/lib/sliding-puzzle/worker-client";
import { PUZZLE_WORKER_PROTOCOL, type PuzzleTaskBinding } from "../src/lib/sliding-puzzle/worker-protocol";

const hash = (x: number, y: number, salt: number) => {
  let value = Math.imul(x + salt * 101, 374761393) ^ Math.imul(y - salt * 37, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};
const palette = [[210, 60, 70], [60, 150, 210], [80, 180, 90], [220, 170, 60], [150, 80, 200], [60, 200, 190], [220, 110, 180], [120, 120, 220], [90, 140, 60]];
function fixture(artworkSourceId: string = PUZZLE_NO_ARTWORK): PuzzleDetectInput {
  const width = 600, height = 600, board = { x: 40, y: 40, width: 520, height: 520 }, size = 3 as const;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 50 + hash(x, y, 1) * 30; rgba[offset + 1] = 55 + hash(x, y, 2) * 30; rgba[offset + 2] = 70 + hash(x, y, 3) * 30; rgba[offset + 3] = 255;
  }
  for (let y = board.y; y < board.y + board.height; y++) for (let x = board.x; x < board.x + board.width; x++) {
    const column = Math.floor((x - board.x) * size / board.width), row = Math.floor((y - board.y) * size / board.height);
    const index = row * size + column, offset = (y * width + x) * 4;
    const edge = (x - board.x) % (board.width / size) < 2 || (y - board.y) % (board.height / size) < 2;
    const color = index === size * size - 1 ? [30, 30, 34] : palette[index]!;
    rgba[offset] = edge ? 12 : color[0]! + hash(x, y, 5) * 20 - 10;
    rgba[offset + 1] = edge ? 12 : color[1]! + hash(x, y, 6) * 20 - 10;
    rgba[offset + 2] = edge ? 12 : color[2]! + hash(x, y, 7) * 20 - 10;
  }
  const artwork = artworkSourceId === PUZZLE_NO_ARTWORK ? null : { width: 300, height: 300, rgba: (() => {
    const image = new Uint8Array(300 * 300 * 4);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) {
      const column = Math.floor(x / 100), row = Math.floor(y / 100), index = row * 3 + column, color = palette[index]!, offset = (y * 300 + x) * 4;
      image[offset] = color[0]!; image[offset + 1] = color[1]!; image[offset + 2] = color[2]!; image[offset + 3] = 255;
    }
    return image.buffer;
  })() };
  return { size, screenshot: { width, height, rgba }, artworkSourceId, artwork };
}

const binding: PuzzleTaskBinding = Object.freeze({ jobId: "detect-job", inputRevision: "detect-1", artworkSourceId: PUZZLE_NO_ARTWORK });
const request = (input: PuzzleDetectInput = fixture(), task: PuzzleTaskBinding = binding): PuzzleDetectRequest => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "detect", requestId: 1, binding: task, input, timeLimitMs: 5000 });
const answer = (input: PuzzleDetectInput = fixture(), task: PuzzleTaskBinding = binding): PuzzleDetectReply => ({
  protocol: PUZZLE_WORKER_PROTOCOL, type: "detectResult", requestId: 1, binding: task,
  result: { status: "suggestions", suggestions: suggestPuzzleRegions(input.screenshot, input.size, input.artwork ?? undefined) },
});

class Port implements PuzzleWorkerPort {
  onmessage: PuzzleWorkerPort["onmessage"] = null;
  onerror: PuzzleWorkerPort["onerror"] = null;
  onmessageerror: PuzzleWorkerPort["onmessageerror"] = null;
  sent: PuzzleDetectRequest[] = [];
  terminated = 0;
  postMessage(message: unknown, transfer: Transferable[] = []) { this.sent.push(structuredClone(message, { transfer })); }
  terminate() { this.terminated++; }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
  reply() { const sent = this.sent.at(-1)!; createPuzzleDetectHandler(value => this.emit(value))(sent); }
}

function harness() {
  const ports: Port[] = [];
  const client = new PuzzleWorkerClient({ createWorker: () => { const port = new Port(); ports.push(port); return port; }, now: () => 0, schedule: () => () => undefined });
  const job = (changes: Partial<PuzzleDetectJob> = {}): PuzzleDetectJob => ({ binding, input: fixture(), timeLimitMs: 5000, isCurrent: () => true, ...changes });
  return { client, ports, job };
}

describe("puzzle board detection protocol", () => {
  test("validates the envelope before admitting a Worker request", () => {
    expect(readPuzzleDetectRequest(request())?.binding).toEqual(binding);
    for (const value of [null, { ...request(), type: "match" }, { ...request(), protocol: "old" }, { ...request(), requestId: 0 },
      { ...request(), timeLimitMs: 0 }, { ...request(), timeLimitMs: 120001 }, { ...request(), binding: { ...binding, inputRevision: "" } },
      { ...request(), input: null }]) expect(readPuzzleDetectRequest(value)).toBeNull();
  });

  test("copies pixel views, snapshots metadata and never detaches the caller's buffers", () => {
    const input = fixture(), bytes = input.screenshot.rgba as Uint8Array;
    const backing = new Uint8Array(bytes.length + 16).fill(7); backing.set(bytes, 8);
    const view = backing.subarray(8, 8 + bytes.length);
    const prepared = preparePuzzleDetect({ ...input, screenshot: { ...input.screenshot, rgba: view } });
    expect(prepared.context.size).toBe(3);
    expect(prepared.context.screenshot).toEqual({ width: 600, height: 600 });
    expect(prepared.context.artwork).toBeNull();
    expect(prepared.transfer).toHaveLength(1);
    view[0] = 0;
    expect(new Uint8Array(prepared.input.screenshot.rgba as ArrayBuffer)[0]).not.toBe(0);
    structuredClone(prepared.input, { transfer: prepared.transfer });
    expect((prepared.input.screenshot.rgba as ArrayBuffer).byteLength).toBe(0);
    expect(backing.byteLength).toBe(bytes.length + 16);
  });

  test("requires a real source for artwork and rejects screenshots smaller than the board", () => {
    const input = fixture("tw:song:jacket");
    expect(preparePuzzleDetect(input).context.artwork).toEqual({ width: 300, height: 300 });
    expect(() => preparePuzzleDetect({ ...input, artworkSourceId: PUZZLE_NO_ARTWORK })).toThrow();
    expect(() => preparePuzzleDetect({ ...input, artwork: null })).toThrow();
    expect(() => preparePuzzleDetect({ ...fixture(), artworkSourceId: "tw:song:jacket", artwork: fixture("tw:song:jacket").artwork })).not.toThrow();
    expect(() => preparePuzzleDetect({ ...input, size: 8, screenshot: { width: 4, height: 4, rgba: new Uint8Array(64) } })).toThrow();
  });

  test("accepts only bounded, sorted, review-required suggestions", () => {
    const input = fixture(), prepared = preparePuzzleDetect(input);
    const valid = answer();
    expect(validatePuzzleDetectReply(valid, 1, binding, prepared.context).status).toBe("suggestions");
    const broken: unknown[] = [
      { ...valid, requestId: 2 }, { ...valid, binding: { ...binding, jobId: "other" } },
      { ...valid, result: { ...valid.result, suggestions: { reviewRequired: false, candidates: [] } } },
      { ...valid, result: { ...valid.result, suggestions: { reviewRequired: true, candidates: Array(6).fill((valid.result as { suggestions: { candidates: unknown[] } }).suggestions.candidates[0]) } } },
      { ...valid, result: { ...valid.result, suggestions: { reviewRequired: true, candidates: [{ crop: { x: -1, y: 0, width: 100, height: 100 }, score: 0.9, evidence: "grid" }] } } },
      { ...valid, result: { ...valid.result, suggestions: { reviewRequired: true, candidates: [{ crop: { x: 0, y: 0, width: 100, height: 100 }, score: 0.9, evidence: "artwork" }] } } },
      { ...valid, result: { ...valid.result, suggestions: { reviewRequired: true, candidates: [
        { crop: { x: 0, y: 0, width: 100, height: 100 }, score: 0.5, evidence: "grid" },
        { crop: { x: 200, y: 200, width: 100, height: 100 }, score: 0.9, evidence: "grid" }] } } },
      { ...valid, result: { status: "failed", code: "unknown" } }
    ];
    for (const value of broken) expect(() => validatePuzzleDetectReply(value, 1, binding, prepared.context)).toThrow();
  });

  test("runs a detection task without competing with solve or match tasks", async () => {
    const { client, ports, job } = harness();
    const pending = client.detect(job());
    expect(client.running).toBe(true);
    expect(ports).toHaveLength(1);
    expect(ports[0]!.sent[0]!.type).toBe("detect");
    ports[0]!.reply();
    const outcome = await pending;
    expect(outcome.binding).toEqual(binding);
    expect(outcome.result.status).toBe("suggestions");
    if (outcome.result.status === "suggestions") expect(outcome.result.suggestions.candidates.length).toBeGreaterThan(0);
    expect(client.running).toBe(false);
  });

  test("cancels a detection when its input goes stale and ignores the late reply", async () => {
    const { client, ports, job } = harness();
    let current = true;
    const pending = client.detect(job({ isCurrent: () => current }));
    current = false;
    client.cancel("stale");
    const outcome = await pending;
    expect(outcome.result).toEqual({ status: "stale" });
    ports[0]!.reply();
    expect(client.running).toBe(false);
  });

  test("reports a time limit and refuses a mismatched artwork binding", () => {
    const input = fixture(), replies: PuzzleDetectReply[] = [];
    let clock = 0;
    createPuzzleDetectHandler(reply => replies.push(reply), { now: () => (clock += 5000), detect: suggestPuzzleRegions })(request(input));
    expect((replies[0]!.result as { status: string }).status).toBe("timeLimit");
    replies.length = 0;
    createPuzzleDetectHandler(reply => replies.push(reply))(request(fixture("tw:song:jacket")));
    expect(replies[0]!.result).toEqual({ status: "failed", code: "protocol" });
  });
});
