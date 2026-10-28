import { parsePuzzleBoard } from "./model";
import { solvePuzzle } from "./solver";
import { MAX_PUZZLE_MOVES, PUZZLE_WORKER_PROTOCOL, readPuzzleWorkerRequest, type PuzzleWorkerReply, type PuzzleWorkerResult } from "./worker-protocol";

interface HandlerDependencies { solve: typeof solvePuzzle; now: () => number }

/** Synchronous computation is interruptible by terminating the owning Worker, not by queuing a cancel message. */
export function createPuzzleWorkerHandler(post: (reply: PuzzleWorkerReply) => void, overrides: Partial<HandlerDependencies> = {}) {
  const { solve, now } = { solve: solvePuzzle, now: () => performance.now(), ...overrides };
  return (data: unknown): void => {
    const request = readPuzzleWorkerRequest(data);
    if (!request) return;
    const started = now();
    let result: PuzzleWorkerResult;
    try {
      const input = parsePuzzleBoard(request.input.size, request.input.cells);
      if (!input.ok) result = { status: "invalid", issue: Object.freeze({ ...input.issue }) };
      else {
        const answer = solve(input.board);
        if (now() - started >= request.timeLimitMs) result = { status: "timeLimit" };
        else if (answer.status === "failed") result = { status: "failed", code: "solver", reason: answer.reason };
        else if (answer.status === "solved" && answer.steps > MAX_PUZZLE_MOVES) result = { status: "failed", code: "protocol" };
        else result = answer;
      }
    } catch { result = { status: "failed", code: "runtime" }; }
    post({ protocol: PUZZLE_WORKER_PROTOCOL, type: "result", requestId: request.requestId, binding: request.binding, result });
  };
}
