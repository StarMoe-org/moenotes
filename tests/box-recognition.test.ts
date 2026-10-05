import { expect, test } from "bun:test";
import { answerField, createBox, parseBox } from "../src/lib/box/model";
import { correctRecognizedIdentity, correctRecognizedValue, mergeRecognizedBox, observedScreenshotBox, unidentifiedCardKey, validateRecognitionResult, type RecognitionResult, type UnidentifiedCard } from "../src/lib/recognition/protocol";
import { RecognitionWorkerClient, type RecognitionJob, type WorkerLike } from "../src/lib/recognition/worker-client";
import { bindRecognitionSource, type RecognitionManifest } from "../src/lib/recognition/client";
import { createRecognitionContext } from "../src/lib/recognition/catalogue";
import { listForServer, mergeServerLists } from "../src/lib/servers/facets";
import type { CardViewModel } from "../src/lib/cards/data";
import type { SupportCardViewModel } from "../src/lib/support-cards/data";

// Synthetic protocol fixtures.
const source = { server: "jp" as const, masterVersion: "synthetic/1", sourceId: "ui-master-observation:synthetic", catalogueSignature: "synthetic-contract",
  cards: [{ kind: "member" as const, id: "1", assetId: "1", characterIds: ["1"], rarity: 2, cardType: 5 }] };
const binding = { jobId: "9007199254740993", inputRevision: "9007199254740995", datasetId: source.sourceId, galleryId: "a".repeat(64) };
const configuration = { workerUrl: "https://example.invalid/worker.js", galleryUrl: "https://example.invalid/gallery.json", gallerySha256: "b".repeat(64),
  modelsUrl: "https://example.invalid/models.json", modelsSha256: "9".repeat(64) };
const tile = () => ({ kind: "member" as const, bbox: [10, 20, 30, 40] as [number, number, number, number], locatorScore: 0.97, visibleFraction: 1,
  identitySimilarity: 0.95, identityMargin: 0.3, displayMode: "level" as const, review: true as const,
  level: { value: null, reason: "notObserved" }, card_rank: { value: null, reason: "notObserved" }, awake_count: { value: null, reason: "notObserved" } });
function result(): RecognitionResult {
  return { type: "result", binding, status: "complete", sourceId: "c".repeat(64), elapsedMs: 10,
    scope: { galleryId: binding.galleryId, modelsSha256: configuration.modelsSha256, catalog: [{ region: "jp", masterVersion: "synthetic/1" }], coverage: "observed_only", fullScanCertified: false },
    cards: [{ ...tile(), id: "1", identityMethod: "boxLensEncoderOrtWasm" }], unidentified: [] };
}
function harness() {
  const sent: { value: unknown; transfers: Transferable[] | undefined }[] = [];
  let now = 1000, terminated = 0, current = true;
  const worker: WorkerLike = { onmessage: null, onerror: null, postMessage(value, transfers) { sent.push({ value, transfers }); }, terminate() { terminated++; } };
  const client = new RecognitionWorkerClient(() => worker, () => now);
  const job: RecognitionJob = { source, binding, configuration, image: { width: 1, height: 1, rgba: new ArrayBuffer(4), sourceId: "c".repeat(64) }, timeLimitMs: 100,
    isCurrent: () => current, onProgress() {} };
  return { worker, client, job, sent, advance: () => { now = 1101; }, stale: () => { current = false; }, terminated: () => terminated };
}
test("a complete result creates observed identities and never invents cultivation or complete ownership", () => {
  const found = result(), box = observedScreenshotBox(found, source, configuration.gallerySha256, 1);
  expect(box.cards[0]!.identity.status).toBe("observed"); expect(box.cards[0]!.identity.value).toBe("1");
  expect(Object.values(box.cards[0]!.fields).every(field => field.value === null && field.history.length === 0)).toBe(true);
  expect(box.coverage.member.complete).toBe(false);
  expect(parseBox(JSON.stringify(box)).cards[0]!.identity.history[0]!.screenshot).toMatchObject({ sourceId: found.sourceId, bbox: [10, 20, 30, 40], regionAssignment: "player-selected" });
  const foreign = result(); foreign.scope = { ...foreign.scope!, galleryId: "d".repeat(64) };
  expect(() => observedScreenshotBox(foreign, source, configuration.gallerySha256)).toThrow("source differs");
  const wrong = result(); wrong.binding = { ...binding, galleryId: "d".repeat(64) };
  expect(() => validateRecognitionResult(wrong, binding, source, wrong.sourceId)).toThrow("binding");
});
test("recognition merges preserve manual answers, global completeness and same-photo identity corrections", () => {
  const first = observedScreenshotBox(result(), source, configuration.gallerySha256, 1);
  let box = mergeRecognizedBox(createBox("jp", "existing"), first);
  box.player.bandItemsComplete = true; box.coverage.member = { complete: true, declaredAt: 2 };
  box.cards[0]!.fields.liveSkillLevel = answerField(box.cards[0]!.fields.liveSkillLevel, { id: "manual-skill", source: "manual", value: 4, at: 3 });
  box.cards[0] = correctRecognizedIdentity(box.cards[0]!, "2", 4);
  const again = result(); again.binding = { ...binding, jobId: "new-job" };
  const merged = mergeRecognizedBox(box, observedScreenshotBox(again, source, configuration.gallerySha256, 5));
  expect(merged.cards).toHaveLength(1); expect(merged.cards[0]!.identity.value).toBe("2"); expect(merged.cards[0]!.identity.needsReview).toBe(true);
  expect(merged.cards[0]!.fields.liveSkillLevel.value).toBe(4);
  expect(merged.coverage.member.complete).toBe(true); expect(merged.player.bandItemsComplete).toBe(true);
});
test("Worker matching uses four exact string bindings and transfers only local pixels", async () => {
  const h = harness(), pending = h.client.run(h.job);
  const request = h.sent[0]!.value as { binding: typeof binding; cards: string[]; configuration: Record<string, string>; image: { rgba: ArrayBuffer } };
  expect(request.binding.inputRevision).toBe("9007199254740995"); expect(request.binding.jobId).toBe("9007199254740993");
  expect(request.cards).toEqual(["member:1"]);
  expect(request.configuration).toEqual({ galleryUrl: configuration.galleryUrl, gallerySha256: configuration.gallerySha256, modelsUrl: configuration.modelsUrl, modelsSha256: configuration.modelsSha256 });
  expect(h.sent[0]!.transfers).toEqual([h.job.image.rgba]);
  h.worker.onmessage!({ data: { ...result(), binding: { ...binding, datasetId: "foreign" } } } as MessageEvent);
  expect(h.terminated()).toBe(0);
  h.worker.onmessage!({ data: result() } as MessageEvent);
  expect((await pending).status).toBe("complete"); expect(h.terminated()).toBe(1);
});
test("cancel, stale box changes and expired monotonic deadlines discard late WASM results", async () => {
  const cancelled = harness(), old = cancelled.client.run(cancelled.job), late = cancelled.worker.onmessage!;
  cancelled.client.cancel(); late({ data: result() } as MessageEvent);
  expect((await old).status).toBe("cancelled"); expect(cancelled.terminated()).toBe(1);
  for (const status of ["stale", "timeLimit"] as const) {
    const h = harness(), pending = h.client.run(h.job); status === "stale" ? h.stale() : h.advance();
    h.worker.onmessage!({ data: result() } as MessageEvent);
    const output = await pending; expect(output.status).toBe(status); expect(output.cards).toEqual([]); expect(output.unidentified).toEqual([]);
  }
});

test("one gallery binds to each selected server by its actual Master art references", () => {
  const identity = (assetId: string, characterIds: string[], rarity: number, cardType: number) => ({ assetId, characterIds, rarity, cardType });
  const manifest: RecognitionManifest = { format: "moenotes.embedding-gallery/1", galleryId: "f".repeat(64),
    catalog: [{ region: "hk-tw-mo", masterVersion: "synthetic-tw" }, { region: "jp", masterVersion: "synthetic-jp" }],
    cards: [
      { kind: "member", id: "1", identity: identity("1", ["1"], 2, 5), regions: ["hk-tw-mo", "jp"], levelLimit: 60 },
      { kind: "snap", id: "2", identity: identity("2", ["1", "2"], 4, 1), regions: ["hk-tw-mo", "jp"], levelLimit: 40 },
      { kind: "snap", id: "3", identity: identity("3", ["3"], 4, 1), regions: ["hk-tw-mo"], levelLimit: 40 },
    ] };
  const selected = { server: "jp" as const, sourceId: "ui-master-observation:synthetic-selected-jp", masterVersion: "different-current-version", catalogueSignature: "synthetic-jp-contract",
    cards: [{ kind: "member" as const, id: "1", ...identity("1", ["1"], 2, 5) }, { kind: "snap" as const, id: "2", ...identity("2", ["1", "2"], 4, 1) }] };
  const bound = bindRecognitionSource(manifest, selected);
  expect(bound.server).toBe("jp"); expect(bound.masterVersion).toBe("different-current-version");
  expect(bound.gallery?.galleryId).toBe(manifest.galleryId); expect(bound.gallery?.catalog).toEqual(manifest.catalog);
  expect(bound.gallery?.compatibleCardKeys).toEqual(["member:1", "snap:2"]);
  expect(bound.gallery?.incompatibleCardReasons).toEqual([{ key: "snap:3", expected: JSON.stringify(["3", ["3"], 4, 1]), actual: "absent" }]);
  const changed = bindRecognitionSource(manifest, { ...selected, cards: selected.cards.map(card => card.kind === "member" ? { ...card, assetId: "999" } : card) });
  expect(changed.gallery?.compatibleCardKeys).toEqual(["snap:2"]);
  const found = result(); found.binding = { ...binding, galleryId: manifest.galleryId, datasetId: bound.sourceId };
  found.scope = { ...found.scope!, galleryId: manifest.galleryId, catalog: manifest.catalog };
  expect(observedScreenshotBox(found, bound, configuration.gallerySha256).server).toBe("jp");
  expect(() => validateRecognitionResult(found, found.binding, changed, found.sourceId)).toThrow("art is not bound");
  expect(() => bindRecognitionSource(manifest, { ...selected, cards: [{ kind: "member" as const, id: "1", ...identity("9", ["9"], 2, 5) }] })).toThrow("catalogBinding");
});

test("actual parameter-read evidence is separate from identity and clipped crops remain unknown", () => {
  const found = result();
  found.cards[0]!.awake_count = { value: 1, confidence: 1, bbox: [10, 20, 20, 10], method: "boxLensClassifierOrtWasm", modelSha256: "e".repeat(64), runtimeId: "synthetic-parameter-contract" };
  const box = observedScreenshotBox(found, source, configuration.gallerySha256, 1, [100, 100]);
  expect(box.cards[0]!.fields.awake.value).toBe(1);
  expect(parseBox(JSON.stringify(box)).cards[0]!.fields.awake.history[0]!.screenshot?.parameterRecognition).toMatchObject({ method: "boxLensClassifierOrtWasm", runtimeId: "synthetic-parameter-contract" });
  expect(box.cards[0]!.fields.level.value).toBeNull(); expect(box.cards[0]!.fields.rank.value).toBeNull();
  const corrected = correctRecognizedValue(box.cards[0]!, "awake", 2, 2);
  expect(corrected.fields.awake.history.map(item => item.source)).toEqual(["screenshot", "manual"]);
  expect(corrected.fields.awake.value).toBe(2);
  found.cards[0]!.awake_count.bbox = [95, 20, 20, 10];
  expect(observedScreenshotBox(found, source, configuration.gallerySha256, 1, [100, 100]).cards[0]!.fields.awake.value).toBeNull();
  const invalid = JSON.parse(JSON.stringify(box)); invalid.cards[0].identity.history[0].screenshot.confidence = 1.001;
  expect(() => parseBox(JSON.stringify(invalid))).toThrow("confidence");
});

test("an unidentified tile becomes a review card without identity, its nearest reference as the only candidate", () => {
  const found = result(), unknown: UnidentifiedCard = { ...tile(), kind: "member", candidate: "1", identitySimilarity: 0.7, identityMargin: 0.01 };
  unknown.level = { value: 30, confidence: 0.9999, bbox: [12, 50, 20, 8], method: "boxLensClassifierOrtWasm", modelSha256: "e".repeat(64), runtimeId: "synthetic-parameter-contract" };
  found.unidentified = [unknown];
  const box = observedScreenshotBox(found, source, configuration.gallerySha256, 1, [100, 100]);
  expect(box.cards.map(card => card.key)).toEqual([`${binding.jobId}:0`, unidentifiedCardKey(binding.jobId, 0)]);
  const card = box.cards[1]!;
  expect(card.identity.value).toBeNull(); expect(card.identity.history).toEqual([]); expect(card.candidates).toEqual(["1"]);
  expect(card.fields.level.value).toBe(30);
  expect(parseBox(JSON.stringify(box)).cards[1]!.fields.level.history[0]!.screenshot?.recognition.method).toBe("boxLensEncoderOrtWasm");
  const absent = result(); absent.unidentified = [{ ...unknown, candidate: null }];
  expect(observedScreenshotBox(absent, source, configuration.gallerySha256).cards[1]!.candidates).toEqual([]);
  const foreign = result(); foreign.unidentified = [{ ...unknown, candidate: "2" }];
  expect(() => validateRecognitionResult(foreign, binding, source, foreign.sourceId)).toThrow("unidentified");
  const missing = result() as unknown as Record<string, unknown>; delete missing.unidentified;
  expect(() => validateRecognitionResult(missing, binding, source, "c".repeat(64))).toThrow("binding");
});

test("cancel still terminates a Worker whose cancellation message cannot be delivered", async () => {
  const h = harness(), pending = h.client.run(h.job);
  h.worker.postMessage = () => { throw new Error("closed"); };
  expect(() => h.client.cancel()).not.toThrow();
  expect((await pending).status).toBe("cancelled"); expect(h.terminated()).toBe(1);
});

test("one selected actual catalogue supplies immutable recognition facts and the same review models", () => {
  const stamp = { server: "jp" as const, masterVersion: "synthetic/1", sourceId: `ui-master-observation:jp:synthetic/1:sha256:${"a".repeat(64)}:sha256:${"b".repeat(64)}` };
  const member = { id: 1, assetId: 1, characterId: 1, rarity: 2, cardType: 5 } as CardViewModel;
  const snap = { id: 51, assetId: 51, characterIds: [1, 2, 3], rarity: 4, cardType: 1 } as SupportCardViewModel;
  const merged = mergeServerLists<CardViewModel>([["tw", [member]], ["jp", [{ ...member, assetId: 2, characterId: 3 }]]], card => card.id);
  const catalogue = { members: listForServer(merged, "jp"), snaps: [snap] };
  const context = createRecognitionContext(stamp, catalogue);
  expect(context.catalogue).toBe(catalogue); expect(context.source.sourceId).toBe(stamp.sourceId);
  expect(context.source.cards).toEqual([{ kind: "member", id: "1", assetId: "2", characterIds: ["3"], rarity: 2, cardType: 5 }, { kind: "snap", id: "51", assetId: "51", characterIds: ["1", "2", "3"], rarity: 4, cardType: 1 }]);
  expect(Object.isFrozen(context.source.cards)).toBe(true); expect(Object.isFrozen(context.source.cards[0])).toBe(true); expect(Object.isFrozen(context.source.cards[1]!.characterIds)).toBe(true);
  const changed = createRecognitionContext(stamp, { ...catalogue, snaps: [{ ...snap, characterIds: [1, 2] }] });
  expect(changed.source.catalogueSignature).not.toBe(context.source.catalogueSignature);
  expect(() => createRecognitionContext(stamp, { members: [member, member], snaps: [] })).toThrow("duplicate");
  expect(() => createRecognitionContext(stamp, { members: [{ ...member, id: 9007199254740992 }], snaps: [] })).toThrow("unsafe");
  expect(() => createRecognitionContext(stamp, { members: [], snaps: [{ ...snap, characterIds: undefined } as unknown as SupportCardViewModel] })).toThrow("character IDs");
  expect(() => createRecognitionContext({ ...stamp, sourceId: "ui-master-observation:jp:synthetic/1:jp:MasterMemberCard.json:jp:MasterSupportCard.json" }, catalogue)).toThrow("table identities");
});
