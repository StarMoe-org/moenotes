import { expect, test } from "bun:test";
import { answerField, createBox, createCard, observeField, parseBox } from "../src/lib/box/model";
import { RecognitionBatch } from "../src/lib/recognition/batch";
import { correctRecognizedBoxIdentity, mergeRecognizedBox, type RecognitionBinding, type RecognitionResult, type RecognitionSource } from "../src/lib/recognition/protocol";
import { RecognitionWorkerClient, type WorkerLike } from "../src/lib/recognition/worker-client";

// Synthetic state and merge fixtures.
const galleryId = "a".repeat(64), manifestSha256 = "b".repeat(64);
const revision = "9007199254740995", largeId = "9007199254740993";
const source = (): RecognitionSource => ({ server: "jp", masterVersion: "synthetic/1", sourceId: "ui-master-observation:synthetic",
  catalogueSignature: "synthetic-selected-catalogue", cards: [
    { kind: "member", id: largeId, assetId: largeId, characterIds: ["1"], rarity: 2, cardType: 5 },
    { kind: "snap", id: "2", assetId: "2", characterIds: ["1", "2"], rarity: 4, cardType: 1 },
  ] });
function harness(keys = ["first", "second", "third"]) {
  let now = 1000;
  const batch = new RecognitionBatch({ batchId: "batch-one", inputRevision: revision, source: source(), galleryId, manifestSha256,
    at: 42, files: keys.map(key => ({ key, name: `${key}.png` })), clock: () => now });
  const begin = (key: string, sha = key === "first" ? "c".repeat(64) : key === "second" ? "d".repeat(64) : "e".repeat(64)) => batch.begin(key,
    { jobId: `9007199254740993:${key}`, sourceId: sha, width: 100, height: 100, startedAt: 1000, deadline: 1100 });
  return { batch, begin, now: (value: number) => { now = value; } };
}
function reply(binding: RecognitionBinding, sha: string, level: number | null = null, kind: "member" | "snap" = "member"): RecognitionResult {
  return { type: "result", binding, sourceId: sha, status: "complete", elapsedMs: 10,
    scope: { galleryId, catalog: [{ region: "jp", masterVersion: "synthetic/1" }], genuineOpenCvWasm: true,
      identityGeometryOnly: level === null, cultivationObserved: level !== null, coverage: "observed_only", fullScanCertified: false },
    cards: [{ kind, id: kind === "member" ? largeId : "2", bbox: [10, 20, 30, 40], uiBBox: [10, 20, 30, 40],
      identityConfidence: 0.9, inliers: 10, visibleFraction: 1, identityMethod: "siftFlannWasm", review: true,
      level: level === null ? { value: null } : { value: level, confidence: 1, bbox: [10, 70, 30, 10],
        method: "boxLensNumberReaderOrtWasm", modelSha256: "f".repeat(64), runtimeId: "synthetic-parameter-reader" },
      card_rank: { value: null }, awake_count: { value: null } }] };
}

function observedCard(key: string, id: string, sha: string, level: number | null = null, kind: "member" | "snap" = "member") {
  const card = createCard(kind, key);
  const screenshot = { sourceId: sha, bbox: [10, 20, 30, 40] as [number, number, number, number] };
  card.identity = observeField(card.identity, { id: `${key}:identity`, value: id, source: "screenshot", at: 42, screenshot });
  if (level !== null) card.fields.level = observeField(card.fields.level, { id: `${key}:level`, value: level, source: "screenshot", at: 42, screenshot });
  return card;
}

test("correcting A to existing B combines both image sources while retaining edited key, conflicts and player facts", () => {
  const draft = createBox("jp", "correction", 42); draft.revision = 7;
  // Target is before the edited row; correction still keeps the edited row's key.
  draft.cards = [observedCard("target", "2", "d".repeat(64), 30), observedCard("unchanged", "3", "e".repeat(64)),
    observedCard("edited", largeId, "c".repeat(64), 20), observedCard("other-kind", "2", "f".repeat(64), null, "snap")];
  draft.cards[2]!.fields.liveSkillLevel = answerField(draft.cards[2]!.fields.liveSkillLevel, { id: "manual-skill", value: 4, source: "manual", at: 43 });
  draft.coverage.member = { complete: true, declaredAt: 40 }; draft.player.bandItemsComplete = true;
  draft.player.vipRank = answerField(draft.player.vipRank, { id: "manual-vip", value: 2, source: "manual", at: 40 });
  draft.baseline = { members: [largeId, "3", "4", "5", "6"], snaps: [null, null, null, null, null] };
  const before = JSON.stringify(draft), corrected = correctRecognizedBoxIdentity(draft, "edited", "2", 50);
  expect(corrected.cards.map(card => [card.key, card.kind, card.identity.value])).toEqual([
    ["unchanged", "member", "3"], ["edited", "member", "2"], ["other-kind", "snap", "2"],
  ]);
  const combined = corrected.cards[1]!;
  expect(combined.identity.status).toBe("manual");
  expect(combined.identity.history.filter(item => item.source === "screenshot").map(item => [item.value, item.screenshot?.sourceId, item.screenshot?.bbox])).toEqual([
    [largeId, "c".repeat(64), [10, 20, 30, 40]], ["2", "d".repeat(64), [10, 20, 30, 40]],
  ]);
  expect(combined.fields.level).toMatchObject({ status: "conflict", value: null, needsReview: true });
  expect(combined.fields.level.history.map(item => item.value)).toEqual([20, 30]);
  expect(combined.fields.liveSkillLevel).toMatchObject({ status: "manual", value: 4 });
  expect(corrected.player).toEqual(draft.player); expect(corrected.coverage).toEqual(draft.coverage);
  expect(corrected.baseline).toEqual(draft.baseline); expect(corrected.revision).toBe(7);
  expect(JSON.stringify(draft)).toBe(before); expect(parseBox(JSON.stringify(corrected)).cards).toHaveLength(3);
});

test("after an identity collision is corrected, later image completion retains the manual row and every source", () => {
  const original = createBox("jp", "correction", 42);
  original.cards = [observedCard("edited", largeId, "c".repeat(64)), observedCard("target", "2", "d".repeat(64))];
  const corrected = correctRecognizedBoxIdentity(original, "edited", "2", 50);
  corrected.cards[0]!.fields.liveSkillLevel = answerField(corrected.cards[0]!.fields.liveSkillLevel, { id: "manual-skill", value: 4, source: "manual", at: 51 });
  const nextObservation = structuredClone(original);
  nextObservation.cards.push(observedCard("third-image", "2", "e".repeat(64)));
  const combined = mergeRecognizedBox(corrected, nextObservation, 52);
  expect(combined.cards).toHaveLength(1); expect(combined.cards[0]!.key).toBe("edited");
  // Old contradictory evidence was explicitly resolved; the new photo agrees with the correction.
  expect(combined.cards[0]!.identity).toMatchObject({ status: "manual", value: "2", needsReview: false });
  expect(combined.cards[0]!.identity.history.filter(item => item.screenshot).map(item => item.screenshot?.sourceId)).toEqual([
    "c".repeat(64), "d".repeat(64), "e".repeat(64),
  ]);
  expect(combined.cards[0]!.fields.liveSkillLevel).toMatchObject({ status: "manual", value: 4 });
  expect(parseBox(JSON.stringify(combined)).cards).toHaveLength(1);
});

test("clearing identity keeps distinct unknown rows and never merges a member with a snap of the same ID", () => {
  const draft = createBox("jp", "correction", 42);
  draft.cards = [observedCard("edited", largeId, "c".repeat(64)), createCard("member", "unknown"), observedCard("snap", largeId, "d".repeat(64), null, "snap")];
  const cleared = correctRecognizedBoxIdentity(draft, "edited", null, 50);
  expect(cleared.cards.map(card => [card.key, card.identity.value])).toEqual([["edited", null], ["unknown", null], ["snap", largeId]]);
  expect(cleared.cards[0]!.identity.history.map(item => item.source)).toEqual(["screenshot", "manual"]);
  expect(() => correctRecognizedBoxIdentity(draft, "missing", "2", 50)).toThrow("Unknown");
});

test("one failed picture cannot remove successful member/snap pictures or expand ownership coverage", () => {
  const h = harness();
  const first = h.begin("first"), second = h.begin("second");
  expect(h.batch.finish("second", reply(second, "d".repeat(64), null, "snap"))).toBe(true);
  expect(h.batch.fail("third", "imageDecode")).toBe(true);
  expect(h.batch.finish("first", reply(first, "c".repeat(64)))).toBe(true);
  const draft = h.batch.draft(), parsed = parseBox(JSON.stringify(draft));
  expect(parsed.cards.map(card => [card.kind, card.identity.value])).toEqual([["member", largeId], ["snap", "2"]]);
  expect(parsed.cards.every(card => Object.values(card.fields).every(field => field.status === "unknown"))).toBe(true);
  expect(parsed.coverage.member.complete).toBe(false); expect(parsed.coverage.snap.complete).toBe(false);
  expect(h.batch.snapshot()).toMatchObject({ status: "finished", files: [{ status: "complete" }, { status: "complete" }, { status: "failed", error: "imageDecode" }] });
});

test("opposite completion order produces the same merged draft and preserves cross-image OCR disagreement", () => {
  const run = (reverse: boolean) => {
    const h = harness(["first", "second"]), a = h.begin("first"), b = h.begin("second");
    const pairs = [["first", reply(a, "c".repeat(64), 20)], ["second", reply(b, "d".repeat(64), 30)]] as const;
    for (const [key, output] of reverse ? [...pairs].reverse() : pairs) expect(h.batch.finish(key, output)).toBe(true);
    return h.batch.draft();
  };
  const forward = run(false), backward = run(true);
  expect(backward).toEqual(forward); expect(forward.cards).toHaveLength(1);
  expect(forward.cards[0]!.identity.value).toBe(largeId);
  expect(forward.cards[0]!.fields.level).toMatchObject({ status: "conflict", value: null, needsReview: true });
  expect(forward.cards[0]!.fields.level.history.map(item => [item.value, item.at, item.screenshot?.sourceId])).toEqual([
    [20, 42, "c".repeat(64)], [30, 42, "d".repeat(64)],
  ]);
});

test("saving one aggregate retains manual answers, all conflicting photo history, globals and base revision", () => {
  const h = harness(["first", "second"]), a = h.begin("first"), b = h.begin("second");
  h.batch.finish("first", reply(a, "c".repeat(64), 20)); h.batch.finish("second", reply(b, "d".repeat(64), 30));
  const current = createBox("jp", "persisted", 1); current.revision = 7;
  current.cards = [createCard("member", "manual-card", largeId, 2)];
  current.cards[0]!.fields.level = answerField(current.cards[0]!.fields.level, { id: "manual-level", value: 44, source: "manual", at: 3 });
  current.cards[0]!.fields.liveSkillLevel = answerField(current.cards[0]!.fields.liveSkillLevel, { id: "manual-skill", value: 4, source: "manual", at: 3 });
  current.coverage.member = { complete: true, declaredAt: 4 }; current.player.bandItemsComplete = true;
  current.player.vipRank = answerField(current.player.vipRank, { id: "manual-vip", value: 2, source: "manual", at: 3 });
  current.baseline = { members: [largeId, "3", "4", "5", "6"], snaps: [null, null, null, null, null] };
  const before = JSON.stringify(current), saved = mergeRecognizedBox(current, h.batch.draft(), 50);
  expect(saved.cards).toHaveLength(1);
  expect(saved.cards[0]!.fields.level).toMatchObject({ status: "manual", value: 44, needsReview: true });
  expect(saved.cards[0]!.fields.level.history.map(item => item.source)).toEqual(["manual", "screenshot", "screenshot"]);
  expect(saved.cards[0]!.fields.liveSkillLevel.value).toBe(4); expect(saved.player).toEqual(current.player);
  expect(saved.coverage).toEqual(current.coverage); expect(saved.baseline).toEqual(current.baseline); expect(saved.revision).toBe(7);
  expect(JSON.stringify(current)).toBe(before); expect(parseBox(JSON.stringify(saved)).cards[0]!.fields.level.value).toBe(44);
});

test("duplicate photos retain separate image/result bindings and merge a card once without losing evidence", () => {
  const h = harness(["first", "second"]), sha = "c".repeat(64), a = h.begin("first", sha), b = h.begin("second", sha);
  h.batch.finish("first", reply(a, sha)); h.batch.finish("second", reply(b, sha));
  const snapshot = h.batch.snapshot(), draft = h.batch.draft();
  expect(snapshot.files[1]).toMatchObject({ duplicateOf: "first", sourceId: sha, status: "complete" });
  expect(snapshot.files[0]!.binding?.jobId).not.toBe(snapshot.files[1]!.binding?.jobId);
  expect(draft.cards).toHaveLength(1); expect(draft.cards[0]!.identity.history).toHaveLength(2);
  const corrected = structuredClone(draft);
  corrected.cards[0]!.identity = answerField(corrected.cards[0]!.identity, { id: "identity-correction", value: "2", source: "manual", at: 50 });
  const saved = mergeRecognizedBox(corrected, draft, 51);
  expect(saved.cards).toHaveLength(1); expect(saved.cards[0]!.identity.value).toBe("2"); expect(saved.cards[0]!.identity.needsReview).toBe(false);
  expect(saved.cards[0]!.identity.history).toHaveLength(3);
  const repeat = harness(["third"]), c = repeat.begin("third", sha);
  repeat.batch.finish("third", reply(c, sha));
  const reimported = mergeRecognizedBox(saved, repeat.batch.draft(), 52);
  expect(reimported.cards[0]!.identity.value).toBe("2"); expect(reimported.cards[0]!.identity.needsReview).toBe(true);
  expect(reimported.cards[0]!.identity.history).toHaveLength(4);
});

test("each of the four foreign string bindings is inert and a wrong image hash never becomes evidence", () => {
  const h = harness(["first"]), a = h.begin("first"), good = reply(a, "c".repeat(64));
  for (const key of ["jobId", "inputRevision", "datasetId", "galleryId"] as const) {
    expect(h.batch.finish("first", { ...good, binding: { ...a, [key]: `${a[key]}-foreign` } })).toBe(false);
    expect(h.batch.snapshot().files[0]!.status).toBe("running");
  }
  expect(a.inputRevision).toBe(revision); expect(a.jobId).toBe("9007199254740993:first");
  expect(h.batch.finish("first", { ...good, sourceId: "d".repeat(64) })).toBe(false);
  expect(h.batch.snapshot().files[0]!.status).toBe("failed"); expect(h.batch.draft().cards).toEqual([]);
});

test("a matching job cannot publish an identity absent from the pinned selected catalogue", () => {
  const h = harness(["first"]), a = h.begin("first"), foreign = reply(a, "c".repeat(64));
  foreign.cards[0]!.id = "999";
  expect(h.batch.finish("first", foreign)).toBe(false);
  expect(h.batch.snapshot().files[0]).toMatchObject({ status: "failed", error: "Recognized card is absent from selected catalogue" });
  expect(h.batch.draft().cards).toEqual([]);
});

test("cancelling a single image excludes late output and does not cancel the other image", () => {
  const h = harness(["first", "second"]), a = h.begin("first"), b = h.begin("second");
  h.batch.cancelFile("first");
  expect(h.batch.isCurrent("first", a)).toBe(false); expect(h.batch.isCurrent("second", b)).toBe(true);
  expect(h.batch.finish("first", reply(a, "c".repeat(64)))).toBe(false);
  expect(h.batch.finish("second", reply(b, "d".repeat(64)))).toBe(true);
  expect(h.batch.draft().cards).toHaveLength(1);
  expect(h.batch.draft().cards[0]!.identity.history[0]!.screenshot?.sourceId).toBe("d".repeat(64));
});

test("batch cancellation preserves completed review evidence and cannot be resumed by appending files", () => {
  const h = harness(), a = h.begin("first"), b = h.begin("second");
  h.batch.finish("first", reply(a, "c".repeat(64))); h.batch.cancel();
  expect(h.batch.finish("second", reply(b, "d".repeat(64)))).toBe(false);
  expect(h.batch.snapshot()).toMatchObject({ status: "cancelled", files: [{ status: "complete" }, { status: "cancelled" }, { status: "cancelled" }] });
  expect(h.batch.draft().cards).toHaveLength(1);
  expect(() => h.batch.addFiles([{ key: "fourth", name: "fourth.png" }])).toThrow("closed");
});

test("a changed input permanently invalidates saving even when a previous picture completed", () => {
  const h = harness(["first", "second"]), a = h.begin("first"), b = h.begin("second");
  h.batch.finish("first", reply(a, "c".repeat(64))); h.batch.invalidate(); h.batch.cancel();
  expect(h.batch.isCurrent("second", b)).toBe(false); expect(h.batch.finish("second", reply(b, "d".repeat(64)))).toBe(false);
  expect(h.batch.snapshot().status).toBe("stale"); expect(() => h.batch.draft()).toThrow("catalogBinding");
  expect(() => h.batch.addFiles([{ key: "new", name: "new.png" }])).toThrow("closed");
});

test("decode time consumes the same image budget and exact deadline output cannot claim complete", () => {
  const h = harness(["first"]);
  h.batch.prepare("first", { jobId: "9007199254740993:first", startedAt: 1000, deadline: 1100 }); h.now(1080);
  expect(() => h.batch.begin("first", { jobId: "reset-budget", sourceId: "c".repeat(64), width: 100, height: 100, startedAt: 1080, deadline: 1180 })).toThrow("budget changed");
  const a = h.begin("first"); h.now(1100);
  expect(h.batch.isCurrent("first", a)).toBe(true);
  expect(h.batch.finish("first", reply(a, "c".repeat(64)))).toBe(false);
  expect(h.batch.snapshot().files[0]).toMatchObject({ status: "timeLimit", elapsedMs: 100 });
  expect(h.batch.draft().cards).toEqual([]);
});

test("expired preparation records a terminal snapshot and its reserved binding before throwing", () => {
  const h = harness(["first"]); h.now(1100);
  expect(() => h.batch.prepare("first", { jobId: "expired-preparation", startedAt: 1000, deadline: 1100 })).toThrow("timeLimit");
  const terminal = h.batch.snapshot();
  expect(terminal.status).toBe("finished");
  expect(terminal.files[0]).toMatchObject({ status: "timeLimit", elapsedMs: 100,
    binding: { jobId: "expired-preparation", inputRevision: revision, datasetId: source().sourceId, galleryId } });
  expect(h.batch.isCurrent("first", terminal.files[0]!.binding!)).toBe(false);
  expect(terminal.files[0]!.result).toBeUndefined(); expect(terminal.files[0]!.draft).toBeUndefined();
  expect(h.batch.draft().cards).toEqual([]);
});

test("begin crossing the exact deadline retains the same attempt and publishes no candidate evidence", () => {
  const h = harness(["first"]), preparation = h.batch.prepare("first", { jobId: "deadline-at-begin", startedAt: 1000, deadline: 1100 });
  const previouslyPublished = h.batch.snapshot(); h.now(1100);
  expect(() => h.batch.begin("first", { jobId: preparation.jobId, sourceId: "c".repeat(64), width: 100, height: 100, startedAt: 1000, deadline: 1100 })).toThrow("timeLimit");
  const terminal = h.batch.snapshot();
  expect(previouslyPublished.files[0]!.status).toBe("preparing");
  expect(terminal.files[0]).toMatchObject({ status: "timeLimit", elapsedMs: 100, binding: preparation, sourceId: "c".repeat(64) });
  // A UI must publish this terminal snapshot even though its pending-job guard is now false.
  expect(h.batch.isCurrent("first", preparation)).toBe(false);
  expect(h.batch.finish("first", reply(preparation, "c".repeat(64)))).toBe(false);
  expect(terminal.files[0]!.result).toBeUndefined(); expect(terminal.files[0]!.draft).toBeUndefined();
  expect(h.batch.draft().cards).toEqual([]);
});

test("non-complete worker replies cannot leak candidate cards into a successful batch draft", () => {
  const h = harness(["first", "second"]), a = h.begin("first"), b = h.begin("second");
  h.batch.finish("first", reply(a, "c".repeat(64)));
  expect(h.batch.finish("second", { ...reply(b, "d".repeat(64), null, "snap"), status: "failed", error: "runtime unavailable" })).toBe(false);
  expect(h.batch.snapshot().files[1]).toMatchObject({ status: "failed", result: { cards: [] } });
  expect(h.batch.draft().cards.map(card => card.kind)).toEqual(["member"]);
});

test("append retains a finished batch and invalid duplicate keys cannot partially append", () => {
  const h = harness(["first"]), a = h.begin("first"); h.batch.finish("first", reply(a, "c".repeat(64)));
  expect(h.batch.snapshot().status).toBe("finished");
  expect(() => h.batch.addFiles([{ key: "new", name: "new.png" }, { key: "first", name: "duplicate.png" }])).toThrow("key");
  expect(h.batch.snapshot().files).toHaveLength(1);
  h.batch.addFiles([{ key: "second", name: "second.png" }]); expect(h.batch.snapshot().status).toBe("active");
  const b = h.begin("second"); h.batch.finish("second", reply(b, "d".repeat(64), null, "snap"));
  expect(h.batch.draft().cards).toHaveLength(2);
});

test("retry keeps failed attempt history, requires a new job and rejects the old job's late reply", () => {
  const h = harness(["first"]), old = h.begin("first"), oldReply = reply(old, "c".repeat(64));
  h.batch.fail("first", "runtime unavailable"); h.batch.retryFile("first");
  expect(() => h.begin("first")).toThrow("binding");
  const next = h.batch.begin("first", { jobId: "new-job", sourceId: "c".repeat(64), width: 100, height: 100, startedAt: 1000, deadline: 1100 });
  expect(h.batch.finish("first", oldReply)).toBe(false); expect(h.batch.isCurrent("first", next)).toBe(true);
  expect(h.batch.finish("first", reply(next, "c".repeat(64)))).toBe(true);
  expect(h.batch.snapshot().files[0]).toMatchObject({ status: "complete", attempts: [{ status: "failed", binding: old, error: "runtime unavailable" }] });
  expect(h.batch.draft().cards[0]!.identity.history).toHaveLength(1);
});

test("cancel then retry during decode prevents old decode/error continuations from occupying the new attempt", () => {
  const h = harness(["first"]), old = h.batch.prepare("first", { jobId: "old-decode", startedAt: 1000, deadline: 1100 });
  h.batch.cancelFile("first"); h.batch.retryFile("first");
  const next = h.batch.prepare("first", { jobId: "new-decode", startedAt: 1000, deadline: 1100 });
  expect(h.batch.isCurrent("first", old)).toBe(false); expect(h.batch.isCurrent("first", next)).toBe(true);
  expect(() => h.batch.begin("first", { jobId: old.jobId, sourceId: "c".repeat(64), width: 100, height: 100, startedAt: 1000, deadline: 1100 })).toThrow("job changed");
  expect(h.batch.fail("first", "old decode failed", old)).toBe(false);
  const running = h.batch.begin("first", { jobId: next.jobId, sourceId: "c".repeat(64), width: 100, height: 100, startedAt: 1000, deadline: 1100 });
  expect(h.batch.finish("first", reply(running, "c".repeat(64)))).toBe(true);
  expect(h.batch.snapshot().files[0]).toMatchObject({ status: "complete", attempts: [{ status: "cancelled", binding: old }] });
});

test("a retry after timeout has an explicit new budget without retroactively completing the expired job", () => {
  const h = harness(["first"]), old = h.begin("first"); h.now(1100);
  h.batch.finish("first", reply(old, "c".repeat(64))); h.batch.retryFile("first");
  const next = h.batch.begin("first", { jobId: "retry-job", sourceId: "c".repeat(64), width: 100, height: 100, startedAt: 1100, deadline: 1200 });
  expect(h.batch.finish("first", reply(old, "c".repeat(64)))).toBe(false);
  h.now(1199); expect(h.batch.finish("first", reply(next, "c".repeat(64)))).toBe(true);
  expect(h.batch.snapshot().files[0]).toMatchObject({ status: "complete", attempts: [{ status: "timeLimit", elapsedMs: 100 }] });
  expect(() => h.batch.retryFile("first")).toThrow("retry");
});

test("input and output mutations cannot change the pinned source or already accepted evidence", () => {
  const selected = source(), batch = new RecognitionBatch({ batchId: "immutable", inputRevision: revision, source: selected, galleryId, manifestSha256,
    at: 42, files: [{ key: "one", name: "one.png" }], clock: () => 1000 });
  selected.masterVersion = "changed"; selected.cards = [];
  const a = batch.begin("one", { jobId: "one-job", sourceId: "c".repeat(64), width: 100, height: 100, startedAt: 1000, deadline: 1100 });
  const found = reply(a, "c".repeat(64)); expect(batch.finish("one", found)).toBe(true);
  found.cards[0]!.id = "999";
  const snapshot = batch.snapshot(); snapshot.files[0]!.draft!.cards[0]!.identity.value = "888";
  expect(batch.draft().cards[0]!.identity.value).toBe(largeId);
  expect(batch.snapshot().files[0]!.result!.cards[0]!.id).toBe(largeId);
});

test("worker cancellation retains the exact image SHA and monotonic elapsed time for batch accounting", async () => {
  let now = 1000, terminated = 0;
  const worker: WorkerLike = { onmessage: null, onerror: null, postMessage() {}, terminate() { terminated++; } };
  const client = new RecognitionWorkerClient(() => worker, () => now), selected = source();
  const binding = { jobId: "9007199254740993", inputRevision: revision, datasetId: selected.sourceId, galleryId };
  const pending = client.run({ binding, source: selected,
    configuration: { workerUrl: "https://example.invalid/worker.js", manifestUrl: "https://example.invalid/manifest.json", manifestSha256 },
    image: { sourceId: "c".repeat(64), width: 1, height: 1, rgba: new ArrayBuffer(4) }, timeLimitMs: 100, isCurrent: () => true, onProgress() {} });
  now = 1025; client.cancel();
  expect(await pending).toMatchObject({ status: "cancelled", binding, sourceId: "c".repeat(64), elapsedMs: 25, cards: [] });
  expect(terminated).toBe(1);
});
