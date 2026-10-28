import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyPuzzleMove, createPuzzleBoard, createPuzzleGoal, getPuzzleMoves, isPuzzleSolved, replayPuzzleMoves, type PuzzleSize } from "../src/lib/sliding-puzzle/model";
import { PuzzleWorkerClient, type PuzzleWorkerPort } from "../src/lib/sliding-puzzle/worker-client";

const solverUrl = new URL("../src/lib/sliding-puzzle/puzzle.worker.ts", import.meta.url);
let busyDirectory: string;
let busyPath: string;
beforeAll(() => {
  busyDirectory = mkdtempSync(join(tmpdir(), "moenotes-puzzle-worker-"));
  busyPath = join(busyDirectory, "busy-worker.js");
  writeFileSync(busyPath, 'self.onmessage = () => { self.postMessage({ signal: "started" }); while (true) {} };');
});
afterAll(() => { unlinkSync(busyPath); rmdirSync(busyDirectory); });

/** Real isolated Worker with only the busy fixture's readiness message intercepted. */
function port(url: URL, started = () => {}, terminated = () => {}): PuzzleWorkerPort {
  const worker = new Worker(url, { type: "module" });
  const result: PuzzleWorkerPort = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage: message => worker.postMessage(message),
    terminate: () => { terminated(); worker.terminate(); },
  };
  worker.onmessage = event => {
    if (event.data?.signal === "started") started();
    else result.onmessage?.(event);
  };
  worker.onerror = event => result.onerror?.(event);
  worker.onmessageerror = event => result.onmessageerror?.(event);
  return result;
}

function job(size: PuzzleSize = 3) {
  let board = createPuzzleGoal(size);
  for (let step = 0; step < 100; step++) {
    const moves = getPuzzleMoves(board);
    board = applyPuzzleMove(board, moves[(step * 17 + Math.floor(step / 3)) % moves.length]!);
  }
  return {
    binding: { jobId: `real-${size}`, inputRevision: "review-1", artworkSourceId: "tw:100027:jkt_002_100027" },
    input: { size, cells: board.cells }, timeLimitMs: 10000, isCurrent: () => true,
  };
}

describe("real puzzle module Worker", () => {
  test("solves all six sizes in an isolated Worker and reuses its healthy realm", async () => {
    let created = 0;
    const client = new PuzzleWorkerClient({ createWorker: () => { created++; return port(solverUrl); } });
    try {
      for (const size of [3, 4, 5, 6, 7, 8] as const) {
        const input = job(size);
        const outcome = await client.run(input);
        expect(outcome.result.status).toBe("solved");
        if (outcome.result.status !== "solved") throw new Error(`Worker failed for size ${size}`);
        expect(isPuzzleSolved(replayPuzzleMoves(createPuzzleBoard(size, input.input.cells), outcome.result.moves))).toBe(true);
        expect(outcome.binding).toEqual(input.binding);
      }
      expect(created).toBe(1);
    } finally { client.dispose(); }
  }, 20000);

  test("terminates a Worker during synchronous computation and creates a working retry", async () => {
    let announceStarted!: () => void;
    const started = new Promise<void>(resolve => { announceStarted = resolve; });
    let created = 0;
    let terminated = 0;
    const client = new PuzzleWorkerClient({ createWorker: () => {
      created++;
      return created === 1 ? port(pathToFileURL(busyPath), announceStarted, () => { terminated++; }) : port(solverUrl);
    } });
    let startupGuard: ReturnType<typeof setTimeout> | undefined;
    try {
      const pending = client.run(job());
      await Promise.race([started, new Promise<never>((_, reject) => {
        startupGuard = setTimeout(() => reject(new Error("Busy Worker did not start")), 5000);
      })]);
      clearTimeout(startupGuard);
      client.cancel();
      expect((await pending).result.status).toBe("cancelled");
      expect(terminated).toBe(1);
      expect(client.running).toBe(false);
      expect((await client.run(job())).result.status).toBe("solved");
      expect(created).toBe(2);
    } finally { clearTimeout(startupGuard); client.dispose(); }
  }, 15000);

  test("enforces a deadline while a real Worker cannot process further messages", async () => {
    let terminated = 0;
    const client = new PuzzleWorkerClient({ createWorker: () => port(pathToFileURL(busyPath), undefined, () => { terminated++; }) });
    try {
      const outcome = await client.run({ ...job(), timeLimitMs: 1000 });
      expect(outcome.result.status).toBe("timeLimit");
      expect(terminated).toBe(1);
      expect(client.running).toBe(false);
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(999);
    } finally { client.dispose(); }
  }, 10000);
});
