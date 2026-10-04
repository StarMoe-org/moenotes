import { useCallback, useEffect, useRef, useState } from "react";
import type { GameServer } from "@/config/servers";
import { resolveDeckRuntime, type DeckRuntimeFailureCode, type DeckRuntimeUnavailableReason, type DeckSolverRuntime } from "@/lib/deck/runtime-source";
import { DeckWorkerClient } from "@/lib/deck/worker-client";
import type { DeckWorkerFailureCode } from "@/lib/deck/worker-protocol";
import { parseCapabilities, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { parseDeckAnswer, type DeckAnswer } from "@/lib/deck/answer";

/** Progress reports arrive at most this often. */
const PROGRESS_INTERVAL_MS = 250;

export type DeckEngineState =
  | { status: "loading" }
  | { status: "ready"; runtime: DeckSolverRuntime; datasetId: string; capabilities: DeckSolverCapabilities | null }
  | { status: "unavailable"; reason: DeckRuntimeUnavailableReason }
  | { status: "failed"; code: DeckRuntimeFailureCode | DeckWorkerFailureCode; message: string };

export type DeckJobState =
  | { status: "idle" }
  | { status: "running"; key: string; startedAt: number; progress: DeckAnswer | null }
  /** `stopped`: the user stopped the run; the answer is its last progress report. */
  | { status: "done"; key: string; answer: DeckAnswer; stopped: boolean }
  /** `stopped` without any progress report yet. */
  | { status: "stopped"; key: string }
  | { status: "failed"; key: string; code: DeckWorkerFailureCode | "answer"; message: string };

function readAnswer(json: string | null): DeckAnswer | null {
  if (json === null) return null;
  try { return parseDeckAnswer(json); } catch { return null; }
}

/**
 * The deck solver of the deck page: resolves the server's runtime and loads its Worker once the page is shown
 * (capabilities decide which goals are offered), then runs one recommendation at a time. A run is bound to the
 * `key` of its inputs; the page compares it with the current inputs to tell a stale result.
 */
export function useDeckSolver(server: GameServer, active: boolean) {
  const [engine, setEngine] = useState<DeckEngineState>({ status: "loading" });
  const [job, setJob] = useState<DeckJobState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const client = useRef<DeckWorkerClient | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    if (!active) return;
    const worker = client.current ??= new DeckWorkerClient();
    const abort = new AbortController();
    setEngine({ status: "loading" }); setJob({ status: "idle" });
    void (async () => {
      const resolved = await resolveDeckRuntime(server, { signal: abort.signal }).catch(error => {
        if (abort.signal.aborted) return null;
        return { status: "failed" as const, code: "network" as const, message: error instanceof Error ? error.message : String(error) };
      });
      if (!resolved || abort.signal.aborted) return;
      if (resolved.status === "unavailable") { setEngine({ status: "unavailable", reason: resolved.reason }); return; }
      if (resolved.status === "failed") { setEngine({ status: "failed", code: resolved.code, message: resolved.message }); return; }
      const ready = await worker.prepare(resolved.runtime);
      if (abort.signal.aborted) return;
      if (ready.status === "ready") setEngine({ status: "ready", runtime: resolved.runtime, datasetId: ready.datasetId, capabilities: parseCapabilities(ready.capabilitiesJson) });
      else if (ready.status === "failed") setEngine({ status: "failed", code: ready.code, message: ready.message });
    })();
    return () => { abort.abort(); worker.dispose(); };
  }, [server, active, attempt]);

  useEffect(() => () => client.current?.dispose(), []);

  const run = useCallback((key: string, accountJson: string, requestJson: string) => {
    const worker = client.current;
    if (!worker || engine.status !== "ready") return;
    const inputRevision = ++revision.current;
    setJob({ status: "running", key, startedAt: performance.now(), progress: null });
    void worker.run({ runtime: engine.runtime, jobId: `${server}:${inputRevision}`, inputRevision, accountJson, requestJson, progressIntervalMs: PROGRESS_INTERVAL_MS,
      onProgress: json => {
        const progress = readAnswer(json);
        if (progress && revision.current === inputRevision) setJob(current => current.status === "running" && current.key === key ? { ...current, progress } : current);
      } }).then(outcome => {
      if (revision.current !== inputRevision || outcome.status === "superseded") return;
      if (outcome.status === "failed") { setJob({ status: "failed", key, code: outcome.code, message: outcome.message }); return; }
      const answer = readAnswer(outcome.resultJson);
      if (outcome.status === "complete") setJob(answer ? { status: "done", key, answer, stopped: false } : { status: "failed", key, code: "answer", message: "The solver answer could not be read" });
      else setJob(answer ? { status: "done", key, answer, stopped: true } : { status: "stopped", key });
    });
  }, [engine, server]);

  const stop = useCallback(() => client.current?.stop(), []);
  const reset = useCallback(() => { revision.current++; client.current?.stop(); setJob({ status: "idle" }); }, []);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { engine, job, run, stop, reset, retry };
}
