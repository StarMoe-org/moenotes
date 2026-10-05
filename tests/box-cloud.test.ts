import { describe, expect, test } from "bun:test";
import { CloudBoxClient, CloudBoxError, parseCloudBoxEnvelope } from "../src/lib/box/cloud";
import { createBox } from "../src/lib/box/model";

const empty = { box: null, revision: null, association: null, updatedAt: null };
const scope = { userId: "passport-sub-a", server: "jp" as const, association: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const saved = (id = "cloud-box", revision = "1") => ({ box: createBox("jp", id, 100), revision, association: null, updatedAt: 100 });
describe("private cloud Box contract", () => {
  test("CAS tokens above 2^53 stay exact strings and tombstones remain distinct from initial absence", () => {
    const token = "9007199254740993";
    expect(parseCloudBoxEnvelope({ ...empty, revision: token, updatedAt: 101 }, "jp").revision).toBe(token);
    expect(parseCloudBoxEnvelope(empty, "jp").revision).toBeNull();
    expect(() => parseCloudBoxEnvelope({ ...empty, revision: Number(token) }, "jp")).toThrow(CloudBoxError);
    expect(() => parseCloudBoxEnvelope({ ...empty, revision: "01" }, "jp")).toThrow(CloudBoxError);
  });
  test("malformed, wrong-region and unavailable responses do not become empty collections", async () => {
    expect(() => parseCloudBoxEnvelope(saved(), "tw")).toThrow(CloudBoxError);
    expect(() => parseCloudBoxEnvelope({ ...empty, association: { server: "jp", uid: "1" } }, "jp")).toThrow(CloudBoxError);
    const client = new CloudBoxClient(scope, { isCurrent: () => true, fetch: (async () => new Response("offline", { status: 503 })) as typeof fetch });
    await expect(client.read()).rejects.toMatchObject({ code: "unavailable" });
  });
  test("each retry uses the same frozen mutation body and ignores edits made after preparation", async () => {
    const requests: RequestInit[] = [];
    const client = new CloudBoxClient(scope, { isCurrent: () => true, fetch: (async (_url, init) => { requests.push(init!); return json(saved()); }) as typeof fetch });
    const box = createBox("jp", "cloud-box", 100), request = client.preparePut(box, "9007199254740993");
    box.player.bandItemsComplete = true;
    await client.submit(request); await client.submit(request);
    expect(requests[0]!.body).toBe(requests[1]!.body);
    expect(JSON.parse(String(requests[0]!.body)).expectedRevision).toBe("9007199254740993");
    expect(JSON.parse(String(requests[0]!.body)).box.player.bandItemsComplete).toBe(false);
    expect(client.preparePut(box, "9007199254740993").mutationId).not.toBe(request.mutationId);
    expect(requests[0]!.credentials).toBe("same-origin"); expect(requests[0]!.cache).toBe("no-store");
  });
  test("409 preserves the caller's draft and supplies the current private document", async () => {
    const current = saved("newer", "12"), draft = createBox("jp", "draft", 100);
    const client = new CloudBoxClient(scope, { isCurrent: () => true, fetch: (async () => json({ error: "revision_conflict", current }, 409)) as typeof fetch });
    await expect(client.submit(client.preparePut(draft, "11"))).rejects.toMatchObject({ code: "revision_conflict", current });
    expect(draft.id).toBe("draft"); expect(draft.revision).toBe(0);
  });
  test("PUT replay accepts the current later document, including a tombstone", async () => {
    const current = { ...empty, revision: "9", updatedAt: 100, replayed: true, appliedRevision: "3" };
    const client = new CloudBoxClient(scope, { isCurrent: () => true, fetch: (async () => json(current)) as typeof fetch });
    expect(await client.submit(client.preparePut(createBox("jp", "old-submission", 100), "2"))).toEqual(current);
  });
  test("DELETE replay re-reads and keeps another device's later recreation", async () => {
    const methods: string[] = [], current = saved("recreated", "10");
    const client = new CloudBoxClient(scope, { isCurrent: () => true, fetch: (async (_url, init) => {
      methods.push(init!.method!); return init!.method === "DELETE" ? new Response(null, { status: 204 }) : json(current);
    }) as typeof fetch });
    expect(await client.submit(client.prepareDelete("8", "old-box"))).toEqual(current);
    expect(methods).toEqual(["DELETE", "GET"]);
  });
  test("changing the account or association generation drops an already pending response", async () => {
    let active = true, resolve!: (response: Response) => void;
    const client = new CloudBoxClient(scope, { isCurrent: () => active, fetch: (() => new Promise<Response>(done => { resolve = done; })) as typeof fetch });
    const pending = client.read(); active = false; resolve(json(saved()));
    await expect(pending).rejects.toMatchObject({ code: "stale_scope" });
    expect(() => client.preparePut(createBox("jp", "x"), null)).toThrow(CloudBoxError);
  });
  test("a prepared operation cannot be replayed into another account", async () => {
    let sent = 0;
    const fetcher = (async () => { sent++; return json(saved()); }) as typeof fetch;
    const a = new CloudBoxClient(scope, { isCurrent: () => true, fetch: fetcher });
    const b = new CloudBoxClient({ ...scope, userId: "passport-sub-b" }, { isCurrent: () => true, fetch: fetcher });
    await expect(b.submit(a.preparePut(createBox("jp", "x"), null))).rejects.toMatchObject({ code: "invalid" });
    expect(sent).toBe(0);
  });
  test("401 asks for a new signed-in session and mutation conflicts remain distinct", async () => {
    const out = new CloudBoxClient(scope, { isCurrent: () => true, fetch: (async () => json({ error: "signed_out" }, 401)) as typeof fetch });
    await expect(out.read()).rejects.toMatchObject({ code: "signed_out" });
    const conflict = new CloudBoxClient(scope, { isCurrent: () => true, fetch: (async () => json({ error: "mutation_conflict", current: saved() }, 409)) as typeof fetch });
    await expect(conflict.submit(conflict.prepareDelete("1", "cloud-box"))).rejects.toMatchObject({ code: "mutation_conflict" });
  });
});
