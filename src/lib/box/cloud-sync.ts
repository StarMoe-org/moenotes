import { CloudBoxClient, CloudBoxError, type CloudBoxEnvelope, type CloudBoxErrorCode, type PreparedCloudMutation } from "./cloud";
import { mergeBoxes, type CardBox } from "./model";

/** Storage IDs and counters differ between devices; compare only the collection's facts. */
export function boxContentKey(box: CardBox): string {
  const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
    : JSON.stringify(value) ?? "null";
  const { id: _id, revision: _revision, updatedAt: _updatedAt, ...facts } = box;
  return canonical(facts);
}

export type CloudMergeChoice = "merge" | "device" | "cloud";
export function reviewCloudBox(device: CardBox | null, cloud: CardBox, choice: CloudMergeChoice, saveSource: "device" | "cloud"): CardBox {
  if (!device || choice === "cloud") return structuredClone(cloud);
  if (choice === "device") return { ...structuredClone(device), id: cloud.id };
  const merged = mergeBoxes(device, cloud);
  return { ...merged, id: cloud.id, save: structuredClone(saveSource === "cloud" ? cloud.save : device.save) };
}

export interface CloudSyncSnapshot {
  status: "idle" | "loading" | "ready" | "saving" | "deleting" | "conflict" | "error";
  remote: CloudBoxEnvelope | null;
  error: CloudBoxErrorCode | null;
  retrying: "PUT" | "DELETE" | null;
}

/** One Passport/server/Box scope, with an immutable outbox for uncertain network outcomes. */
export class CloudBoxSync {
  private state: CloudSyncSnapshot = { status: "idle", remote: null, error: null, retrying: null };
  private readonly listeners = new Set<() => void>();
  private pending: { request: PreparedCloudMutation; key: string | null } | null = null;
  private acceptedRevision: string | null = null;
  constructor(private readonly client: CloudBoxClient, private readonly isCurrent: () => boolean) {}
  getSnapshot = (): CloudSyncSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(patch: Partial<CloudSyncSnapshot>): void {
    if (!this.isCurrent()) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private get busy(): boolean { return ["loading", "saving", "deleting"].includes(this.state.status); }
  matches(box: CardBox | null): boolean { return !!box && !!this.state.remote?.box && boxContentKey(box) === boxContentKey(this.state.remote.box); }
  needsReview(box: CardBox | null): boolean {
    return !!this.state.remote?.box && !this.matches(box) && this.acceptedRevision !== this.state.remote.revision;
  }
  accept(revision: string | null): void { if (this.isCurrent() && revision === this.state.remote?.revision) this.acceptedRevision = revision; }
  requireReview(): void { this.acceptedRevision = null; this.update({}); }
  private fail(error: unknown): void {
    const failure = error instanceof CloudBoxError ? error : new CloudBoxError("unavailable");
    if (!this.isCurrent()) return;
    const conflict = failure.code === "revision_conflict" || failure.code === "mutation_conflict";
    if (failure.code !== "unavailable" && failure.code !== "signed_out") this.pending = null;
    if (conflict) this.acceptedRevision = null;
    this.update({ status: conflict ? "conflict" : "error", error: failure.code,
      ...(failure.current ? { remote: failure.current } : {}), retrying: this.pending?.request.method ?? null });
  }
  async read(): Promise<void> {
    if (this.busy || this.pending || !this.isCurrent()) return;
    this.update({ status: "loading", error: null });
    try {
      const remote = await this.client.read();
      if (remote.revision !== this.state.remote?.revision) this.acceptedRevision = null;
      this.update({ status: "ready", remote });
    } catch (error) { this.fail(error); }
  }
  async save(box: CardBox, reviewedRevision?: string | null): Promise<CloudBoxEnvelope | null> {
    const remote = this.state.remote;
    if (!remote || this.busy || this.pending || !this.isCurrent()) return null;
    if (reviewedRevision !== undefined && reviewedRevision !== remote.revision) return null;
    if (this.needsReview(box) && reviewedRevision !== remote.revision) return null;
    try {
      // Updating an active cloud collection preserves its identity, including an explicit replacement of its facts.
      const outgoing = { ...box, id: remote.box?.id ?? box.id };
      this.pending = { request: this.client.preparePut(outgoing, remote.revision, remote.association), key: boxContentKey(outgoing) };
      return await this.send();
    } catch (error) { this.fail(error); return null; }
  }
  async remove(expectedRevision: string, boxId: string): Promise<CloudBoxEnvelope | null> {
    const remote = this.state.remote;
    if (this.busy || this.pending || !this.isCurrent() || remote?.revision !== expectedRevision || remote.box?.id !== boxId) return null;
    try { this.pending = { request: this.client.prepareDelete(expectedRevision, boxId), key: null }; return await this.send(); }
    catch (error) { this.fail(error); return null; }
  }
  async retry(): Promise<CloudBoxEnvelope | null> { return this.pending && !this.busy && this.isCurrent() ? this.send() : null; }
  private async send(): Promise<CloudBoxEnvelope | null> {
    const pending = this.pending!;
    this.update({ status: pending.request.method === "PUT" ? "saving" : "deleting", error: null, retrying: pending.request.method });
    try {
      const remote = await this.client.submit(pending.request);
      this.pending = null;
      const applied = pending.key === null ? remote.box === null : !!remote.box && boxContentKey(remote.box) === pending.key;
      this.acceptedRevision = applied ? remote.revision : null;
      this.update({ remote, status: applied ? "ready" : "conflict", error: applied ? null : "revision_conflict", retrying: null });
      return applied && this.isCurrent() ? remote : null;
    } catch (error) { this.fail(error); return null; }
  }
}
