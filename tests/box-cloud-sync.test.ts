import { describe, expect, test } from "bun:test";
import { CloudBoxClient } from "../src/lib/box/cloud";
import { CloudBoxSync, boxContentKey, reviewCloudBox } from "../src/lib/box/cloud-sync";
import { answerField, observeField, createBox, createCard, parseBox, unknownField, type CardBox } from "../src/lib/box/model";

const empty = { box: null, revision: null, association: null, updatedAt: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const envelope = (box: CardBox, revision = "1") => ({ box, revision, association: null, updatedAt: 100 });
function setup(fetcher: typeof fetch, isCurrent = () => true) {
  return new CloudBoxSync(new CloudBoxClient({ userId: "synthetic-user", server: "jp", association: null }, { fetch: fetcher, isCurrent }), isCurrent);
}

describe("account collection synchronization", () => {
  test("an existing different cloud collection requires review before any write", async () => {
    const cloud = createBox("jp", "cloud", 100), device = createBox("jp", "device", 100);
    cloud.cards.push(createCard("member", "cloud-card", "1", 100));
    let writes = 0;
    const sync = setup((async (_url, init) => { if (init?.method === "PUT") writes++; return json(envelope(cloud)); }) as typeof fetch);
    await sync.read();
    expect(sync.needsReview(device)).toBe(true);
    expect(await sync.save(device)).toBeNull(); expect(writes).toBe(0);
    expect(device.cards).toHaveLength(0); expect(sync.getSnapshot().remote?.box?.cards).toHaveLength(1);
  });
  test("a lost response retries the identical operation even if the device is edited meanwhile", async () => {
    const bodies: string[] = [];
    const device = createBox("jp", "device", 100);
    const sync = setup((async (_url, init) => {
      if (init?.method === "GET") return json(empty);
      bodies.push(String(init?.body));
      if (bodies.length === 1) throw new TypeError("synthetic network loss");
      return json(envelope(JSON.parse(bodies[0]!).box, "2"));
    }) as typeof fetch);
    await sync.read(); await sync.save(device);
    expect(sync.getSnapshot().retrying).toBe("PUT");
    device.cards.push(createCard("member", "new-card", "1", 101));
    expect(await sync.save(device)).toBeNull();
    await sync.read(); // A read must not silently discard the uncertain mutation.
    expect(await sync.retry()).not.toBeNull();
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
    expect(sync.matches(device)).toBe(false); expect(sync.getSnapshot().status).toBe("ready");
  });
  test("a damaged 2xx response retains the original operation for idempotent replay", async () => {
    for (const damaged of [() => new Response("{", { headers: { "content-type": "application/json" } }), () => json({ box: "not-an-envelope" })]) {
      const bodies: string[] = [], device = createBox("jp", "device", 100);
      const sync = setup((async (_url, init) => {
        if (init?.method === "GET") return json(empty);
        bodies.push(String(init?.body));
        return bodies.length === 1 ? damaged() : json(envelope(JSON.parse(bodies[0]!).box));
      }) as typeof fetch);
      await sync.read(); expect(await sync.save(device)).toBeNull();
      expect(sync.getSnapshot().retrying).toBe("PUT");
      expect(await sync.retry()).not.toBeNull(); expect(bodies[1]).toBe(bodies[0]);
    }
  });
  test("the server's shared-cookie identity guard rejects a live but outdated client scope", async () => {
    const sent: RequestInit[] = [];
    const sync = setup((async (_url, init) => {
      sent.push(init!);
      return sent.length === 1 ? json(empty) : json({ error: "stale_scope" }, 409);
    }) as typeof fetch);
    await sync.read(); expect(await sync.save(createBox("jp", "old-account-draft", 100))).toBeNull();
    expect(sent.every(request => new Headers(request.headers).get("x-card-box-user") === "synthetic-user")).toBe(true);
    expect(sync.getSnapshot().error).toBe("stale_scope"); expect(sync.getSnapshot().retrying).toBeNull();
  });
  test("CAS conflict retains the draft and requires review of the supplied newer copy", async () => {
    const original = createBox("jp", "cloud", 100), newer = structuredClone(original);
    newer.cards.push(createCard("snap", "other-device", "1", 110));
    const sync = setup((async (_url, init) => init?.method === "GET" ? json(envelope(original)) : json({ error: "revision_conflict", current: envelope(newer, "9007199254740993") }, 409)) as typeof fetch);
    await sync.read();
    const draft = structuredClone(original);
    draft.cards.push(createCard("member", "own-edit", "2", 115));
    expect(await sync.save(draft, "1")).toBeNull();
    expect(sync.getSnapshot().status).toBe("conflict");
    expect(sync.getSnapshot().remote?.revision).toBe("9007199254740993");
    expect(sync.needsReview(draft)).toBe(true);
    expect(draft.cards.map(card => card.key)).toEqual(["own-edit"]);
  });
  test("an idempotent replay followed by another device's change is never reported as synced", async () => {
    const device = createBox("jp", "device", 100);
    const sync = setup((async (_url, init) => init?.method === "GET" ? json(empty) : json({ ...empty, revision: "3", updatedAt: 200, replayed: true, appliedRevision: "1" })) as typeof fetch);
    await sync.read(); expect(await sync.save(device)).toBeNull();
    expect(sync.getSnapshot().status).toBe("conflict"); expect(sync.matches(device)).toBe(false);
    expect(sync.getSnapshot().remote?.revision).toBe("3");
  });
  test("switching account or Box scope drops a pending read and cannot reuse its outbox", async () => {
    let active = true, finish!: (response: Response) => void;
    const sync = setup((() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch, () => active);
    const reading = sync.read(); active = false; finish(json(envelope(createBox("jp", "old-account", 100)))); await reading;
    expect(sync.getSnapshot().remote).toBeNull();
    expect(await sync.save(createBox("jp", "new-account", 100))).toBeNull();
  });
  test("cloud identity survives reviewed replacement and deleted revisions are used for recreation", async () => {
    const cloud = createBox("jp", "cloud-id", 100), device = createBox("jp", "device-id", 100);
    device.cards.push(createCard("member", "local-only", "1", 100));
    const requests: Record<string, any>[] = [];
    let deleted = false;
    const sync = setup((async (_url, init) => {
      if (init?.method === "GET") return json(deleted ? { ...empty, revision: "3", updatedAt: 120 } : envelope(cloud));
      const body = JSON.parse(String(init?.body)); requests.push(body);
      if (init?.method === "DELETE") { deleted = true; return new Response(null, { status: 204 }); }
      return json(envelope(body.box, deleted ? "4" : "2"));
    }) as typeof fetch);
    await sync.read(); await sync.save(device, "1");
    expect(requests[0]!.box.id).toBe("cloud-id"); expect(device.id).toBe("device-id");
    await sync.remove("2", "cloud-id"); expect(sync.getSnapshot().remote?.box).toBeNull();
    await sync.save(device);
    expect(requests[2]!.expectedRevision).toBe("3"); expect(requests[2]!.box.id).toBe("device-id");
  });
  test("merging conflicting manual facts and save links preserves explicit user choices", () => {
    const device = createBox("jp", "device", 100), cloud = createBox("jp", "cloud", 100);
    for (const [box, value, id] of [[device, 2, "device-answer"], [cloud, 4, "cloud-answer"]] as const) {
      const card = createCard("member", `${id}-card`, "1", 100);
      card.fields.liveSkillLevel = answerField(unknownField(), { id, value, source: "manual", at: 101 }); box.cards.push(card);
    }
    cloud.save = { server: "jp", accountId: "9007199254740993", sha256: "a".repeat(64), uploadedAt: 100 };
    const merged = reviewCloudBox(device, cloud, "merge", "device");
    expect(merged.cards).toHaveLength(1); expect(merged.cards[0]!.fields.liveSkillLevel.status).toBe("conflict");
    expect(merged.save).toBeNull(); expect(merged.id).toBe("cloud");
    expect(reviewCloudBox(device, cloud, "merge", "cloud").save).toEqual(cloud.save);
    expect(reviewCloudBox(device, cloud, "cloud", "device")).toEqual(cloud);
    expect(device.save).toBeNull(); expect(device.cards[0]!.fields.liveSkillLevel.value).toBe(2);
  });
  test("content comparison ignores storage counters and property order but retains actual facts", () => {
    const a = createBox("jp", "a", 100), b = { ...structuredClone(a), id: "b", revision: 99, updatedAt: 200 };
    expect(boxContentKey(a)).toBe(boxContentKey(b));
    const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
    expect(boxContentKey(a)).toBe(boxContentKey(reverse(b) as CardBox));
    b.player.bandItemsComplete = true; expect(boxContentKey(a)).not.toBe(boxContentKey(b));
  });
  test("both published recognition generations survive local and cloud round trips", () => {
    for (const method of ["siftFlannWasm", "boxLensEncoderOrtWasm"] as const) {
      for (const parameter of ["boxLensNumberReaderOrtWasm", "boxLensClassifierOrtWasm"] as const) {
        const box = createBox("jp", "provenance", 100), card = createCard("member", "one", "1", 100);
        card.fields.level = observeField(unknownField(), { id: "observed", value: 30, source: "screenshot", at: 100,
          screenshot: { sourceId: "synthetic-image", bbox: [0, 0, 40, 40], recognition: { method, galleryId: "a".repeat(64), manifestSha256: "b".repeat(64), uiMasterSourceId: "synthetic-master" },
            parameterRecognition: { method: parameter, modelSha256: "c".repeat(64), runtimeId: "synthetic-runtime" } } });
        box.cards.push(card);
        expect(parseBox(JSON.stringify(box))).toEqual(box);
      }
    }
  });
});
