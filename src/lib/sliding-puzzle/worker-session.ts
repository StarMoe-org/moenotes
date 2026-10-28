import { isPuzzleRecord, parsePuzzleBinding, samePuzzleBinding, validPuzzleBudget, type PuzzleTaskBinding, type PuzzleWorkerFailureCode } from "./worker-protocol";

export interface PuzzleWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}
export interface PuzzleWorkerRuntime {
  createWorker: () => PuzzleWorkerPort;
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
}
export interface PuzzleTaskJob<I> { readonly binding: PuzzleTaskBinding; readonly input: I; readonly timeLimitMs: number; readonly isCurrent: () => boolean }
export type PuzzleTaskStop = { readonly status: "cancelled" | "stale" | "timeLimit" } | { readonly status: "failed"; readonly code: PuzzleWorkerFailureCode };
export interface PuzzleTaskOutcome<R> { readonly binding: PuzzleTaskBinding; readonly result: R | PuzzleTaskStop; readonly elapsedMs: number }
export interface PreparedPuzzleTask<C> { context: C; payload: unknown; transfer?: Transferable[] }
interface TaskOptions<I, C, R> {
  prepare: (input: I) => PreparedPuzzleTask<C> | { result: R };
  request: (id: number, binding: PuzzleTaskBinding, payload: unknown, budget: number) => unknown;
  validate: (reply: unknown, id: number, binding: PuzzleTaskBinding, context: C) => R;
  reuse: (result: R) => boolean;
}
interface Active<C, R> {
  binding: PuzzleTaskBinding; id: number; prepared: PreparedPuzzleTask<C>; started: number; deadline: number;
  isCurrent: () => boolean; worker: PuzzleWorkerPort | null; cancelTimer: () => void; resolve: (result: PuzzleTaskOutcome<R>) => void;
}

/** Shared lifecycle for solve and match tasks: deadlines and input changes also win over late errors. */
export class PuzzleWorkerSession<I, C, R> {
  private readonly runtime: PuzzleWorkerRuntime;
  private worker: PuzzleWorkerPort | null = null;
  private active: Active<C, R> | null = null;
  private sequence = 0;
  constructor(private readonly options: TaskOptions<I, C, R>, createWorker: () => PuzzleWorkerPort, overrides: Partial<PuzzleWorkerRuntime> = {}) {
    this.runtime = { createWorker, now: () => performance.now(), schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); }, ...overrides };
  }
  get running(): boolean { return this.active !== null; }
  run(job: PuzzleTaskJob<I>): Promise<PuzzleTaskOutcome<R>> {
    const started = this.runtime.now(), binding = parsePuzzleBinding(job.binding);
    if (!binding || !validPuzzleBudget(job.timeLimitMs) || typeof job.isCurrent !== "function") throw new RangeError("Invalid puzzle job configuration");
    this.cancel("stale");
    const prepared = this.options.prepare(job.input);
    if ("result" in prepared) return Promise.resolve(Object.freeze({ binding, result: prepared.result, elapsedMs: Math.max(0, this.runtime.now() - started) }));
    return new Promise(resolve => {
      const active: Active<C, R> = { binding, id: ++this.sequence, prepared, started, deadline: started + job.timeLimitMs,
        isCurrent: job.isCurrent, worker: null, cancelTimer: () => undefined, resolve };
      this.active = active;
      if (!this.admit(active)) return;
      const arm = () => { active.cancelTimer = this.runtime.schedule(() => {
        if (this.admit(active)) arm(); // A browser timer may fire just before its fractional deadline.
      }, Math.max(1, active.deadline - this.runtime.now())); };
      arm();
      try {
        if (!this.worker) {
          const worker = this.runtime.createWorker(); this.worker = worker;
          worker.onmessage = event => this.receive(worker, event.data);
          worker.onerror = event => { event.preventDefault?.(); this.fail(worker, "worker"); };
          worker.onmessageerror = () => this.fail(worker, "message");
        }
        active.worker = this.worker;
      } catch { this.reject(active, "worker"); return; }
      if (!this.admit(active)) return;
      try { active.worker.postMessage(this.options.request(active.id, binding, prepared.payload, job.timeLimitMs), prepared.transfer); }
      catch { this.reject(active, "message"); }
    });
  }
  cancel(status: "cancelled" | "stale" = "cancelled"): void { if (this.active) this.finish(this.active, { status }); }
  dispose(): void { this.cancel(); if (this.worker) this.discard(this.worker); }
  private admit(active: Active<C, R>): boolean {
    if (this.active !== active) return false;
    try { if (!active.isCurrent()) { this.finish(active, { status: "stale" }); return false; } }
    catch { this.finish(active, { status: "failed", code: "scope" }); return false; }
    if (this.active !== active) return false;
    if (this.runtime.now() >= active.deadline) { this.finish(active, { status: "timeLimit" }); return false; }
    return true;
  }
  private receive(worker: PuzzleWorkerPort, reply: unknown): void {
    const active = this.active;
    if (!active || this.worker !== worker || active.worker !== worker) return;
    if (isPuzzleRecord(reply)) {
      const binding = parsePuzzleBinding(reply.binding);
      if (binding && !samePuzzleBinding(binding, active.binding)) return;
      if (Number.isSafeInteger(reply.requestId) && reply.requestId !== active.id) return;
    }
    if (!this.admit(active)) return;
    let result: R;
    try { result = this.options.validate(reply, active.id, active.binding, active.prepared.context); }
    catch { this.reject(active, "protocol"); return; }
    if (this.admit(active)) this.finish(active, result, this.options.reuse(result));
  }
  private fail(worker: PuzzleWorkerPort, code: PuzzleWorkerFailureCode): void {
    if (this.active?.worker === worker) this.reject(this.active, code);
    else if (this.worker === worker) this.discard(worker);
  }
  private reject(active: Active<C, R>, code: PuzzleWorkerFailureCode): void { if (this.admit(active)) this.finish(active, { status: "failed", code }); }
  private finish(active: Active<C, R>, result: R | PuzzleTaskStop, reuse = false): void {
    if (this.active !== active) return;
    this.active = null; active.cancelTimer();
    if (!reuse && active.worker) this.discard(active.worker);
    active.resolve(Object.freeze({ binding: active.binding, result: Object.freeze(result), elapsedMs: Math.max(0, this.runtime.now() - active.started) }));
  }
  private discard(worker: PuzzleWorkerPort): void {
    if (this.worker === worker) this.worker = null;
    worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
    try { worker.terminate(); } catch { /* Cleanup cannot prevent settlement. */ }
  }
}
