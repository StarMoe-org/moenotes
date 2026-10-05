import { createBox, type CardBox } from "@/lib/box/model";
import { RecognitionError } from "./errors";
import { mergeRecognizedBox, observedScreenshotBox, sameRecognitionBinding, validateRecognitionResult,
  type RecognitionBinding, type RecognitionResult, type RecognitionSource } from "./protocol";

export type RecognitionFileStatus = "queued" | "preparing" | "running" | RecognitionResult["status"];
export interface RecognitionBatchFile { key: string; name: string }
export interface RecognitionFileSnapshot extends RecognitionBatchFile {
  status: RecognitionFileStatus; elapsedMs: number;
  sourceId?: string; duplicateOf?: string; width?: number; height?: number;
  binding?: RecognitionBinding; result?: RecognitionResult; draft?: CardBox; error?: string; phase?: string;
  startedAt?: number; deadline?: number;
  attempts?: RecognitionFileAttempt[];
}
export type RecognitionFileAttempt = Omit<RecognitionFileSnapshot, "key" | "name" | "draft" | "attempts">;
export interface RecognitionBatchSnapshot {
  batchId: string; status: "active" | "finished" | "cancelled" | "stale"; files: RecognitionFileSnapshot[];
}
export interface RecognitionBatchOptions {
  batchId: string; inputRevision: string; source: RecognitionSource; manifestSha256: string;
  galleryId?: string; at: number; files: readonly RecognitionBatchFile[]; clock?: () => number;
}
export interface RecognitionFileBudget { startedAt: number; deadline: number }
export interface RecognitionFilePreparation extends RecognitionFileBudget { jobId: string }
export interface RecognitionFileInput extends RecognitionFileBudget {
  jobId: string; sourceId: string; width: number; height: number;
}
const activeFile = (file: RecognitionFileSnapshot): boolean => ["queued", "preparing", "running"].includes(file.status);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** One selected catalogue/revision, separate image jobs. All times use the same monotonic ms clock.
 * `at` is the single evidence timestamp: completion order cannot establish screenshot chronology.
 * Pixels, decoding, workers, previews and persistence belong to the caller, not this pure coordinator. */
export class RecognitionBatch {
  private readonly files = new Map<string, RecognitionFileSnapshot>();
  private readonly jobs = new Set<string>();
  private readonly source: RecognitionSource;
  private readonly galleryId: string;
  private readonly clock: () => number;
  private closed: "cancelled" | "stale" | null = null;

  constructor(private readonly options: RecognitionBatchOptions) {
    this.galleryId = options.galleryId ?? options.source.gallery?.galleryId ?? "";
    if (!text(options.batchId) || !text(options.inputRevision) || !text(options.source.sourceId)
      || !/^[a-f0-9]{64}$/.test(options.manifestSha256) || !/^[a-f0-9]{64}$/.test(this.galleryId)
      || options.source.gallery && options.source.gallery.galleryId !== this.galleryId
      || !Number.isSafeInteger(options.at) || options.at < 0) throw new Error("Invalid recognition batch context");
    this.source = structuredClone(options.source);
    this.options = { ...options, source: this.source, files: [] };
    this.clock = options.clock ?? (() => performance.now());
    this.addFiles(options.files);
    if (!this.files.size) throw new Error("Recognition batch has no images");
  }

  addFiles(files: readonly RecognitionBatchFile[]): void {
    if (this.closed) throw new Error("Recognition batch is closed");
    const keys = new Set(this.files.keys());
    for (const file of files) {
      if (!text(file.key) || typeof file.name !== "string" || keys.has(file.key)) throw new Error("Duplicate or invalid recognition image key");
      keys.add(file.key);
    }
    for (const file of files) this.files.set(file.key, { key: file.key, name: file.name, status: "queued", elapsedMs: 0 });
  }

  /** Optional decode-stage status. begin() must retain this exact budget rather than restart it. */
  prepare(key: string, budget: RecognitionFilePreparation): RecognitionBinding {
    const file = this.file(key);
    if (this.closed || file.status !== "queued") throw new Error("Recognition image is not queued");
    this.checkBudget(budget);
    if (!text(budget.jobId) || this.jobs.has(budget.jobId)) throw new Error("Invalid recognition image binding");
    const binding = this.binding(budget.jobId);
    this.jobs.add(budget.jobId);
    Object.assign(file, { startedAt: budget.startedAt, deadline: budget.deadline, binding, status: "preparing" });
    if (this.clock() >= budget.deadline) { this.stop(file, "timeLimit"); throw new RecognitionError("timeLimit"); }
    return { ...binding };
  }

  begin(key: string, input: RecognitionFileInput): RecognitionBinding {
    const file = this.file(key);
    if (this.closed || !["queued", "preparing"].includes(file.status)) throw new Error("Recognition image cannot begin");
    this.checkBudget(input);
    if (file.startedAt !== undefined && (file.startedAt !== input.startedAt || file.deadline !== input.deadline)) throw new Error("Recognition image budget changed");
    if (file.binding && file.binding.jobId !== input.jobId) throw new Error("Recognition image job changed");
    if (!text(input.jobId) || this.jobs.has(input.jobId) && file.binding?.jobId !== input.jobId || !/^[a-f0-9]{64}$/.test(input.sourceId)
      || !Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width < 1 || input.height < 1
      || input.width * input.height > 24_000_000) throw new Error("Invalid recognition image binding");
    const binding = this.binding(input.jobId);
    const duplicate = [...this.files.values()].find(other => other.key !== key && other.sourceId === input.sourceId);
    Object.assign(file, { sourceId: input.sourceId, width: input.width, height: input.height,
      startedAt: input.startedAt, deadline: input.deadline, binding, status: "running" });
    if (duplicate) file.duplicateOf = duplicate.key;
    this.jobs.add(input.jobId);
    if (this.clock() >= input.deadline) { this.stop(file, "timeLimit"); throw new RecognitionError("timeLimit"); }
    return { ...binding };
  }

  /** The worker owns its deadline check; returning false for an expired budget would mislabel it stale. */
  isCurrent(key: string, binding: RecognitionBinding): boolean {
    const file = this.files.get(key);
    return !this.closed && !!file && ["preparing", "running"].includes(file.status) && sameRecognitionBinding(file.binding, binding);
  }

  progress(key: string, binding: RecognitionBinding, phase: string, now = this.clock()): boolean {
    if (!this.isCurrent(key, binding)) return false;
    const file = this.file(key);
    if (now >= file.deadline!) { this.stop(file, "timeLimit", now); return false; }
    file.elapsedMs = this.elapsed(file, now); file.phase = phase;
    return true;
  }

  /** Only a complete, matching, unexpired reply creates evidence. Terminal/foreign replies are inert. */
  finish(key: string, value: unknown, now = this.clock()): boolean {
    const file = this.file(key), reply = value as RecognitionResult | null;
    if (this.closed || file.status !== "running" || !sameRecognitionBinding(reply?.binding, file.binding!)) return false;
    if (now >= file.deadline!) { this.stop(file, "timeLimit", now); return false; }
    file.elapsedMs = this.elapsed(file, now);
    try {
      const result = validateRecognitionResult(value, file.binding!, this.source, file.sourceId!);
      if (result.status === "complete") {
        file.draft = observedScreenshotBox(result, this.source, this.options.manifestSha256, this.options.at, [file.width!, file.height!]);
        file.result = structuredClone(result); file.status = "complete";
        return true;
      }
      file.status = result.status;
      file.result = structuredClone({ ...result, cards: [], unidentified: [] });
      if (result.error) file.error = result.error;
    } catch (error) {
      file.status = "failed"; file.error = error instanceof Error ? error.message : "Invalid recognition reply";
    }
    return false;
  }

  fail(key: string, reason: string, binding?: RecognitionBinding, now = this.clock()): boolean {
    const file = this.file(key);
    if (this.closed || !activeFile(file) || binding && !sameRecognitionBinding(file.binding, binding)) return false;
    this.stop(file, reason === "timeLimit" ? "timeLimit" : "failed", now); file.error = reason;
    return true;
  }

  cancelFile(key: string, now = this.clock()): void {
    const file = this.file(key);
    if (activeFile(file)) this.stop(file, "cancelled", now);
  }

  /** Explicit retry starts a new job/budget while retaining the previous unsuccessful attempt. */
  retryFile(key: string): void {
    const file = this.file(key);
    if (this.closed || !["failed", "timeLimit", "cancelled"].includes(file.status)) throw new Error("Recognition image cannot retry");
    const attempt: RecognitionFileAttempt = { status: file.status, elapsedMs: file.elapsedMs };
    for (const field of ["sourceId", "duplicateOf", "width", "height", "binding", "result", "error", "phase", "startedAt", "deadline"] as const)
      if (file[field] !== undefined) Object.assign(attempt, { [field]: structuredClone(file[field]) });
    this.files.set(key, { key, name: file.name, status: "queued", elapsedMs: 0,
      attempts: [...structuredClone(file.attempts ?? []), attempt] });
  }

  /** Cancellation keeps completed pictures available for review; it cannot resume queued jobs. */
  cancel(now = this.clock()): void {
    if (this.closed === "stale") return;
    this.closed = "cancelled";
    for (const file of this.files.values()) if (activeFile(file)) this.stop(file, "cancelled", now);
  }

  /** A changed account/catalogue/revision permanently invalidates this batch's save context. */
  invalidate(now = this.clock()): void {
    this.closed = "stale";
    for (const file of this.files.values()) if (activeFile(file)) this.stop(file, "stale", now);
  }

  snapshot(now = this.clock()): RecognitionBatchSnapshot {
    const files = [...this.files.values()].map(file => ({ ...file,
      elapsedMs: activeFile(file) ? this.elapsed(file, now) : file.elapsedMs }));
    return structuredClone({ batchId: this.options.batchId,
      status: this.closed ?? (files.some(activeFile) ? "active" : "finished"), files });
  }

  /** Failed/cancelled pictures cannot remove successful ones. Persistence performs one merge/save. */
  draft(): CardBox {
    if (this.closed === "stale") throw new RecognitionError("catalogBinding", "recognition batch input changed");
    let draft = createBox(this.source.server, `scan-batch-${this.options.batchId}`, this.options.at);
    for (const file of this.files.values()) if (file.status === "complete" && file.draft) draft = mergeRecognizedBox(draft, file.draft, this.options.at);
    return draft;
  }

  private file(key: string): RecognitionFileSnapshot {
    const file = this.files.get(key);
    if (!file) throw new Error("Unknown recognition image key");
    return file;
  }
  private binding(jobId: string): RecognitionBinding {
    return { jobId, inputRevision: this.options.inputRevision, datasetId: this.source.sourceId, galleryId: this.galleryId };
  }
  private checkBudget(budget: RecognitionFileBudget): void {
    if (!Number.isFinite(budget.startedAt) || budget.startedAt < 0 || !Number.isFinite(budget.deadline)
      || budget.deadline <= budget.startedAt || budget.deadline - budget.startedAt > 120000) throw new Error("Invalid recognition image budget");
  }
  private elapsed(file: RecognitionFileSnapshot, now: number): number {
    if (!Number.isFinite(now) || file.startedAt !== undefined && now < file.startedAt) throw new Error("Recognition clock differs");
    return file.startedAt === undefined ? 0 : now - file.startedAt;
  }
  private stop(file: RecognitionFileSnapshot, status: RecognitionFileStatus, now = this.clock()): void {
    file.elapsedMs = this.elapsed(file, now); file.status = status;
  }
}
