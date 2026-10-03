import { expect, test } from "bun:test";
import { answerField, createBox, parseBox } from "../src/lib/box/model";
import { correctRecognizedIdentity, correctRecognizedValue, mergeRecognizedBox, observedScreenshotBox, validateRecognitionResult, type RecognitionResult } from "../src/lib/recognition/protocol";
import { RecognitionWorkerClient, type RecognitionJob, type WorkerLike } from "../src/lib/recognition/worker-client";
import { bindRecognitionSource, loadRecognitionManifest, recognitionDigest, type RecognitionManifest } from "../src/lib/recognition/client";
import galleryArtIdentity from "../src/lib/recognition/gallery-art-identity.json";
import { createRecognitionContext } from "../src/lib/recognition/catalogue";
import { listForServer, mergeServerLists } from "../src/lib/servers/facets";
import type { CardViewModel } from "../src/lib/cards/data";
import type { SupportCardViewModel } from "../src/lib/support-cards/data";

// Synthetic protocol fixtures.
const source = { server: "jp" as const, masterVersion: "synthetic/1", sourceId: "ui-master-observation:synthetic", catalogueSignature: "synthetic-contract",
  cards: [{ kind: "member" as const, id: "1", assetId: "1", characterIds: ["1"], rarity: 2, cardType: 5 }] };
const binding = { jobId: "9007199254740993", inputRevision: "9007199254740995", datasetId: source.sourceId, galleryId: "a".repeat(64) };
const configuration = { workerUrl: "https://example.invalid/worker.js", manifestUrl: "https://example.invalid/manifest.json", manifestSha256: "b".repeat(64), artworkBaseUrl: "https://assets.example.invalid/" };
function result(): RecognitionResult {
  return { type: "result", binding, status: "complete", sourceId: "c".repeat(64), elapsedMs: 10,
    scope: { region: "jp", masterVersion: "synthetic/1", galleryId: binding.galleryId, genuineOpenCvWasm: true, identityGeometryOnly: true, cultivationObserved: false, coverage: "observed_only", fullScanCertified: false },
    cards: [{ kind: "member", id: "1", bbox: [10, 20, 30, 40], uiBBox: [9, 19, 32, 42], identityConfidence: 0.9, inliers: 20, visibleFraction: 1, identityMethod: "siftFlannWasm", review: true,
      level: { value: null, reason: "notObserved" }, card_rank: { value: null, reason: "notObserved" }, awake_count: { value: null, reason: "notObserved" } }] };
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
  const found = result(), box = observedScreenshotBox(found, source, configuration.manifestSha256, 1);
  expect(box.cards[0]!.identity.status).toBe("observed"); expect(box.cards[0]!.identity.value).toBe("1");
  expect(Object.values(box.cards[0]!.fields).every(field => field.value === null && field.history.length === 0)).toBe(true);
  expect(box.coverage.member.complete).toBe(false);
  expect(parseBox(JSON.stringify(box)).cards[0]!.identity.history[0]!.screenshot).toMatchObject({ sourceId: found.sourceId, bbox: [10, 20, 30, 40], regionAssignment: "player-selected" });
  expect(() => observedScreenshotBox(found, { ...source, server: "tw" }, configuration.manifestSha256)).toThrow("source differs");
  const wrong = result(); wrong.binding = { ...binding, galleryId: "d".repeat(64) };
  expect(() => validateRecognitionResult(wrong, binding, source, wrong.sourceId)).toThrow("binding");
});
test("recognition merges preserve manual answers, global completeness and same-photo identity corrections", () => {
  const first = observedScreenshotBox(result(), source, configuration.manifestSha256, 1);
  let box = mergeRecognizedBox(createBox("jp", "existing"), first);
  box.player.bandItemsComplete = true; box.coverage.member = { complete: true, declaredAt: 2 };
  box.cards[0]!.fields.liveSkillLevel = answerField(box.cards[0]!.fields.liveSkillLevel, { id: "manual-skill", source: "manual", value: 4, at: 3 });
  box.cards[0] = correctRecognizedIdentity(box.cards[0]!, "2", 4);
  const again = result(); again.binding = { ...binding, jobId: "new-job" };
  const merged = mergeRecognizedBox(box, observedScreenshotBox(again, source, configuration.manifestSha256, 5));
  expect(merged.cards).toHaveLength(1); expect(merged.cards[0]!.identity.value).toBe("2"); expect(merged.cards[0]!.identity.needsReview).toBe(true);
  expect(merged.cards[0]!.fields.liveSkillLevel.value).toBe(4);
  expect(merged.coverage.member.complete).toBe(true); expect(merged.player.bandItemsComplete).toBe(true);
});
test("Worker matching uses four exact string bindings and transfers only local pixels", async () => {
  const h = harness(), pending = h.client.run(h.job);
  const request = h.sent[0]!.value as { binding: typeof binding; image: { rgba: ArrayBuffer } };
  expect(request.binding.inputRevision).toBe("9007199254740995"); expect(request.binding.jobId).toBe("9007199254740993");
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
    const output = await pending; expect(output.status).toBe(status); expect(output.cards).toEqual([]);
  }
});

test("the gallery format is accepted and fetch, integrity and format failures remain distinguishable", async () => {
  const savedFetch = globalThis.fetch, savedLocation = globalThis.location;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { href: "https://example.invalid/" } });
  const manifest = { format: "ournotes.browser-feature-gallery/2", region: "jp", masterVersion: "frozen-gallery-version", galleryId: "a".repeat(64), cards: [] };
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const config = { ...configuration, manifestSha256: await recognitionDigest(bytes.buffer) };
  try {
    globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
    expect((await loadRecognitionManifest(config, new AbortController().signal)).format).toBe("ournotes.browser-feature-gallery/2");
    await expect(loadRecognitionManifest(configuration, new AbortController().signal)).rejects.toMatchObject({ code: "manifestHash" });
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    await expect(loadRecognitionManifest(config, new AbortController().signal)).rejects.toMatchObject({ code: "manifestFetch", detail: "HTTP 404" });
    const incorrect = new TextEncoder().encode(JSON.stringify({ ...manifest, format: undefined, schema: manifest.format }));
    globalThis.fetch = (async () => new Response(incorrect)) as typeof fetch;
    await expect(loadRecognitionManifest({ ...config, manifestSha256: await recognitionDigest(incorrect.buffer) }, new AbortController().signal)).rejects.toMatchObject({ code: "manifestFormat" });
  } finally {
    globalThis.fetch = savedFetch;
    if (savedLocation) Object.defineProperty(globalThis, "location", { configurable: true, value: savedLocation });
    else Reflect.deleteProperty(globalThis, "location");
  }
});

test("shared artwork binding compares actual art and semantics while retaining JP gallery and selected TW source", () => {
  const directory = galleryArtIdentity;
  const manifest: RecognitionManifest = { format: "ournotes.browser-feature-gallery/2", region: directory.sourceRegion, masterVersion: directory.sourceMasterVersion, galleryId: directory.galleryId,
    cards: directory.cards.map(card => ({ kind: card.kind as "member" | "snap", id: card.id, art: { file: `files/${card.artSha256}`, sha256: card.artSha256 }, masterTableSha256: directory.sourceTables[card.kind as "member" | "snap"].sha256 })) };
  const selected = { server: "tw" as const, sourceId: "ui-master-observation:synthetic-selected-tw", masterVersion: "different-current-version", catalogueSignature: "synthetic-tw-contract",
    cards: directory.cards.map(card => ({ ...card, kind: card.kind as "member" | "snap" })) };
  const bound = bindRecognitionSource(manifest, selected, directory.galleryManifestSha256);
  expect(bound.server).toBe("tw"); expect(bound.masterVersion).toBe("different-current-version");
  expect(bound.gallery?.region).toBe("jp"); expect(bound.gallery?.compatibleCardKeys).toHaveLength(127);
  const changed = bindRecognitionSource(manifest, { ...selected, cards: selected.cards.map(card => card.id === "1" && card.kind === "member" ? { ...card, assetId: "999" } : card) }, directory.galleryManifestSha256);
  expect(changed.gallery?.compatibleCardKeys).not.toContain("member:1");
  const found = result(); found.binding = { ...binding, galleryId: directory.galleryId, datasetId: bound.sourceId };
  found.scope = { ...found.scope!, region: "jp", masterVersion: directory.sourceMasterVersion, galleryId: directory.galleryId };
  expect(observedScreenshotBox(found, bound, directory.galleryManifestSha256).server).toBe("tw");
  expect(() => validateRecognitionResult(found, found.binding, changed, found.sourceId)).toThrow("art is not bound");
  const differentArt = { ...manifest, cards: manifest.cards.map(card => card.id === "1" && card.kind === "member" ? { ...card, art: { ...card.art, sha256: "0".repeat(64) } } : card) };
  expect(() => bindRecognitionSource(differentArt, selected, directory.galleryManifestSha256)).toThrow("catalogBinding");
});

test("actual parameter-read evidence is separate from identity and clipped crops remain unknown", () => {
  const found = result(); found.scope = { ...found.scope!, cultivationObserved: true, identityGeometryOnly: false };
  found.cards[0]!.awake_count = { value: 1, confidence: 1, bbox: [10, 20, 20, 10], method: "boxLensNumberReaderOrtWasm", modelSha256: "e".repeat(64), runtimeId: "synthetic-parameter-contract" };
  const box = observedScreenshotBox(found, source, configuration.manifestSha256, 1, [100, 100]);
  expect(box.cards[0]!.fields.awake.value).toBe(1);
  expect(parseBox(JSON.stringify(box)).cards[0]!.fields.awake.history[0]!.screenshot?.parameterRecognition).toMatchObject({ method: "boxLensNumberReaderOrtWasm", runtimeId: "synthetic-parameter-contract" });
  expect(box.cards[0]!.fields.level.value).toBeNull(); expect(box.cards[0]!.fields.rank.value).toBeNull();
  const corrected = correctRecognizedValue(box.cards[0]!, "awake", 2, 2);
  expect(corrected.fields.awake.history.map(item => item.source)).toEqual(["screenshot", "manual"]);
  expect(corrected.fields.awake.value).toBe(2);
  found.cards[0]!.awake_count.bbox = [95, 20, 20, 10];
  expect(observedScreenshotBox(found, source, configuration.manifestSha256, 1, [100, 100]).cards[0]!.fields.awake.value).toBeNull();
  const invalid = JSON.parse(JSON.stringify(box)); invalid.cards[0].identity.history[0].screenshot.confidence = 1.001;
  expect(() => parseBox(JSON.stringify(invalid))).toThrow("confidence");
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
