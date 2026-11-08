import { useCallback, useEffect, useRef, useState } from "react";
import type { GameServer } from "@/config/servers";
import {
  buildDeckChartsOverlayUrl,
  buildDeckMasterOverlayUrl,
  resolveDeckRuntime,
  resolveLiveDeckRuntimeFallback,
  type DeckRuntimeFailureCode,
  type DeckRuntimeUnavailableReason,
  type DeckSolverRuntime,
} from "@/lib/deck/runtime-source";
import { DeckWorkerClient } from "@/lib/deck/worker-client";
import type { DeckDataCatalog, DeckWorkerFailureCode } from "@/lib/deck/worker-protocol";
import { parseCapabilities, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { parseDeckAnswer, type DeckAnswer, type DeckTeam } from "@/lib/deck/answer";
import type { DeckGrowthTeamInput, DeckTeamGrowthReport } from "@/lib/deck/haneoka/growth";
import { getLocalServerMasterDataVersion } from "@/lib/masterdata/client-version";

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
  const [growthByTeam, setGrowthByTeam] = useState<Record<string, { loading: boolean; report: DeckTeamGrowthReport | null }>>({});
  const [attempt, setAttempt] = useState(0);
  const client = useRef<DeckWorkerClient | null>(null);
  const revision = useRef(0);
  const growthRevision = useRef(0);
  const previous = useRef<{ key: string; accountJson: string; plan: DeckRunPlan; seedJson?: string; rate?: DeckAnswer | null; requestJson?: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    revision.current++; previous.current = null;
    const worker = client.current ??= new DeckWorkerClient();
    const abort = new AbortController();
    setEngine({ status: "loading" }); setJob({ status: "idle" }); setGrowthByTeam({});
    void (async () => {
      let resolved = await resolveDeckRuntime(server, { signal: abort.signal }).catch(error => {
        if (abort.signal.aborted) return null;
        return { status: "failed" as const, code: "network" as const, message: error instanceof Error ? error.message : String(error) };
      });
      if (!resolved || abort.signal.aborted) return;
      if (resolved.status !== "available") {
        const fallback = await resolveLiveDeckRuntimeFallback(server, { signal: abort.signal }).catch(() => null);
        if (abort.signal.aborted) return;
        if (fallback) resolved = { status: "available", runtime: fallback };
      }
      if (resolved.status === "unavailable") { setEngine({ status: "unavailable", reason: resolved.reason }); return; }
      if (resolved.status === "failed") { setEngine({ status: "failed", code: resolved.code, message: resolved.message }); return; }
      const localVersion = getLocalServerMasterDataVersion(server);
      const runtime: DeckSolverRuntime = {
        ...resolved.runtime,
        masterOverlayUrl: buildDeckMasterOverlayUrl(server, localVersion, undefined, attempt),
        chartsOverlayUrl: buildDeckChartsOverlayUrl(server, localVersion, undefined, attempt),
      };
      const ready = await worker.prepare(runtime);
      if (abort.signal.aborted) return;
      if (ready.status === "ready") setEngine({ status: "ready", runtime, datasetId: ready.datasetId, capabilities: parseCapabilities(ready.capabilitiesJson), catalog: ready.catalog });
      else if (ready.status === "failed") setEngine({ status: "failed", code: ready.code, message: ready.message });
    })();
    return () => { abort.abort(); worker.dispose(); };
  }, [server, active, attempt]);

  useEffect(() => () => client.current?.dispose(), []);

  const run = useCallback((key: string, accountJson: string, plan: DeckRunPlan, seedJson?: string, cachedRate?: DeckAnswer | null) => {
    const worker = client.current;
    if (!worker || engine.status !== "ready") return;
    const prior = previous.current;
    previous.current = { key, accountJson, plan, ...(seedJson === undefined ? {} : { seedJson }) };
    const inputRevision = ++revision.current, runtime = engine.runtime;
    const current = () => revision.current === inputRevision;
    const answerOf = (stage: "rate" | "goal", requestJson: string) => worker.run({ runtime, jobId: `${server}:${inputRevision}:${stage}`, inputRevision, accountJson, requestJson, progressIntervalMs: PROGRESS_INTERVAL_MS, ...(stage === "goal" && seedJson ? { seedJson } : {}),
      onProgress: json => {
        if (stage === "goal" && current() && previous.current) previous.current.seedJson = json;
        const progress = readAnswer(json);
        if (progress && current()) setJob(job => job.status === "running" && job.key === key && job.stage === stage ? { ...job, progress } : job);
      } });
    const retained = (plan.rate === null || cachedRate !== undefined) && seedJson ? readAnswer(seedJson) : null;
    const progress = retained?.result ? { ...retained, final: false, result: { ...retained.result, elapsedMs: 0 } } : null;
    if (!seedJson || prior?.key !== key) setGrowthByTeam({});
    setJob({ status: "running", key, startedAt: performance.now(), stage: plan.rate === null || cachedRate !== undefined ? "goal" : "rate", rate: cachedRate ?? null, progress });
    void (async () => {
      let rate: DeckAnswer | null = cachedRate ?? null;
      if (plan.rate !== null && cachedRate === undefined) {
        const outcome = await answerOf("rate", plan.rate);
        if (!current() || outcome.status === "superseded") return;
        if (outcome.status === "failed") { setJob({ status: "failed", key, code: outcome.code, message: outcome.message }); return; }
        if (outcome.status === "stopped") { setJob({ status: "stopped", key }); return; }
        rate = readAnswer(outcome.resultJson);
        if (!rate) { setJob({ status: "failed", key, code: "answer", message: "The solver answer could not be read" }); return; }
      }
      let requestJson: string | null;
      try { requestJson = seedJson && prior?.key === key && prior.requestJson ? prior.requestJson : plan.request(rate); }
      catch (error) { setJob({ status: "failed", key, code: "answer", message: error instanceof Error ? error.message : String(error) }); return; }
      // A rating answer that reports problems, or names no team, is the run's answer.
      if (requestJson === null) { setJob(rate ? { status: "done", key, answer: rate, rate: null, stopped: false } : { status: "stopped", key }); return; }
      if (rate && cachedRate === undefined) setJob(job => job.status === "running" && job.key === key ? { ...job, stage: "goal", rate, progress: null } : job);
      if (previous.current) { previous.current.rate = rate; previous.current.requestJson = requestJson; }
      const outcome = await answerOf("goal", requestJson);
      if (!current() || outcome.status === "superseded") return;
      if (outcome.status === "failed") { setJob({ status: "failed", key, code: outcome.code, message: outcome.message }); return; }
      if (outcome.resultJson && previous.current) previous.current.seedJson = outcome.resultJson;
      const answer = readAnswer(outcome.resultJson ?? seedJson ?? null);
      if (outcome.status === "complete") setJob(answer ? { status: "done", key, answer, rate, stopped: false } : { status: "failed", key, code: "answer", message: "The solver answer could not be read" });
      else setJob(answer ? { status: "done", key, answer, rate, stopped: true } : { status: "stopped", key });
    })();
  }, [engine, server]);

  const stop = useCallback(() => client.current?.stop(), []);
  const reset = useCallback(() => { revision.current++; client.current?.stop(); setJob({ status: "idle" }); setGrowthByTeam({}); }, []);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const resume = useCallback(() => {
    const last = previous.current;
    if (last) run(last.key, last.accountJson, last.plan, last.seedJson, last.rate ?? null);
  }, [run]);

  const evaluateGrowth = useCallback((teamKey: string, team: DeckTeam) => {
    const worker = client.current;
    const ctx = previous.current;
    if (!worker || engine.status !== "ready" || !ctx?.requestJson) return;
    const inputRevision = ++growthRevision.current;
    setGrowthByTeam(prev => ({
      ...prev,
      [teamKey]: { loading: true, report: prev[teamKey]?.report ?? null },
    }));
    const payload: DeckGrowthTeamInput = {
      members: [team.leader.member, ...team.others.map(item => item.member)],
      snaps: [team.leader.snap, ...team.others.map(item => item.snap)],
      ...(team.song ? { song: team.song } : {}),
      ...(team.aggregate?.songs.length ? { aggregateSongs: team.aggregate.songs.map(item => item.song) } : {}),
    };
    void (async () => {
      const outcome = await worker.evaluateGrowth({
        runtime: engine.runtime,
        jobId: `${server}:growth:${inputRevision}`,
        inputRevision,
        accountJson: ctx.accountJson,
        requestJson: ctx.requestJson!,
        teamJson: JSON.stringify(payload),
      });
      if (outcome.status === "stopped") {
        setGrowthByTeam(prev => {
          const entry = prev[teamKey];
          if (!entry?.loading) return prev;
          return { ...prev, [teamKey]: { loading: false, report: entry.report } };
        });
        return;
      }
      if (outcome.status === "failed") {
        setGrowthByTeam(prev => ({
          ...prev,
          [teamKey]: {
            loading: false,
            report: {
              format: "moenotes.deck-growth/1",
              status: "invalid",
              metricKind: "power",
              baseline: null,
              scenarios: [],
              cards: [],
              elapsedMs: 0,
              message: outcome.message,
            },
          },
        }));
        return;
      }
      let parsed: DeckTeamGrowthReport | null = null;
      try {
        const raw = JSON.parse(outcome.growthJson) as DeckTeamGrowthReport;
        if (raw && raw.format === "moenotes.deck-growth/1") parsed = raw;
      } catch {
        parsed = null;
      }
      setGrowthByTeam(prev => ({
        ...prev,
        [teamKey]: {
          loading: false,
          report: parsed ?? {
            format: "moenotes.deck-growth/1",
            status: "invalid",
            metricKind: "power",
            baseline: null,
            scenarios: [],
            cards: [],
            elapsedMs: 0,
            message: "Invalid growth payload",
          },
        },
      }));
    })();
  }, [engine, server]);

  return { engine, job, growthByTeam, run, stop, reset, retry, resume, evaluateGrowth };
}
