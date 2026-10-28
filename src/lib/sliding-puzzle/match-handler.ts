import { matchPuzzleFragments } from "./matching";
import { preparePuzzleMatch, readPuzzleMatchRequest, type PuzzleMatchReply, type PuzzleMatchWorkerResult } from "./match-protocol";
import { PUZZLE_WORKER_PROTOCOL } from "./worker-protocol";

export function createPuzzleMatchHandler(post: (reply: PuzzleMatchReply) => void, overrides: Partial<{ match: typeof matchPuzzleFragments; now: () => number }> = {}) {
  const { match, now } = { match: matchPuzzleFragments, now: () => performance.now(), ...overrides };
  return (data: unknown): void => {
    const request = readPuzzleMatchRequest(data);
    if (!request) return;
    const started = now();
    let result: PuzzleMatchWorkerResult;
    try {
      const prepared = preparePuzzleMatch(request.input, false);
      if (prepared.context.artworkSourceId !== request.binding.artworkSourceId) result = { status: "failed", code: "protocol" };
      else {
        const answer = match(prepared.input);
        result = now() - started >= request.timeLimitMs ? { status: "timeLimit" } : { status: "review", match: answer };
      }
    } catch { result = { status: "failed", code: "runtime" }; }
    post({ protocol: PUZZLE_WORKER_PROTOCOL, type: "matchResult", requestId: request.requestId, binding: request.binding, result });
  };
}
