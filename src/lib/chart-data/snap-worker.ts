import { applyAccuracyPreset, parseJustJudgementTypes } from "ournotes-player/replay/preset";
import type { AppLocale } from "@/config/locales";
import { createSnapEvaluator, loadSnapReplayRuntime, SnapReplayError, validateSnapProfile, type LoadedSnapReplay } from "./snap-bridge";
import { buildSnapSkillCatalogue } from "./snap-catalogue";
import { buildSnapLabeler } from "./snap-labels";
import type { SnapMeasuredRow, SnapRankingCatalogue, SnapRankingSource, SnapWorkerRequest, SnapWorkerResponse } from "./snap-client";
import type { SnapEvaluationProfile, SnapReplayResult } from "./snap-types";

type Evaluator = { evaluate(scoreId: number): SnapReplayResult; dispose(): void };
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
      loadedPromise = dependencies.load(source).catch((error: unknown) => {
        if (loadedKey === key) loadedPromise = null;
        throw error;
      });
    }
    return loadedPromise;
  };
  const isCurrent = (revision: number) => activeJob === revision && !cancelled.has(revision);

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
      const profileKey = JSON.stringify(profile);
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
          const key = `${sourceKey}/${profileKey}/${scoreId}`;
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
          done++;
          post({ kind: "progress", revision, profileKey, done, total: scoreIds.length, rows: [row], source });
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
