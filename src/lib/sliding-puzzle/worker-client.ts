import { parsePuzzleBoard, type PuzzleBoard } from "./model";
import { PUZZLE_WORKER_PROTOCOL, validatePuzzleWorkerReply, type PuzzleJobResult, type PuzzleTaskBinding, type PuzzleWorkerResult } from "./worker-protocol";
import { preparePuzzleMatch, validatePuzzleMatchReply, type PuzzleMatchContext, type PuzzleMatchWorkerResult } from "./match-protocol";
import { preparePuzzleDetect, validatePuzzleDetectReply, type PuzzleDetectContext, type PuzzleDetectInput, type PuzzleDetectWorkerResult } from "./detect-protocol";
import type { PuzzleFragmentMatchInput } from "./matching";
import { PuzzleWorkerSession, type PuzzleTaskJob, type PuzzleTaskOutcome, type PuzzleWorkerRuntime } from "./worker-session";
export type { PuzzleWorkerPort } from "./worker-session";

export interface PuzzleSolveJob extends PuzzleTaskJob<{ readonly size: unknown; readonly cells: unknown }> {}
export interface PuzzleMatchJob extends PuzzleTaskJob<PuzzleFragmentMatchInput> {}
export interface PuzzleDetectJob extends PuzzleTaskJob<PuzzleDetectInput> {}
export interface PuzzleJobOutcome { readonly binding: PuzzleTaskBinding; readonly result: PuzzleJobResult; readonly elapsedMs: number }
export type PuzzleMatchOutcome = PuzzleTaskOutcome<PuzzleMatchWorkerResult>;
export type PuzzleDetectOutcome = PuzzleTaskOutcome<PuzzleDetectWorkerResult>;

/** Shared task lifecycle, separate typed result validators, and exactly one active task per client. */
export class PuzzleWorkerClient {
  private readonly solver: PuzzleWorkerSession<PuzzleSolveJob["input"], PuzzleBoard, PuzzleWorkerResult>;
  private readonly matcher: PuzzleWorkerSession<PuzzleFragmentMatchInput, PuzzleMatchContext, PuzzleMatchWorkerResult>;
  private readonly detector: PuzzleWorkerSession<PuzzleDetectInput, PuzzleDetectContext, PuzzleDetectWorkerResult>;
  constructor(overrides: Partial<PuzzleWorkerRuntime> = {}) {
    const create = () => new Worker(new URL("./puzzle.worker.ts", import.meta.url), { type: "module", name: "sliding-puzzle" });
    this.solver = new PuzzleWorkerSession({
      prepare: input => { const parsed = parsePuzzleBoard(input.size, input.cells); return parsed.ok
        ? { context: parsed.board, payload: { size: parsed.board.size, cells: parsed.board.cells } }
        : { result: Object.freeze({ status: "invalid", issue: Object.freeze({ ...parsed.issue }) }) }; },
      request: (requestId, binding, input, timeLimitMs) => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "solve", requestId, binding, input, timeLimitMs }),
      validate: validatePuzzleWorkerReply, reuse: result => result.status === "solved" || result.status === "unsolvable",
    }, create, overrides);
    this.matcher = new PuzzleWorkerSession({
      prepare: input => { try { const prepared = preparePuzzleMatch(input); return { context: prepared.context, payload: prepared.input, transfer: prepared.transfer }; }
        catch { return { result: Object.freeze({ status: "invalid" }) }; } },
      request: (requestId, binding, input, timeLimitMs) => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "match", requestId, binding, input, timeLimitMs }),
      validate: validatePuzzleMatchReply, reuse: result => result.status === "review",
    }, create, overrides);
    this.detector = new PuzzleWorkerSession({
      prepare: input => { try { const prepared = preparePuzzleDetect(input); return { context: prepared.context, payload: prepared.input, transfer: prepared.transfer }; }
        catch { return { result: Object.freeze({ status: "invalid" }) }; } },
      request: (requestId, binding, input, timeLimitMs) => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "detect", requestId, binding, input, timeLimitMs }),
      validate: validatePuzzleDetectReply, reuse: () => false,
    }, create, overrides);
  }
  get running(): boolean { return this.solver.running || this.matcher.running || this.detector.running; }
  run(job: PuzzleSolveJob): Promise<PuzzleJobOutcome> { this.matcher.cancel("stale"); this.detector.cancel("stale"); return this.solver.run(job); }
  match(job: PuzzleMatchJob): Promise<PuzzleMatchOutcome> { this.solver.cancel("stale"); this.detector.cancel("stale"); return this.matcher.run(job); }
  detect(job: PuzzleDetectJob): Promise<PuzzleDetectOutcome> { this.solver.cancel("stale"); this.matcher.cancel("stale"); return this.detector.run(job); }
  cancel(status: "cancelled" | "stale" = "cancelled"): void { this.solver.cancel(status); this.matcher.cancel(status); this.detector.cancel(status); }
  dispose(): void { this.solver.dispose(); this.matcher.dispose(); this.detector.dispose(); }
}
