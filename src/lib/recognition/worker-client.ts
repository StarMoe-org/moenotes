import { sameRecognitionBinding, validateRecognitionResult, type RecognitionBinding, type RecognitionConfiguration, type RecognitionResult, type RecognitionSource } from "./protocol";

export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null; onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (value: unknown, transfers: Transferable[]) => void; terminate: () => void;
}
export interface RecognitionJob {
  binding: RecognitionBinding; source: RecognitionSource; configuration: RecognitionConfiguration;
  image: { width: number; height: number; rgba: ArrayBuffer; sourceId: string };
  timeLimitMs: number; isCurrent: () => boolean; onProgress: (phase: string, elapsedMs: number) => void;
}

/** Main-thread monotonic deadline can terminate even an atomic WASM call. */
export class RecognitionWorkerClient {
  private active: { worker: WorkerLike; binding: RecognitionBinding; finish: (result: RecognitionResult) => void;
    empty: (status: RecognitionResult["status"], error?: string) => RecognitionResult } | null = null;
  constructor(private readonly factory: (url: string) => WorkerLike = url => new Worker(url),
    private readonly clock: () => number = () => performance.timeOrigin + performance.now()) {}
  cancel(status: "cancelled" | "stale" = "cancelled"): void {
    const job = this.active;
    if (!job) return;
    try { job.worker.postMessage({ type: "cancel", binding: job.binding }, []); }
    catch { /* Terminating the Worker also cancels a runtime that can no longer accept messages. */ }
    finally { job.finish(job.empty(status)); }
  }
  run(job: RecognitionJob): Promise<RecognitionResult> {
    this.cancel();
    if (!Number.isFinite(job.timeLimitMs) || job.timeLimitMs <= 0 || job.timeLimitMs > 120000) throw new Error("Invalid recognition budget");
    const started = this.clock(), deadline = started + job.timeLimitMs;
    return new Promise(resolve => {
      const base = typeof location === "undefined" ? undefined : location.href;
      const worker = this.factory(new URL(job.configuration.workerUrl, base).href);
      let settled = false;
      const finish = (result: RecognitionResult) => {
        if (settled) return;
        settled = true; clearTimeout(timer); worker.terminate();
        if (this.active?.worker === worker) this.active = null;
        resolve(result);
      };
      const empty = (status: RecognitionResult["status"], error?: string): RecognitionResult => ({ type: "result", binding: job.binding, status,
        cards: [], unidentified: [], sourceId: job.image.sourceId, elapsedMs: this.clock() - started, ...(error ? { error } : {}) });
      const timer = setTimeout(() => finish(empty("timeLimit")), job.timeLimitMs);
      this.active = { worker, binding: job.binding, finish, empty };
      worker.onmessage = event => {
        if (settled || this.active?.worker !== worker || !sameRecognitionBinding(event.data?.binding, job.binding)) return;
        if (!job.isCurrent()) { finish(empty("stale")); return; }
        if (this.clock() >= deadline) { finish(empty("timeLimit")); return; }
        if (event.data.type === "progress") { if (typeof event.data.phase === "string" && Number.isFinite(event.data.elapsedMs)) job.onProgress(event.data.phase, event.data.elapsedMs); }
        else if (event.data.type === "result") {
          try { finish(validateRecognitionResult(event.data, job.binding, job.source, job.image.sourceId)); }
          catch (error) { finish(empty("failed", error instanceof Error ? error.message : "Recognition source differs")); }
        }
      };
      worker.onerror = event => finish(empty("failed", event.message));
      try {
        const configuration = job.configuration;
        // The Worker matches tiles only against the selected server's cards that the gallery holds.
        const cards = job.source.gallery?.compatibleCardKeys ?? job.source.cards.map(card => `${card.kind}:${card.id}`);
        worker.postMessage({ type: "recognize", binding: job.binding, cards: [...cards],
          configuration: { galleryUrl: new URL(configuration.galleryUrl, base).href, gallerySha256: configuration.gallerySha256,
            modelsUrl: new URL(configuration.modelsUrl, base).href, modelsSha256: configuration.modelsSha256 },
          image: job.image, budget: { timeLimitMs: job.timeLimitMs, deadlineEpochMs: deadline } }, [job.image.rgba]);
      } catch { finish(empty("failed", "Recognition input unavailable")); }
    });
  }
}
