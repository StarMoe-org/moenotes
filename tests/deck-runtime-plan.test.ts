import { describe, expect, test } from "bun:test";
import { assertDeckDataIdentity, isCurrentDeckReply, planDeckRuntime, type DeckRuntimeCapabilities, type DeckWorkerRequest } from "../src/lib/deck/runtime-plan";

const local: DeckRuntimeCapabilities = { browserRecognition: true, onnxWasm: true, browserSolver: true, remoteRecognition: true, remoteSolver: true };
const noUpload = { uploadScreenshots: false, uploadRoster: false };
const identity = { region: "jp", masterVersion: "synthetic/1", deckDataSha256: "a".repeat(64) };

describe("collection runtime plan", () => {
  test("WASM works without GPU and keeps both private inputs local", () => {
    expect(planDeckRuntime(local, noUpload)).toEqual({ recognition: "onnx-wasm", recommendation: "wasm-worker", uploads: { screenshots: false, roster: false } });
  });
  test("missing ONNX WASM support does not silently switch the recognition runtime", () => {
    expect(() => planDeckRuntime({ ...local, onnxWasm: false }, noUpload)).toThrow("supported browser runtime");
  });
  test("ONNX alone is insufficient for screenshot recognition and cannot authorize uploads", () => {
    expect(() => planDeckRuntime({ ...local, browserRecognition: false }, noUpload)).toThrow("supported browser runtime");
  });
  test("upload consent does not enable remote recognition or recommendation", () => {
    expect(() => planDeckRuntime({ ...local, browserSolver: false }, { uploadScreenshots: true, uploadRoster: true })).toThrow("browser solver");
    expect(() => planDeckRuntime({ ...local, browserRecognition: false }, { uploadScreenshots: true, uploadRoster: true })).toThrow("supported browser runtime");
  });
  test("a stored or manually entered box does not require screenshot recognition", () => {
    expect(planDeckRuntime({ ...local, browserRecognition: false, onnxWasm: false }, noUpload, { recognizeScreenshots: false }))
      .toEqual({ recognition: null, recommendation: "wasm-worker", uploads: { screenshots: false, roster: false } });
  });
  test("consent does not invent an available service", () => {
    expect(() => planDeckRuntime({ ...local, browserSolver: false, remoteSolver: false }, { uploadScreenshots: true, uploadRoster: true })).toThrow();
  });
  test("same IDs from another region or updated master cannot enter the old model", () => {
    expect(() => assertDeckDataIdentity(identity, { ...identity, region: "tw" })).toThrow();
    expect(() => assertDeckDataIdentity(identity, { ...identity, masterVersion: "synthetic/2" })).toThrow();
    expect(() => assertDeckDataIdentity(identity, { ...identity, deckDataSha256: "b".repeat(64) })).toThrow();
    expect(() => assertDeckDataIdentity(identity, { ...identity, deckDataSha256: "self-reported" })).toThrow();
  });
  test("late results cannot overwrite changed collection or target", () => {
    const request: DeckWorkerRequest = { protocol: "moenotes.deck-worker/1", jobId: "job-1", inputRevision: 2, identity, accountJson: "{}", requestJson: '{"maxCandidates":9007199254740993}' };
    const reply = { ...request, resultJson: "{}" };
    expect(isCurrentDeckReply(request, reply, 2)).toBe(true);
    expect(isCurrentDeckReply(request, reply, 3)).toBe(false);
    expect(isCurrentDeckReply(request, { ...reply, jobId: "job-2" }, 2)).toBe(false);
    expect(isCurrentDeckReply(request, { ...reply, identity: { ...identity, region: "tw" } }, 2)).toBe(false);
    expect(request.requestJson).toContain("9007199254740993");
  });
});
