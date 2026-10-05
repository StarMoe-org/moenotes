import type { GameServer } from "@/config/servers";
import { createBox, mergeBoxes, parseBox, type CardBox } from "./model";
import { BoxStorageError, readLocalBox, saveLocalBox, deleteLocalBox, subscribeLocalBox, type BoxChange } from "./store";

export type BoxMode = "local" | "temporary";
export interface BoxSnapshot { box: CardBox | null; mode: BoxMode; busy: boolean; error: BoxStorageError["code"] | null }
export interface BoxBackend {
  read: (server: GameServer) => Promise<CardBox | null>;
  save: (box: CardBox, revision: number | null) => Promise<CardBox>;
  remove: (server: GameServer, revision: number, boxId: string) => Promise<void>;
  subscribe: (listener: (change: BoxChange) => void) => () => void;
}
const localBackend: BoxBackend = { read: readLocalBox, save: saveLocalBox, remove: deleteLocalBox, subscribe: subscribeLocalBox };

/** One session per server and browser document. Temporary facts never enter persistent storage. */
export class CardBoxSession {
  private state: BoxSnapshot = { box: null, mode: "local", busy: true, error: null };
  private readonly listeners = new Set<() => void>();
  private loaded = false;
  private epoch = 0;
  private unsubscribe: (() => void) | undefined;
  private refreshAfterWrite = false;
  constructor(readonly server: GameServer, private readonly backend: BoxBackend = localBackend) {}
  getSnapshot = (): BoxSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.unsubscribe ??= this.backend.subscribe(change => {
      if (change.server !== this.server || this.state.mode !== "local") return;
      if (this.state.busy) { this.refreshAfterWrite = true; return; }
      void this.refresh();
    });
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.unsubscribe?.(); this.unsubscribe = undefined; }
    };
  };
  private update(patch: Partial<BoxSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private fail(error: unknown): void {
    this.update({ error: error instanceof BoxStorageError ? error.code : "invalid" });
  }
  private async settle(epoch: number): Promise<void> {
    if (epoch !== this.epoch) return;
    if (this.refreshAfterWrite && this.state.mode === "local") {
      this.refreshAfterWrite = false;
      await this.refresh();
    } else {
      this.refreshAfterWrite = false;
      this.update({ busy: false });
    }
  }
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await this.refresh();
  }
  async refresh(clearError = false): Promise<void> {
    if (this.state.mode !== "local") return;
    const epoch = ++this.epoch;
    this.update({ busy: true });
    try {
      const box = await this.backend.read(this.server);
      if (epoch === this.epoch && this.state.mode === "local") this.update({ box, ...(clearError ? { error: null } : {}) });
    } catch (error) { if (epoch === this.epoch) this.fail(error); }
    finally { await this.settle(epoch); }
  }
  async commit(next: CardBox, expectedRevision = next.revision): Promise<boolean> {
    const { box, busy, mode } = this.state;
    if (busy) return false;
    if (next.server !== this.server || !box || next.id !== box.id || expectedRevision !== box.revision) {
      this.update({ error: "conflict" }); return false;
    }
    const epoch = ++this.epoch;
    this.update({ busy: true, error: null });
    try {
      if (!Number.isSafeInteger(box.revision + 1)) throw new BoxStorageError("invalid");
      const clean = parseBox(JSON.stringify(next));
      const saved = mode === "local" ? await this.backend.save(clean, box.revision)
        : { ...clean, revision: box.revision + 1, updatedAt: Date.now() };
      if (epoch === this.epoch) this.update({ box: saved });
      return true;
    } catch (error) {
      this.fail(error);
      if (error instanceof BoxStorageError && error.code === "conflict") {
        const latest = await this.backend.read(this.server).catch(() => null);
        if (epoch === this.epoch) this.update({ box: latest });
      }
      return false;
    } finally {
      await this.settle(epoch);
    }
  }
  /** Changing destination preserves facts. Existing local facts merge instead of disappearing. */
  async start(mode: BoxMode): Promise<boolean> {
    if (this.state.busy) return false;
    const existing = this.state.box;
    const epoch = ++this.epoch;
    this.update({ busy: true, error: null });
    try {
      if (mode === "temporary") {
        this.update({ mode, box: existing ? structuredClone(existing) : createBox(this.server, crypto.randomUUID()) });
      } else {
        const local = await this.backend.read(this.server);
        const next = existing && this.state.mode === "temporary" ? local ? mergeBoxes(local, existing) : existing
          : local ?? createBox(this.server, crypto.randomUUID());
        const saved = local === next ? local : await this.backend.save(next, local?.revision ?? null);
        if (epoch === this.epoch) this.update({ mode, box: saved });
      }
      return true;
    } catch (error) { this.fail(error); return false; }
    finally {
      await this.settle(epoch);
    }
  }
  async remove(): Promise<boolean> {
    const { box, busy, mode } = this.state;
    if (!box || busy) return false;
    const epoch = ++this.epoch;
    this.update({ busy: true, error: null });
    try {
      if (mode === "local") await this.backend.remove(this.server, box.revision, box.id);
      if (epoch === this.epoch) this.update({ box: null });
      return true;
    } catch (error) { this.fail(error); return false; }
    finally {
      await this.settle(epoch);
    }
  }
  /** Explicitly adopt reviewed cloud facts. An intervening local edit always wins. */
  async adopt(incoming: CardBox, expected: { id: string; revision: number } | null): Promise<boolean> {
    const { box, busy, mode } = this.state;
    if (busy || incoming.server !== this.server) return false;
    if ((box?.id ?? null) !== (expected?.id ?? null) || (box?.revision ?? null) !== (expected?.revision ?? null)) {
      this.update({ error: "conflict" }); return false;
    }
    if (box) return this.commit({ ...incoming, id: box.id, revision: box.revision }, box.revision);
    const epoch = ++this.epoch;
    this.update({ busy: true, error: null });
    try {
      const clean = parseBox(JSON.stringify(incoming));
      const saved = mode === "local" ? await this.backend.save(clean, null) : { ...clean, revision: 1, updatedAt: Date.now() };
      if (epoch === this.epoch) this.update({ box: saved });
      return true;
    } catch (error) { this.fail(error); return false; }
    finally { await this.settle(epoch); }
  }
}

const sessions = new Map<GameServer, CardBoxSession>();
export function getCardBoxSession(server: GameServer): CardBoxSession {
  let session = sessions.get(server);
  if (!session) { session = new CardBoxSession(server); sessions.set(server, session); }
  return session;
}
