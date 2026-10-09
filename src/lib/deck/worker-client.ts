import { assetConfig } from "@/config/assets";
import type { DeckSolverRuntime } from "./runtime-source";
import { deckWorkerInit, isCurrentDeckWorkerReply, parseDeckWorkerEvent, type DeckDataCatalog, type DeckWorkerFailureCode, type DeckWorkerInit, type DeckWorkerRun } from "./worker-protocol";

/** The part of `Worker` the client uses. */
export interface DeckWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface DeckWorkerReadyInfo { datasetId: string; initMs: number; capabilitiesJson: string | null; catalog: DeckDataCatalog | null }
export type DeckWorkerPrepareOutcome =
  | ({ status: "ready" } & DeckWorkerReadyInfo)
  | { status: "failed"; code: DeckWorkerFailureCode; message: string }
  /** The Worker was stopped or replaced before it was ready. */
  | { status: "stopped" };

export interface DeckRecommendJob {
  runtime: DeckSolverRuntime;
  jobId: string;
  inputRevision: number;
  accountJson: string;
  requestJson: string;
  progressIntervalMs: number;
  /** The Worker is ready and the run has been sent. */
  onReady?: (ready: DeckWorkerReadyInfo) => void;
  /** Each intermediate result of this job, a complete result on its own; stale ones never arrive here. */
  onProgress?: (resultJson: string) => void;
}

interface OutcomeBinding { jobId: string; inputRevision: number; datasetId: string | null }
/**
 * How a job ended. `stopped` (by `stop()`) and `superseded` (by a newer `run()`) carry the last intermediate result,
 * or `null` when none arrived; a page that stops a job shows that result as the answer.
 */
export type DeckRecommendOutcome =
  | (OutcomeBinding & { status: "complete"; datasetId: string; resultJson: string })
  | (OutcomeBinding & { status: "stopped" | "superseded"; resultJson: string | null })
  | (OutcomeBinding & { status: "failed"; code: DeckWorkerFailureCode; message: string; resultJson: string | null });

interface Slot {
  worker: DeckWorkerPort;
  key: string;
  ready: Promise<DeckWorkerPrepareOutcome>;
  settle: (outcome: DeckWorkerPrepareOutcome) => void;
  info: DeckWorkerReadyInfo | null;
}
interface ActiveJob {
  job: DeckRecommendJob;
  slot: Slot | null;
  posted: boolean;
  lastProgress: string | null;
  datasetId: string | null;
  resolve: (outcome: DeckRecommendOutcome) => void;
}

const detached: DeckWorkerPort = { onmessage: null, onerror: null, postMessage: () => undefined, terminate: () => undefined };
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

function invalidJob(job: DeckRecommendJob): string | null {
  if (!job || typeof job !== "object" || !job.runtime) return "Missing runtime";
  if (typeof job.jobId !== "string" || !job.jobId || !Number.isSafeInteger(job.inputRevision)) return "Invalid job binding";
  if (typeof job.accountJson !== "string" || typeof job.requestJson !== "string") return "Solver input must be JSON text";
  if (!Number.isFinite(job.progressIntervalMs) || job.progressIntervalMs < 0) return "Invalid progressIntervalMs";
  return null;
}

/**
 * One deck solver Worker at a time: created on first use, initialized once per runtime, reused across runs. A running
 * recommendation is synchronous inside the Worker, so stopping or replacing it terminates the Worker; the next run
 * creates and initializes a new one. A Worker that failed is never reused. Replies of other jobs or of a terminated
 * Worker are dropped.
 */
export class DeckWorkerClient {
  private slot: Slot | null = null;
  private active: ActiveJob | null = null;

  constructor(
    private readonly factory: (url: string) => DeckWorkerPort = (url) => new Worker(url),
    private readonly workerUrl: string = assetConfig.deck.workerUrl,
  ) {}

  /** A job is waiting for the Worker or running. */
  get running(): boolean { return this.active !== null; }

  /** Create and initialize the Worker of a runtime ahead of the first run. */
  prepare(runtime: DeckSolverRuntime): Promise<DeckWorkerPrepareOutcome> {
    return this.slotFor(deckWorkerInit(runtime)).ready;
  }

  /** Run one recommendation; a job still waiting or running ends as `superseded`. */
  run(job: DeckRecommendJob): Promise<DeckRecommendOutcome> {
    this.end("superseded");
    return new Promise((resolve) => {
      const active: ActiveJob = { job, slot: null, posted: false, lastProgress: null, datasetId: null, resolve };
      this.active = active;
      const problem = invalidJob(job);
      if (problem) { this.finish(active, { status: "failed", code: "protocol", message: problem, ...this.binding(active), resultJson: null }); return; }
      const slot = this.slotFor(deckWorkerInit(job.runtime));
      active.slot = slot;
      void slot.ready.then((ready) => {
        if (this.active !== active) return;
        if (ready.status !== "ready") {
          this.finish(active, { status: "failed", ...(ready.status === "failed" ? { code: ready.code, message: ready.message } : { code: "init", message: "The Worker stopped before it was ready" }),
            ...this.binding(active), resultJson: null });
          return;
        }
        active.datasetId = ready.datasetId;
        const run: DeckWorkerRun = { type: "run", jobId: job.jobId, inputRevision: job.inputRevision, accountJson: job.accountJson,
          requestJson: job.requestJson, progressIntervalMs: job.progressIntervalMs };
        try { slot.worker.postMessage(run); active.posted = true; }
        catch (error) { this.fail(slot, "protocol", describe(error)); return; }
        job.onReady?.({ datasetId: ready.datasetId, initMs: ready.initMs, capabilitiesJson: ready.capabilitiesJson, catalog: ready.catalog });
      });
    });
  }

  /** End the current job as `stopped`, with its last intermediate result. */
  stop(): void { this.end("stopped"); }

  /** Stop the current job and terminate the Worker. */
  dispose(): void {
    this.end("stopped");
    if (this.slot) this.discard(this.slot);
  }

  private binding(active: ActiveJob): OutcomeBinding {
    return { jobId: active.job.jobId, inputRevision: active.job.inputRevision, datasetId: active.datasetId };
  }

  private finish(active: ActiveJob, outcome: DeckRecommendOutcome): void {
    if (this.active !== active) return;
    this.active = null;
    active.resolve(outcome);
  }

  private end(status: "stopped" | "superseded"): void {
    const active = this.active;
    if (!active) return;
    // A recommendation in progress cannot be interrupted; a Worker still initializing can serve the next job.
    if (active.posted && active.slot) this.discard(active.slot);
    this.finish(active, { status, ...this.binding(active), resultJson: active.lastProgress });
  }

  private slotFor(init: DeckWorkerInit): Slot {
    const key = JSON.stringify(init);
    if (this.slot?.key === key) return this.slot;
    if (this.slot) {
      if (this.active && this.active.slot === this.slot) this.end("superseded");
      this.discard(this.slot);
    }
    let settle!: (outcome: DeckWorkerPrepareOutcome) => void;
    const ready = new Promise<DeckWorkerPrepareOutcome>((resolve) => { settle = resolve; });
    let worker: DeckWorkerPort;
    try { worker = this.factory(new URL(this.workerUrl, typeof location === "undefined" ? undefined : location.href).href); }
    catch (error) {
      settle({ status: "failed", code: "init", message: `Worker: ${describe(error)}` });
      return { worker: detached, key, ready, settle: () => undefined, info: null };
    }
    let settled = false;
    const slot: Slot = { worker, key, ready, info: null, settle: (outcome) => { if (!settled) { settled = true; settle(outcome); } } };
    this.slot = slot;
    worker.onmessage = (event) => this.receive(slot, event.data);
    worker.onerror = (event) => {
      event.preventDefault?.();
      this.fail(slot, slot.info ? "runtime" : "init", event.message || "Worker error");
    };
    try { worker.postMessage(init); }
    catch (error) { this.fail(slot, "init", describe(error)); }
    return slot;
  }

  private receive(slot: Slot, data: unknown): void {
    if (slot !== this.slot) return;
    const event = parseDeckWorkerEvent(data);
    if (!event) return;
    const active = this.active && this.active.slot === slot && this.active.posted ? this.active : null;
    switch (event.type) {
      case "ready":
        if (slot.info) return;
        slot.info = { datasetId: event.datasetId, initMs: event.initMs, capabilitiesJson: event.capabilitiesJson, catalog: event.catalog ?? null };
        slot.settle({ status: "ready", ...slot.info });
        return;
      case "progress":
        if (!active || !isCurrentDeckWorkerReply(active.job, event)) return;
        active.lastProgress = event.resultJson;
        active.job.onProgress?.(event.resultJson);
        return;
      case "result":
        if (!active || !isCurrentDeckWorkerReply(active.job, event)) return;
        this.finish(active, { status: "complete", ...this.binding(active), datasetId: active.datasetId!, resultJson: event.resultJson });
        return;
      case "failed":
        if (event.jobId !== undefined && (!active || !isCurrentDeckWorkerReply(active.job, event))) return;
        this.fail(slot, event.code, event.message);
    }
  }

  /** A failed Worker is terminated; its job, if any, fails with the same code. */
  private fail(slot: Slot, code: DeckWorkerFailureCode, message: string): void {
    const active = this.active && this.active.slot === slot ? this.active : null;
    slot.settle({ status: "failed", code, message });
    this.discard(slot);
    if (active) this.finish(active, { status: "failed", code, message, ...this.binding(active), resultJson: active.lastProgress });
  }

  private discard(slot: Slot): void {
    slot.settle({ status: "stopped" });
    slot.worker.onmessage = null;
    slot.worker.onerror = null;
    slot.worker.terminate();
    if (this.slot === slot) this.slot = null;
  }
}
