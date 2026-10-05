import { isGameServer, type GameServer } from "@/config/servers";
import { cardBoxPath } from "@/config/account";
import { parseBox, type CardBox } from "./model";

export interface CloudBoxAssociation { server: GameServer; uid: string }
export interface CloudBoxScope { userId: string; server: GameServer; association: CloudBoxAssociation | null }
export interface CloudBoxEnvelope {
  box: CardBox | null;
  /** The opaque server CAS token. Never convert it to a number or derive it from box.revision. */
  revision: string | null;
  association: CloudBoxAssociation | null;
  updatedAt: number | null;
  replayed?: boolean;
  appliedRevision?: string;
}
export type CloudBoxErrorCode = "revision_conflict" | "mutation_conflict" | "signed_out" | "stale_scope" | "invalid" | "unavailable";
export class CloudBoxError extends Error {
  constructor(readonly code: CloudBoxErrorCode, readonly current?: CloudBoxEnvelope) { super(`Card box cloud: ${code}`); }
}
export interface PreparedCloudMutation {
  readonly method: "PUT" | "DELETE";
  readonly mutationId: string;
  /** Frozen bytes: retry this object, not a newly serialized draft with its old mutation ID. */
  readonly body: string;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const revision = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]*$/.test(value);
const decimalId = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]*$/.test(value);
const safeTime = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function association(value: unknown, server: GameServer): CloudBoxAssociation | null {
  if (value === null) return null;
  if (!object(value) || Object.keys(value).some(key => !["server", "uid"].includes(key)) || value.server !== server || !decimalId(value.uid)) throw new CloudBoxError("invalid");
  return { server, uid: value.uid };
}

export function parseCloudBoxEnvelope(value: unknown, server: GameServer): CloudBoxEnvelope {
  if (!object(value) || Object.keys(value).some(key => !["box", "revision", "association", "updatedAt", "replayed", "appliedRevision"].includes(key))
    || (value.revision !== null && !revision(value.revision)) || (value.updatedAt !== null && !safeTime(value.updatedAt))
    || (value.replayed !== undefined && typeof value.replayed !== "boolean")
    || (value.appliedRevision !== undefined && !revision(value.appliedRevision))) throw new CloudBoxError("invalid");
  let box: CardBox | null = null;
  if (value.box !== null) {
    try { box = parseBox(JSON.stringify(value.box)); } catch { throw new CloudBoxError("invalid"); }
    if (box.server !== server || value.revision === null || value.updatedAt === null) throw new CloudBoxError("invalid");
  }
  const linked = association(value.association, server);
  if (box === null && linked !== null) throw new CloudBoxError("invalid");
  // A tombstone has a non-null revision. Initial absence alone has a null revision/time.
  if (value.revision === null && (value.updatedAt !== null || box !== null)) throw new CloudBoxError("invalid");
  return { box, revision: value.revision as string | null, association: linked, updatedAt: value.updatedAt as number | null,
    ...(value.replayed !== undefined ? { replayed: value.replayed as boolean } : {}),
    ...(value.appliedRevision !== undefined ? { appliedRevision: value.appliedRevision as string } : {}) };
}

/** One account/server generation. isCurrent must also invalidate a changed game association or Box. */
export class CloudBoxClient {
  readonly scope: Readonly<CloudBoxScope>;
  private readonly url: string;
  private readonly requests = new WeakSet<PreparedCloudMutation>();
  private readonly fetcher: typeof fetch;
  constructor(scope: CloudBoxScope, private readonly options: {
    isCurrent: () => boolean;
    fetch?: typeof fetch;
  }) {
    if (!scope.userId || typeof scope.userId !== "string" || !isGameServer(scope.server)) throw new CloudBoxError("invalid");
    const linked = association(scope.association, scope.server);
    this.scope = Object.freeze({ userId: scope.userId, server: scope.server, association: linked ? Object.freeze(linked) : null });
    this.url = cardBoxPath(scope.server);
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }
  private check(): void { if (!this.options.isCurrent()) throw new CloudBoxError("stale_scope"); }
  private async request(method: "GET" | "PUT" | "DELETE", body?: string): Promise<Response> {
    this.check();
    let response: Response;
    try {
      response = await this.fetcher(this.url, { method, credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { accept: "application/json", "x-card-box-user": this.scope.userId,
          ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body }) });
    } catch {
      this.check();
      throw new CloudBoxError("unavailable");
    }
    this.check();
    return response;
  }
  private async json(response: Response): Promise<unknown> {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new CloudBoxError("invalid");
    let data: unknown;
    try { data = await response.json(); } catch { this.check(); throw new CloudBoxError("invalid"); }
    this.check();
    return data;
  }
  private async failure(response: Response): Promise<never> {
    if (response.status === 401) throw new CloudBoxError("signed_out");
    if (response.status === 409) {
      const data = await this.json(response);
      if (object(data) && data.error === "stale_scope") throw new CloudBoxError("stale_scope");
      if (!object(data) || !["revision_conflict", "mutation_conflict"].includes(String(data.error))) throw new CloudBoxError("invalid");
      const current = data.current === undefined && data.error === "mutation_conflict" ? undefined : parseCloudBoxEnvelope(data.current, this.scope.server);
      throw new CloudBoxError(data.error as "revision_conflict" | "mutation_conflict", current);
    }
    throw new CloudBoxError(response.status >= 500 || response.status === 404 ? "unavailable" : "invalid");
  }
  async read(): Promise<CloudBoxEnvelope> {
    const response = await this.request("GET");
    if (!response.ok) return this.failure(response);
    return parseCloudBoxEnvelope(await this.json(response), this.scope.server);
  }
  private prepare(method: "PUT" | "DELETE", data: Record<string, unknown>): PreparedCloudMutation {
    this.check();
    const mutationId = crypto.randomUUID();
    const body = JSON.stringify({ ...data, mutationId });
    if (new TextEncoder().encode(body).byteLength > 20_000_000) throw new CloudBoxError("invalid");
    const request = Object.freeze({ method, mutationId, body });
    this.requests.add(request);
    return request;
  }
  preparePut(box: CardBox, expectedRevision: string | null, linked: CloudBoxAssociation | null = this.scope.association): PreparedCloudMutation {
    if (expectedRevision !== null && !revision(expectedRevision)) throw new CloudBoxError("invalid");
    let clean: CardBox;
    try { clean = parseBox(JSON.stringify(box)); } catch { throw new CloudBoxError("invalid"); }
    if (clean.server !== this.scope.server) throw new CloudBoxError("invalid");
    return this.prepare("PUT", { box: clean, expectedRevision, association: association(linked, this.scope.server) });
  }
  prepareDelete(expectedRevision: string, boxId: string): PreparedCloudMutation {
    if (!revision(expectedRevision) || typeof boxId !== "string" || !boxId) throw new CloudBoxError("invalid");
    return this.prepare("DELETE", { expectedRevision, boxId });
  }
  async submit(prepared: PreparedCloudMutation): Promise<CloudBoxEnvelope> {
    this.check();
    if (!this.requests.has(prepared)) throw new CloudBoxError("invalid");
    const response = await this.request(prepared.method, prepared.body);
    if (!response.ok) return this.failure(response);
    try {
      if (prepared.method === "DELETE") {
        if (response.status !== 204) throw new CloudBoxError("invalid");
        // Even a replayed deletion can be followed by another device's recreation.
        return await this.read();
      }
      return parseCloudBoxEnvelope(await this.json(response), this.scope.server);
    } catch (error) {
      this.check();
      if (error instanceof CloudBoxError && ["signed_out", "stale_scope"].includes(error.code)) throw error;
      // A successful write with an unreadable response has an uncertain outcome. Replay the same mutation.
      throw new CloudBoxError("unavailable");
    }
  }
}
