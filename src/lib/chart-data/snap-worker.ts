import { applyAccuracyPreset, parseJustJudgementTypes } from "ournotes-player/replay/preset";
import type { AppLocale } from "@/config/locales";
import { createSnapEvaluator, loadSnapReplayRuntime, SnapReplayError, validateSnapProfile, type LoadedSnapReplay } from "./snap-bridge";
import { buildSnapSkillCatalogue } from "./snap-catalogue";
import { buildSnapLabeler } from "./snap-labels";
import { snapProfileKey, type SnapMeasuredRank, type SnapMeasuredRow, type SnapRankRequest, type SnapRankingCatalogue, type SnapRankingSource, type SnapWorkerRequest, type SnapWorkerResponse } from "./snap-client";
import type { SnapEvaluationProfile, SnapPowerDomain, SnapRankProgress, SnapReplayResult } from "./snap-types";

type RankJob = { status(): SnapRankProgress; advance(count: number): SnapRankProgress; dispose(): void };
type Evaluator = { evaluate(scoreId: number): SnapReplayResult; startRank?(scoreId: number, threshold: number, domain: SnapPowerDomain): RankJob; dispose(): void };
interface WorkerDependencies {
  load(source: SnapRankingSource): Promise<LoadedSnapReplay>;
  evaluator(loaded: LoadedSnapReplay, profile: SnapEvaluationProfile): Evaluator;
  catalogue(loaded: LoadedSnapReplay, locale: AppLocale): SnapRankingCatalogue;
  validate(loaded: LoadedSnapReplay, profile: SnapEvaluationProfile): void;
  yieldControl(): Promise<void>;
}
const inputPlan: Parameters<typeof createSnapEvaluator>[2] = (request, description, data, profile) => {
  applyAccuracyPreset(request, description, parseJustJudgementTypes(data as unknown as Record<string, unknown>), profile.greatFraction, profile.justFraction);
};
const defaults: WorkerDependencies = {
  load: (source) => loadSnapReplayRuntime(source.site, source.reference, source.expected),
  evaluator: (loaded, profile) => createSnapEvaluator(loaded, profile, inputPlan),
  catalogue: (loaded, locale) => ({
    choices: buildSnapSkillCatalogue(loaded.data, loaded.labelSource ? buildSnapLabeler(loaded.data, loaded.labelSource, locale) : undefined),
    data: { ...loaded.data, charts: [] },
    ...(loaded.labelSource ? { labelSource: loaded.labelSource } : {}),
    source: { manifestSha256: loaded.manifestSha256, dataSha256: loaded.dataSha256, modelCommit: loaded.modelCommit },
  }),
  validate: (loaded, profile) => validateSnapProfile(loaded.data, profile),
  yieldControl: () => new Promise((resolve) => setTimeout(resolve, 0)),
};

/** Transport, bounded memoization and cancellation only. Every score comes from Rust. */
export function createSnapWorkerHandler(post: (value: SnapWorkerResponse) => void, overrides: Partial<WorkerDependencies> = {}, cacheLimit = 1500) {
  if (!Number.isInteger(cacheLimit) || cacheLimit < 0) throw new Error("Invalid replay cache limit");
  const dependencies = { ...defaults, ...overrides };
  let loadedKey = "";
  let loadedPromise: Promise<LoadedSnapReplay> | null = null;
  let activeJob = 0;
  const cancelled = new Set<number>();
  const cache = new Map<string, SnapReplayResult>();
  const rankCache = new Map<string, SnapMeasuredRank>();
  const interrupted = Symbol("cancelled rank job");
  const cacheGet = (key: string) => {
    const value = cache.get(key);
    if (value) { cache.delete(key); cache.set(key, value); }
    return value;
  };
  const cacheSet = (key: string, value: SnapReplayResult) => {
    cache.set(key, value);
    while (cache.size > cacheLimit) cache.delete(cache.keys().next().value!);
  };
  const load = (source: SnapRankingSource) => {
    const key = JSON.stringify(source);
    if (key !== loadedKey || !loadedPromise) {
      loadedKey = key;
      cache.clear();
      rankCache.clear();
      loadedPromise = dependencies.load(source).catch((error: unknown) => {
        if (loadedKey === key) loadedPromise = null;
        throw error;
      });
    }
    return loadedPromise;
  };
  const isCurrent = (revision: number) => activeJob === revision && !cancelled.has(revision);

  async function rankPair(revision: number, selected: Evaluator, baseline: Evaluator, scoreId: number, analysis: SnapRankRequest, onOrders: (completed: number) => void): Promise<SnapMeasuredRank> {
    const target = analysis.targets.find(target => target.scoreId === scoreId);
    if (!target || target.threshold === null) return { status: "no-threshold" };
    const run = async (evaluator: Evaluator, offset: number) => {
      if (!evaluator.startRank) throw new SnapReplayError("engine-capability", "The published replay engine does not provide rank analysis");
      const job = evaluator.startRank(scoreId, target.threshold!, analysis.powerDomain);
      try {
        let progress = job.status();
        while (progress.status === "running") {
          if (!isCurrent(revision)) throw interrupted;
          progress = job.advance(4);
          if (progress.completedOrders % 12 === 0 || progress.status !== "running") onOrders(offset + progress.completedOrders);
          await dependencies.yieldControl();
        }
        if (!isCurrent(revision)) throw interrupted;
        return progress;
      } finally { job.dispose(); }
    };
    try {
      const selectedRank = await run(selected, 0);
      if (selectedRank.status === "unsupported") return { status: "unsupported", code: selectedRank.code!, reason: selectedRank.reason! };
      try {
        const baselineRank = await run(baseline, 120);
        return { status: "complete", result: selectedRank.result!, baseline: baselineRank.result,
          ...(baselineRank.status === "unsupported" ? { baselineIssue: baselineRank.reason! } : {}) };
      } catch (error) {
        if (error === interrupted) throw error;
        return { status: "complete", result: selectedRank.result!, baseline: null,
          baselineIssue: error instanceof Error ? error.message : String(error) };
      }
    } catch (error) {
      if (error === interrupted) throw error;
      return { status: error instanceof SnapReplayError && ["unsupported", "engine-capability"].includes(error.code) ? "unsupported" : "error",
        code: error instanceof SnapReplayError ? error.code : "runtime", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async function handle(value: SnapWorkerRequest): Promise<void> {
    if (value.kind === "cancel") {
      if (activeJob === value.revision) cancelled.add(value.revision);
      return;
    }
    if (value.kind === "measure") activeJob = value.revision;
    try {
      const loaded = await load(value.source);
      if (value.kind === "catalogue") {
        post({ kind: "catalogue", revision: value.revision, catalogue: dependencies.catalogue(loaded, value.locale) });
        return;
      }
      const { revision, profile } = value;
      if (!isCurrent(revision)) { cancelled.delete(revision); post({ kind: "cancelled", revision }); return; }
      const scoreIds = [...new Set(value.scoreIds)];
      if (scoreIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new SnapReplayError("invalid-profile", "Invalid chart IDs");
      dependencies.validate(loaded, profile);
      const analysis = value.analysis;
      if (analysis && (analysis.model !== "uniformSkillOrder120" || !Number.isInteger(analysis.powerDomain.min)
        || !Number.isInteger(analysis.powerDomain.max) || analysis.powerDomain.min < 1 || analysis.powerDomain.max > 20000000
        || analysis.powerDomain.min > analysis.powerDomain.max || new Set(analysis.targets.map(target => target.scoreId)).size !== analysis.targets.length
        || analysis.targets.some(target => !Number.isSafeInteger(target.scoreId) || target.scoreId <= 0
          || target.threshold !== null && (!Number.isInteger(target.threshold) || target.threshold < 0 || target.threshold > 2147483647)))) {
        throw new SnapReplayError("invalid-profile", "Invalid rank analysis targets or power domain");
      }
      const profileKey = snapProfileKey(profile, analysis);
      const pointProfileKey = snapProfileKey(profile);
      const baselineProfile: SnapEvaluationProfile = { ...profile, selections: [null, null, null, null, null] };
      const baselineKey = JSON.stringify(baselineProfile);
      const source = { manifestSha256: loaded.manifestSha256, dataSha256: loaded.dataSha256, modelCommit: loaded.modelCommit };
      const sourceKey = JSON.stringify(source);
      let selected: Evaluator | null = null;
      let baseline: Evaluator | null = null;
      let cacheHits = 0;
      let done = 0;
      try {
        post({ kind: "progress", revision, profileKey, done, total: scoreIds.length, rows: [], source });
        for (const scoreId of scoreIds) {
          if (!isCurrent(revision)) { post({ kind: "cancelled", revision }); return; }
          try {
            const key = `${sourceKey}/${pointProfileKey}/${scoreId}`;
            const noSnapKey = `${sourceKey}/${baselineKey}/${scoreId}`;
            let result = cacheGet(key), withoutSnap = cacheGet(noSnapKey);
            if (result) cacheHits++;
            if (withoutSnap) cacheHits++;
            if (!result) {
              selected ??= dependencies.evaluator(loaded, profile);
              result = selected.evaluate(scoreId);
              cacheSet(key, result);
            }
            if (!withoutSnap) {
              baseline ??= dependencies.evaluator(loaded, baselineProfile);
              withoutSnap = baseline.evaluate(scoreId);
              cacheSet(noSnapKey, withoutSnap);
            }
            if (!Number.isSafeInteger(result.score) || !Number.isSafeInteger(withoutSnap.score) || !Number.isSafeInteger(result.score - withoutSnap.score)) {
              throw new SnapReplayError("identity", "Replay score exceeds exact browser integer range");
            }
            const row: SnapMeasuredRow = { scoreId, score: result.score, baselineScore: withoutSnap.score,
              delta: result.score - withoutSnap.score, life: result.life, combo: result.combo,
              randomDraws: result.randomDraws, convertedJudgements: result.convertedJudgements };
            const target = analysis?.targets.find(target => target.scoreId === scoreId);
            if (analysis && target) {
              const rankKey = `${sourceKey}/${snapProfileKey(profile, { ...analysis, targets: [target] })}/${scoreId}`;
              let rank = rankCache.get(rankKey);
              if (rank) { cacheHits++; rankCache.delete(rankKey); rankCache.set(rankKey, rank); }
              else {
                selected ??= dependencies.evaluator(loaded, profile);
                baseline ??= dependencies.evaluator(loaded, baselineProfile);
                rank = await rankPair(revision, selected, baseline, scoreId, analysis, completed => {
                  post({ kind: "progress", revision, profileKey, done, total: scoreIds.length, rows: [], source, orderProgress: { completed, total: 240 } });
                });
                if (rank.status !== "error") {
                  rankCache.set(rankKey, rank);
                  while (rankCache.size > cacheLimit) rankCache.delete(rankCache.keys().next().value!);
                }
              }
              row.rank = rank;
            }
            if (!isCurrent(revision)) { post({ kind: "cancelled", revision }); return; }
            done++;
            post({ kind: "progress", revision, profileKey, done, total: scoreIds.length, rows: [row], source });
          } catch (error) {
            if (error === interrupted) throw error;
            if (!isCurrent(revision)) { post({ kind: "cancelled", revision }); return; }
            const code = error instanceof SnapReplayError ? error.code : "runtime";
            const message = error instanceof Error ? error.message : String(error);
            const row: SnapMeasuredRow = { scoreId, score: null, baselineScore: null, delta: null,
              life: null, combo: null, randomDraws: null, convertedJudgements: null, error: { code, message },
              ...(analysis?.targets.some(target => target.scoreId === scoreId) ? { rank: { status: code === "unsupported" || code === "engine-capability" ? "unsupported" as const : "error" as const, code, reason: message } } : {}) };
            done++;
            post({ kind: "progress", revision, profileKey, done, total: scoreIds.length, rows: [row], source });
          }
          // Each paired result is atomic. Yield between charts so new profiles/cancel
          // messages can stop further work instead of queueing behind a whole pool.
          await dependencies.yieldControl();
        }
        if (isCurrent(revision)) {
          post({ kind: "complete", revision, profileKey, done, total: scoreIds.length, source, cacheHits });
          activeJob = 0;
        } else post({ kind: "cancelled", revision });
      } finally {
        selected?.dispose();
        baseline?.dispose();
        if (cancelled.has(revision) && activeJob === revision) activeJob = 0;
        cancelled.delete(revision);
      }
    } catch (error: unknown) {
      if (error === interrupted) { cancelled.delete(value.revision); post({ kind: "cancelled", revision: value.revision }); return; }
      const code = error instanceof SnapReplayError ? error.code : "runtime";
      if (value.kind === "catalogue" || isCurrent(value.revision)) post({ kind: "error", phase: value.kind === "catalogue" ? "catalogue" : "measure",
        revision: value.revision, code, message: error instanceof Error ? error.message : String(error) });
      cancelled.delete(value.revision);
      if (value.kind === "measure" && activeJob === value.revision) activeJob = 0;
    }
  }
  return { handle, cacheSize: () => cache.size };
}

// Importable for protocol tests, with no browser-main-thread handlers or scores.
if (typeof document === "undefined" && typeof self !== "undefined" && typeof self.postMessage === "function") {
  const transport = createSnapWorkerHandler((message) => self.postMessage(message));
  self.onmessage = (event: MessageEvent<SnapWorkerRequest>) => { void transport.handle(event.data); };
}
