import { suggestPuzzleRegions, type PuzzleRegionSuggestions } from "./detection";
import { preparePuzzleDetect, readPuzzleDetectRequest, type PuzzleDetectReply, type PuzzleDetectWorkerResult } from "./detect-protocol";
import { PUZZLE_WORKER_PROTOCOL } from "./worker-protocol";

export function createPuzzleDetectHandler(post: (reply: PuzzleDetectReply) => void, overrides: Partial<{ detect: typeof suggestPuzzleRegions; now: () => number }> = {}) {
  const { detect, now } = { detect: suggestPuzzleRegions, now: () => performance.now(), ...overrides };
  return (data: unknown): void => {
    const request = readPuzzleDetectRequest(data);
    if (!request) return;
    const started = now();
    let result: PuzzleDetectWorkerResult;
    try {
      const prepared = preparePuzzleDetect(request.input, false);
      if (prepared.context.artworkSourceId !== request.binding.artworkSourceId) result = { status: "failed", code: "protocol" };
      else {
        const suggestions: PuzzleRegionSuggestions = detect(prepared.input.screenshot, prepared.context.size, prepared.input.artwork ?? undefined);
        result = now() - started >= request.timeLimitMs ? { status: "timeLimit" } : { status: "suggestions", suggestions };
      }
    } catch { result = { status: "failed", code: "runtime" }; }
    post({ protocol: PUZZLE_WORKER_PROTOCOL, type: "detectResult", requestId: request.requestId, binding: request.binding, result });
  };
}
