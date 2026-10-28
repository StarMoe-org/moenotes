import { describe, expect, test } from "bun:test";
import { createPuzzleBoard } from "../src/lib/sliding-puzzle/model";
import { solvePuzzle } from "../src/lib/sliding-puzzle/solver";
import { PuzzleWorkerClient, type PuzzleSolveJob, type PuzzleWorkerPort } from "../src/lib/sliding-puzzle/worker-client";
import { PUZZLE_WORKER_PROTOCOL, type PuzzleWorkerRequest } from "../src/lib/sliding-puzzle/worker-protocol";

class Port implements PuzzleWorkerPort {
  onmessage: PuzzleWorkerPort["onmessage"] = null;
  onerror: PuzzleWorkerPort["onerror"] = null;
  onmessageerror: PuzzleWorkerPort["onmessageerror"] = null;
  sent: PuzzleWorkerRequest[] = [];
  terminated = 0;
  failPost = false;
  postMessage(message: unknown) { if (this.failPost) throw new Error("post failed"); this.sent.push(message as PuzzleWorkerRequest); }
  terminate() { this.terminated++; }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
  answer(index = this.sent.length - 1) {
    const request = this.sent[index]!;
    return { protocol: PUZZLE_WORKER_PROTOCOL, type: "result", requestId: request.requestId, binding: request.binding,
      result: solvePuzzle(createPuzzleBoard(request.input.size as 3, request.input.cells as number[])) };
  }
}

function harness() {
  let clock = 0;
  const ports: Port[] = [], timers = new Set<() => void>();
  const client = new PuzzleWorkerClient({
    createWorker: () => { const port = new Port(); ports.push(port); return port; },
    now: () => clock,
    schedule: callback => { timers.add(callback); return () => { timers.delete(callback); }; },
  });
  const job = (changes: Partial<PuzzleSolveJob> = {}): PuzzleSolveJob => ({
    binding: { jobId: "job", inputRevision: "review-1", artworkSourceId: "tw:jacket:3:crop" },
    input: { size: 3, cells: [1, 2, 3, 4, 5, 6, 7, 0, 8] }, timeLimitMs: 100, isCurrent: () => true, ...changes,
  });
  return { client, ports, timers, job, setClock: (value: number) => { clock = value; }, fire: () => [...timers].forEach(callback => callback()) };
}

describe("puzzle Worker client", () => {
  test("validates locally, snapshots input/binding and reuses a healthy completed Worker", async () => {
    const h = harness();
    const input = h.job();
    const first = h.client.run(input);
    (input.input.cells as number[])[0] = 8;
    (input.binding as { inputRevision: string }).inputRevision = "changed";
    const port = h.ports[0]!;
    expect(port.sent[0]!.input.cells).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8]);
    port.emit(port.answer());
    expect((await first).result.status).toBe("solved");
    expect((await first).binding.inputRevision).toBe("review-1");
    expect(port.terminated).toBe(0);
    const second = h.client.run(h.job());
    port.emit(port.answer());
    expect((await second).result.status).toBe("solved");
    expect(h.ports).toHaveLength(1);
    expect(h.timers.size).toBe(0);
    h.client.dispose();
    expect(port.terminated).toBe(1);
  });

  test("rejects invalid job configuration and returns invalid board input without allocating a Worker", async () => {
    const h = harness();
    for (const timeLimitMs of [0, -1, 1.5, NaN, Infinity, 120001]) expect(() => h.client.run(h.job({ timeLimitMs }))).toThrow(RangeError);
    expect(() => h.client.run(h.job({ binding: { jobId: "", inputRevision: "1", artworkSourceId: "art" } }))).toThrow(RangeError);
    const result = await h.client.run(h.job({ input: { size: 3, cells: [1] } }));
    expect(result.result).toEqual({ status: "invalid", issue: { code: "invalidLength" } });
    expect(h.ports).toHaveLength(0);
    expect(h.client.running).toBe(false);
  });

  test("cancels immediately, ignores a terminated Worker's callback and creates a fresh retry", async () => {
    const h = harness();
    const first = h.client.run(h.job());
    const old = h.ports[0]!, late = old.onmessage!;
    h.client.cancel();
    expect((await first).result.status).toBe("cancelled");
    expect(old.terminated).toBe(1);
    expect(h.timers.size).toBe(0);
    const next = h.client.run(h.job());
    late({ data: old.answer() } as MessageEvent);
    expect(h.client.running).toBe(true);
    h.ports[1]!.emit(h.ports[1]!.answer());
    expect((await next).result.status).toBe("solved");
    h.client.dispose();
  });

  test("supersedes the old job and rejects foreign bindings and repeated sequence replies", async () => {
    const h = harness();
    const first = h.client.run(h.job());
    const second = h.client.run(h.job());
    expect((await first).result.status).toBe("stale");
    const port = h.ports[1]!;
    const answer = port.answer();
    port.emit({ ...answer, binding: { ...answer.binding, artworkSourceId: "jp:other" } });
    expect(h.client.running).toBe(true);
    port.emit(answer);
    await second;
    const third = h.client.run(h.job()); // Same caller binding, different internal sequence.
    port.emit(answer);
    expect(h.client.running).toBe(true);
    port.emit(port.answer());
    expect((await third).result.status).toBe("solved");
    h.client.dispose();
  });

  test("marks input changes stale even without another run, including the deadline path", async () => {
    for (const event of ["result", "timer"] as const) {
      const h = harness();
      let current = true;
      const pending = h.client.run(h.job({ isCurrent: () => current }));
      current = false;
      if (event === "result") h.ports[0]!.emit(h.ports[0]!.answer());
      else { h.setClock(100); h.fire(); }
      expect((await pending).result.status).toBe("stale");
      expect(h.ports[0]!.terminated).toBe(1);
      expect(h.timers.size).toBe(0);
    }
  });

  test("enforces deadlines even when the result arrives before the timeout callback", async () => {
    for (const event of ["result", "timer"] as const) {
      const h = harness();
      const pending = h.client.run(h.job());
      h.setClock(100);
      if (event === "result") h.ports[0]!.emit(h.ports[0]!.answer()); else h.fire();
      const outcome = await pending;
      expect(outcome.result.status).toBe("timeLimit");
      expect(outcome.elapsedMs).toBe(100);
      expect(h.ports[0]!.terminated).toBe(1);
      expect(h.timers.size).toBe(0);
    }
  });

  test("includes Worker creation and receiving-thread validation in the total budget", async () => {
    let clock = 0, allocations = 0;
    const port = new Port();
    const client = new PuzzleWorkerClient({ now: () => clock,
      createWorker: () => { allocations++; clock = 100; return port; } });
    const h = harness();
    expect((await client.run(h.job())).result.status).toBe("timeLimit");
    expect(allocations).toBe(1);
    expect(port.sent).toHaveLength(0);
    expect(port.terminated).toBe(1);

    const v = harness();
    const pending = v.client.run(v.job());
    const answer = v.ports[0]!.answer();
    // Simulate time consumed while reading/validating a reply, independently of the scheduled timer.
    const result = answer.result;
    Object.defineProperty(answer, "result", { get: () => { v.setClock(101); return result; } });
    v.ports[0]!.emit(answer);
    expect((await pending).result.status).toBe("timeLimit");
    expect(v.ports[0]!.terminated).toBe(1);
  });

  test("fails malformed and impossible results instead of publishing them or retaining the Worker", async () => {
    for (const data of [null, { type: "result" }, { status: "unsolvable" }, { status: "solved", steps: 0, moves: [] }]) {
      const h = harness();
      const pending = h.client.run(h.job());
      const port = h.ports[0]!;
      port.emit(data && "status" in data ? { ...port.answer(), result: data } : data);
      expect((await pending).result).toEqual({ status: "failed", code: "protocol" });
      expect(port.terminated).toBe(1);
      expect(h.timers.size).toBe(0);
    }
  });

  test("settles factory, post, runtime, message and scope errors and clears timers", async () => {
    const h = harness();
    const factory = new PuzzleWorkerClient({ createWorker: () => { throw new Error("unavailable"); } });
    expect((await factory.run(h.job())).result).toEqual({ status: "failed", code: "worker" });
    for (const kind of ["post", "error", "message", "scope"] as const) {
      const port = new Port();
      port.failPost = kind === "post";
      const client = new PuzzleWorkerClient({ createWorker: () => port });
      let current = true;
      const pending = client.run(h.job({ isCurrent: () => { if (!current) throw new Error("scope read failed"); return true; } }));
      if (kind === "error") port.onerror?.({ preventDefault() {} } as ErrorEvent);
      if (kind === "message") port.onmessageerror?.({} as MessageEvent);
      if (kind === "scope") { current = false; port.emit(port.answer()); }
      expect((await pending).result).toEqual({ status: "failed", code: kind === "post" ? "message" : kind === "error" ? "worker" : kind });
      expect(client.running).toBe(false);
      expect(port.terminated).toBe(1);
      client.dispose();
    }
  });

  test("disposes an active job exactly once and ignores subsequent late events", async () => {
    const h = harness();
    const pending = h.client.run(h.job());
    const port = h.ports[0]!, late = port.onmessage!;
    h.client.dispose(); h.client.dispose(); h.client.cancel();
    late({ data: port.answer() } as MessageEvent);
    expect((await pending).result.status).toBe("cancelled");
    expect(port.terminated).toBe(1);
    expect(h.timers.size).toBe(0);
    expect(h.client.running).toBe(false);
  });
});
