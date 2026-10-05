import type { GameServer } from "@/config/servers";
import { parseBox, type CardBox } from "./model";

export class BoxStorageError extends Error {
  constructor(readonly code: "unavailable" | "conflict" | "invalid") { super(`Card box storage: ${code}`); }
}
export interface BoxChange { server: GameServer; revision: number | null }
const listeners = new Set<(change: BoxChange) => void>();
const sender = `box-${Math.random().toString(36).slice(2)}`;
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new BoxStorageError("unavailable"));
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    let rejected = false;
    const request = indexedDB.open("moenotes-card-box", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("boxes", { keyPath: "server" }); };
    request.onerror = request.onblocked = () => { rejected = true; database = undefined; reject(new BoxStorageError("unavailable")); };
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  });
  return database;
}

function validate(value: unknown): CardBox {
  try { return parseBox(JSON.stringify(value)); } catch { throw new BoxStorageError("invalid"); }
}

/** Browser-only storage. No fetch, account cookie or screenshot upload occurs here. */
export async function readLocalBox(server: GameServer): Promise<CardBox | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("boxes", "readonly").objectStore("boxes").get(server);
    request.onerror = () => reject(new BoxStorageError("unavailable"));
    request.onsuccess = () => { try { resolve(request.result === undefined ? null : validate(request.result)); } catch (error) { reject(error); } };
  });
}

function publish(change: BoxChange): void {
  for (const listener of listeners) listener(change);
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("moenotes-card-box");
    channel.postMessage({ sender, change });
    channel.close();
  }
}

async function write(
  server: GameServer,
  expectedRevision: number | null,
  next: CardBox | null,
  expectedBoxId?: string,
): Promise<CardBox | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("boxes", "readwrite");
    const store = transaction.objectStore("boxes");
    let failure: unknown;
    let result: CardBox | null = null;
    const request = store.get(server);
    request.onsuccess = () => {
      try {
        const current = request.result === undefined ? null : validate(request.result);
        if ((current?.revision ?? null) !== expectedRevision) throw new BoxStorageError("conflict");
        if (expectedBoxId !== undefined && expectedRevision !== null && current?.id !== expectedBoxId) throw new BoxStorageError("conflict");
        if (current && next && current.id !== next.id) throw new BoxStorageError("conflict");
        if (next === null) { store.delete(server); return; }
        if (!Number.isSafeInteger((current?.revision ?? 0) + 1)) throw new BoxStorageError("invalid");
        result = { ...next, revision: (current?.revision ?? 0) + 1, updatedAt: Date.now() };
        store.put(result);
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.onabort = transaction.onerror = () => reject(failure ?? new BoxStorageError("unavailable"));
    transaction.oncomplete = () => { publish({ server, revision: result?.revision ?? null }); resolve(result); };
  });
}

/** Compare-and-swap prevents another tab's newer answers from being overwritten. */
export async function saveLocalBox(box: CardBox, expectedRevision: number | null): Promise<CardBox> {
  const clean = validate(box);
  return (await write(clean.server, expectedRevision, clean))!;
}

export async function deleteLocalBox(server: GameServer, expectedRevision: number, expectedBoxId?: string): Promise<void> {
  await write(server, expectedRevision, null, expectedBoxId);
}

export function subscribeLocalBox(listener: (change: BoxChange) => void): () => void {
  listeners.add(listener);
  const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("moenotes-card-box") : null;
  if (channel) channel.onmessage = event => {
    const message = event.data as { sender?: string; change?: BoxChange };
    if (message.sender !== sender && message.change) listener(message.change);
  };
  return () => { listeners.delete(listener); channel?.close(); };
}
