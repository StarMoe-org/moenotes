import { useCallback, useEffect, useRef, useState } from "react";
import type { GameServer } from "@/config/servers";
import { resolveDeckRuntime, type DeckRuntimeFailureCode, type DeckRuntimeUnavailableReason, type DeckSolverRuntime } from "@/lib/deck/runtime-source";
import { DeckWorkerClient } from "@/lib/deck/worker-client";
import type { DeckDataCatalog, DeckWorkerFailureCode } from "@/lib/deck/worker-protocol";
import { parseCapabilities, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { parseDeckAnswer, type DeckAnswer } from "@/lib/deck/answer";

/** Progress reports arrive at most this often. */
const PROGRESS_INTERVAL_MS = 250;

export type DeckEngineState =
  | { status: "loading" }
  | { status: "ready"; runtime: DeckSolverRuntime; datasetId: string; capabilities: DeckSolverCapabilities | null; catalog: DeckDataCatalog | null }
  | { status: "unavailable"; reason: DeckRuntimeUnavailableReason }
  | { status: "failed"; code: DeckRuntimeFailureCode | DeckWorkerFailureCode; message: string };

/**
 * What a run asks of the solver. With `rate`, that request is answered first and its answer builds the goal's own
 * request; `request` returns null when the answer cannot rate the goal, and the run ends with the rating answer.
 */
export interface DeckRunPlan { rate: string | null; request: (rate: DeckAnswer | null) => string | null }

export type DeckJobState =
  | { status: "idle" }
  /** `stage`: the request being answered; `rate` is the finished rating answer of a run that has one. */
  | { status: "running"; key: string; startedAt: number; stage: "rate" | "goal"; rate: DeckAnswer | null; progress: DeckAnswer | null }
  /** `stopped`: the user stopped the run; the answer is its last progress report. */
  | { status: "done"; key: string; answer: DeckAnswer; rate: DeckAnswer | null; stopped: boolean }
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
      if (ready.status === "ready") setEngine({ status: "ready", runtime: resolved.runtime, datasetId: ready.datasetId, capabilities: parseCapabilities(ready.capabilitiesJson), catalog: ready.catalog });
      else if (ready.status === "failed") setEngine({ status: "failed", code: ready.code, message: ready.message });
    })();
    return () => { abort.abort(); worker.dispose(); };
  }, [server, active, attempt]);

  useEffect(() => () => client.current?.dispose(), []);

  const run = useCallback((key: string, accountJson: string, plan: DeckRunPlan) => {
    const worker = client.current;
    if (!worker || engine.status !== "ready") return;
    const inputRevision = ++revision.current, runtime = engine.runtime;
    const current = () => revision.current === inputRevision;
    const answerOf = (stage: "rate" | "goal", requestJson: string) => worker.run({ runtime, jobId: `${server}:${inputRevision}:${stage}`, inputRevision, accountJson, requestJson, progressIntervalMs: PROGRESS_INTERVAL_MS,
      onProgress: json => {
        const progress = readAnswer(json);
        if (progress && current()) setJob(job => job.status === "running" && job.key === key && job.stage === stage ? { ...job, progress } : job);
      } });
    setJob({ status: "running", key, startedAt: performance.now(), stage: plan.rate === null ? "goal" : "rate", rate: null, progress: null });
    void (async () => {
      let rate: DeckAnswer | null = null;
      if (plan.rate !== null) {
        const outcome = await answerOf("rate", plan.rate);
        if (!current() || outcome.status === "superseded") return;
        if (outcome.status === "failed") { setJob({ status: "failed", key, code: outcome.code, message: outcome.message }); return; }
        if (outcome.status === "stopped") { setJob({ status: "stopped", key }); return; }
        rate = readAnswer(outcome.resultJson);
        if (!rate) { setJob({ status: "failed", key, code: "answer", message: "The solver answer could not be read" }); return; }
      }
      let requestJson: string | null;
      try { requestJson = plan.request(rate); }
      catch (error) { setJob({ status: "failed", key, code: "answer", message: error instanceof Error ? error.message : String(error) }); return; }
      // A rating answer that reports problems, or names no team, is the run's answer.
      if (requestJson === null) { setJob(rate ? { status: "done", key, answer: rate, rate: null, stopped: false } : { status: "stopped", key }); return; }
      if (rate) setJob(job => job.status === "running" && job.key === key ? { ...job, stage: "goal", rate, progress: null } : job);
      const outcome = await answerOf("goal", requestJson);
      if (!current() || outcome.status === "superseded") return;
      if (outcome.status === "failed") { setJob({ status: "failed", key, code: outcome.code, message: outcome.message }); return; }
      const answer = readAnswer(outcome.resultJson);
      if (outcome.status === "complete") setJob(answer ? { status: "done", key, answer, rate, stopped: false } : { status: "failed", key, code: "answer", message: "The solver answer could not be read" });
      else setJob(answer ? { status: "done", key, answer, rate, stopped: true } : { status: "stopped", key });
    })();
  }, [engine, server]);

  const stop = useCallback(() => client.current?.stop(), []);
  const reset = useCallback(() => { revision.current++; client.current?.stop(); setJob({ status: "idle" }); }, []);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { engine, job, run, stop, reset, retry };
}
