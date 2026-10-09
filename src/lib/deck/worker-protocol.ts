import type { DeckSolverRuntime } from "./runtime-source";

/**
 * Messages between the page and the deck solver Worker (`public/deck/deck-worker.js`), protocol
 * `moenotes.deck-worker/1` (docs/deck-worker.md). Solver input and output travel as the exact JSON text: parsing and
 * serializing again would round integers beyond 2^53.
 */
export const DECK_WORKER_PROTOCOL = "moenotes.deck-worker/1";

/** Page -> Worker, once per Worker: the files to download, verify and load. */
export interface DeckWorkerInit {
  type: "init";
  protocol: typeof DECK_WORKER_PROTOCOL;
  deckDataUrl: string; deckDataSha256: string; deckDataBytes: number;
  wasmUrl: string; wasmSha256: string; wasmBytes: number;
  glueUrl: string; glueSha256: string; glueBytes: number;
  /** The commit the deck data's `provenance.deck.commit` must name; `null` skips the check. */
  modelCommit: string | null;
}
/** Page -> Worker: one recommendation. The Worker runs one at a time. */
export interface DeckWorkerRun {
  type: "run";
  jobId: string;
  inputRevision: number;
  accountJson: string;
  requestJson: string;
  progressIntervalMs: number;
}
export type DeckWorkerCommand = DeckWorkerInit | DeckWorkerRun;

/** Master IDs and playable difficulties present in the verified solver dataset. */
export interface DeckDataCatalog {
  readonly eventIds: readonly number[];
  readonly musics: readonly { readonly id: number; readonly difficulties: readonly string[] }[];
  readonly challengeMusics: readonly { readonly id: number; readonly eventId: number; readonly musicId: number }[];
  readonly arenaMusics: readonly { readonly id: number; readonly musicId: number }[];
}

/** Worker -> page: the solver is loaded and bound to the deck data. */
export interface DeckWorkerReady {
  type: "ready";
  /** Lowercase hex SHA-256 of the deck data bytes, as the solver reports it. */
  datasetId: string;
  initMs: number;
  /** `DeckSolver.capabilities()` as text, or `null` when the solver has no such method. */
  capabilitiesJson: string | null;
  /** Dataset availability, or `null` when the Worker does not report it. */
  catalog?: DeckDataCatalog | null;
}
/** Worker -> page: a complete intermediate result, shaped like the final one. */
export interface DeckWorkerProgress { type: "progress"; jobId: string; inputRevision: number; resultJson: string }
export interface DeckWorkerResult { type: "result"; jobId: string; inputRevision: number; resultJson: string }

/**
 * `network`: a download failed. `integrity`: a file's size or SHA-256 differs from the init message, or the solver
 * reports another dataset. `identity`: the deck data names another model commit. `init`: the glue, the WASM or the
 * `DeckSolver` constructor failed. `runtime`: the solver crashed during a run; the Worker is unusable afterwards.
 * `protocol`: a malformed or out-of-order message.
 */
export const DECK_WORKER_FAILURE_CODES = ["network", "integrity", "identity", "init", "runtime", "protocol"] as const;
export type DeckWorkerFailureCode = typeof DECK_WORKER_FAILURE_CODES[number];
/** Worker -> page. Without `jobId` the failure concerns initialization or the Worker itself. */
export interface DeckWorkerFailed { type: "failed"; jobId?: string; inputRevision?: number; code: DeckWorkerFailureCode; message: string }
export type DeckWorkerEvent = DeckWorkerReady | DeckWorkerProgress | DeckWorkerResult | DeckWorkerFailed;

export interface DeckJobBinding { jobId: string; inputRevision: number }

const HEX64 = /^[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function isDataCatalog(value: unknown): value is DeckDataCatalog {
  if (!record(value)) return false;
  const ids = (list: unknown): boolean => Array.isArray(list) && list.every(positiveId) && new Set(list).size === list.length;
  const rows = (list: unknown, valid: (row: Record<string, unknown>) => boolean): boolean => Array.isArray(list)
    && list.every(row => record(row) && positiveId(row.id) && valid(row)) && new Set(list.map(row => row.id)).size === list.length;
  return ids(value.eventIds)
    && rows(value.musics, row => Array.isArray(row.difficulties) && row.difficulties.every(difficulty => ["easy", "normal", "hard", "expert"].includes(difficulty))
      && new Set(row.difficulties).size === row.difficulties.length)
    && rows(value.challengeMusics, row => positiveId(row.eventId) && positiveId(row.musicId))
    && rows(value.arenaMusics, row => positiveId(row.musicId));
}

/** The init message of a resolved runtime: the deck data, the engine's WASM and its glue. */
export function deckWorkerInit(runtime: DeckSolverRuntime): DeckWorkerInit {
  return {
    type: "init", protocol: DECK_WORKER_PROTOCOL,
    deckDataUrl: runtime.deckData.url, deckDataSha256: runtime.deckData.sha256, deckDataBytes: runtime.deckData.bytes,
    wasmUrl: runtime.engine.wasm.url, wasmSha256: runtime.engine.wasm.sha256, wasmBytes: runtime.engine.wasm.bytes,
    glueUrl: runtime.engine.js.url, glueSha256: runtime.engine.js.sha256, glueBytes: runtime.engine.js.bytes,
    modelCommit: runtime.modelCommit,
  };
}

/** A Worker message of this protocol, or `null` for anything else. */
export function parseDeckWorkerEvent(value: unknown): DeckWorkerEvent | null {
  if (!record(value)) return null;
  const job = typeof value.jobId === "string" && value.jobId !== "" && Number.isSafeInteger(value.inputRevision);
  switch (value.type) {
    case "ready": {
      if (typeof value.datasetId !== "string" || !HEX64.test(value.datasetId) || typeof value.initMs !== "number" || !Number.isFinite(value.initMs)
        || !(value.capabilitiesJson === null || typeof value.capabilitiesJson === "string")) return null;
      const catalog = value.catalog ?? null;
      if (catalog !== null && !isDataCatalog(catalog)) return null;
      return { type: "ready", datasetId: value.datasetId, initMs: value.initMs, capabilitiesJson: value.capabilitiesJson, catalog };
    }
    case "progress":
    case "result":
      return job && typeof value.resultJson === "string" ? value as unknown as DeckWorkerProgress | DeckWorkerResult : null;
    case "failed":
      return (DECK_WORKER_FAILURE_CODES as readonly unknown[]).includes(value.code) && typeof value.message === "string"
        && (value.jobId === undefined || typeof value.jobId === "string") && (value.inputRevision === undefined || Number.isSafeInteger(value.inputRevision))
        ? value as unknown as DeckWorkerFailed : null;
    default:
      return null;
  }
}

/** A job's reply carries its `jobId` and `inputRevision`; any other reply is stale and is dropped. */
export function isCurrentDeckWorkerReply(job: DeckJobBinding, event: DeckWorkerEvent): boolean {
  if (event.type === "progress" || event.type === "result") return event.jobId === job.jobId && event.inputRevision === job.inputRevision;
  if (event.type === "failed") return event.jobId === job.jobId && (event.inputRevision === undefined || event.inputRevision === job.inputRevision);
  return false;
}
