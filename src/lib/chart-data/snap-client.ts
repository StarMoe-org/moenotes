import type { AppLocale } from "@/config/locales";
import type { SnapLabelSource } from "./snap-labels";
import type { SnapDeckData, SnapEvaluationProfile, SnapPowerDomain, SnapRankResult, SnapReplayReference, SnapSkillChoice } from "./snap-types";
import type { MusicData } from "./types";

export interface SnapRankingSource {
  site: string;
  reference: SnapReplayReference;
  expected: { region: string; masterVersion: string; modelCommit: string };
}
export interface SnapMeasurementSource { manifestSha256: string; dataSha256: string; modelCommit: string }
export interface SnapRankingCatalogue {
  choices: SnapSkillChoice[];
  /** A same-source metadata projection. Chart inputs stay in the Worker. */
  data: SnapDeckData;
  labelSource?: SnapLabelSource;
  source: SnapMeasurementSource;
}

/** Reject late catalogue projections before invoking source-bound view model builders. */
export function isCurrentSnapCatalogue(catalogue: SnapRankingCatalogue | null, music: MusicData | null): catalogue is SnapRankingCatalogue {
  const master = catalogue?.data.provenance.master as { version?: string } | undefined;
  const model = catalogue?.data.provenance.deck as { commit?: string } | undefined;
  return !!catalogue && !!music?.replay && catalogue.source.manifestSha256 === music.replay.sha256
    && catalogue.data.provenance.region === music.provenance?.region
    && master?.version === music.provenance?.master?.version && model?.commit === music.provenance?.deck?.commit;
}
export interface SnapRankRequest {
  model: "uniformSkillOrder120";
  target: string;
  powerDomain: SnapPowerDomain;
  targets: readonly { scoreId: number; threshold: number | null }[];
}
export type SnapMeasuredRank =
  | { status: "complete"; result: SnapRankResult; baseline: SnapRankResult | null; baselineIssue?: string }
  | { status: "unsupported" | "error"; code: string; reason: string }
  | { status: "no-threshold" };
export interface SnapMeasuredRow {
  scoreId: number;
  score: number | null;
  baselineScore: number | null;
  delta: number | null;
  life: number | null;
  combo: number | null;
  randomDraws: number | null;
  convertedJudgements: number | null;
  error?: { code: string; message: string };
  rank?: SnapMeasuredRank;
}
export type SnapRankingStatus = "idle" | "loading" | "running" | "complete" | "needs-context" | "unsupported" | "error";
export interface SnapRankingState {
  status: SnapRankingStatus;
  revision: number;
  profileKey: string;
  sourceKey: string;
  done: number;
  total: number;
  orderProgress?: { completed: number; total: number } | null;
  rows: ReadonlyMap<number, SnapMeasuredRow>;
  source?: SnapMeasurementSource;
  error?: { code: string; message: string };
}
export type SnapWorkerRequest =
  | { kind: "catalogue"; revision: number; source: SnapRankingSource; locale: AppLocale }
  | { kind: "measure"; revision: number; source: SnapRankingSource; profile: SnapEvaluationProfile; scoreIds: readonly number[]; analysis?: SnapRankRequest }
  | { kind: "cancel"; revision: number };
export type SnapWorkerResponse =
  | { kind: "catalogue"; revision: number; catalogue: SnapRankingCatalogue }
  | { kind: "progress"; revision: number; profileKey: string; done: number; total: number; rows: SnapMeasuredRow[]; source: SnapMeasurementSource; orderProgress?: { completed: number; total: number } }
  | { kind: "complete"; revision: number; profileKey: string; done: number; total: number; source: SnapMeasurementSource; cacheHits: number }
  | { kind: "cancelled"; revision: number }
  | { kind: "error"; revision: number; phase: "catalogue" | "measure"; code: string; message: string };

/** Conservative identity: changes in any declared input invalidate displayed rows. */
export const snapProfileKey = (profile: SnapEvaluationProfile, analysis?: SnapRankRequest): string => JSON.stringify(analysis ? { profile, analysis } : profile);
export const snapSourceKey = (source: SnapRankingSource): string => JSON.stringify(source);
export function currentSnapRanking(profile: SnapEvaluationProfile, source: SnapRankingSource | null, measurement: SnapRankingState, analysis?: SnapRankRequest): SnapRankingState | null {
  if (!source || measurement.profileKey !== snapProfileKey(profile, analysis) || measurement.sourceKey !== snapSourceKey(source)
    || (measurement.source && measurement.source.manifestSha256 !== source.reference.sha256)) return null;
  return measurement;
}
export const emptySnapRanking = (profileKey = "", revision = 0): SnapRankingState => ({ status: "idle", revision, profileKey, sourceKey: "", done: 0, total: 0, rows: new Map() });

export interface SnapWorkerPort {
  postMessage(message: SnapWorkerRequest): void;
  addEventListener(type: "message", listener: (event: MessageEvent<SnapWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<SnapWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

/** Revisions protect both catalogue loads and chart jobs from late Worker messages. */
export class SnapRankingClient {
  private revision = 0;
  private catalogueRevision = 0;
  private jobRevision = 0;
  private state = emptySnapRanking();
  private disposed = false;
  constructor(
    private readonly onState: (state: SnapRankingState) => void,
    private readonly onCatalogue: (catalogue: SnapRankingCatalogue) => void,
    private readonly worker: SnapWorkerPort = new Worker(new URL("./snap-worker.ts", import.meta.url), { type: "module" }),
    private readonly onCatalogueError?: (error: { code: string; message: string }) => void,
  ) {
    worker.addEventListener("message", this.message);
    worker.addEventListener("error", this.workerError);
  }
  loadCatalogue(source: SnapRankingSource, locale: AppLocale): void {
    if (this.disposed) return;
    this.catalogueRevision = ++this.revision;
    this.worker.postMessage({ kind: "catalogue", revision: this.catalogueRevision, source, locale });
  }
  measure(source: SnapRankingSource, profile: SnapEvaluationProfile, scoreIds: readonly number[], analysis?: SnapRankRequest): void {
    if (this.disposed) return;
    this.cancel();
    this.jobRevision = ++this.revision;
    this.state = { status: "loading", revision: this.jobRevision, profileKey: snapProfileKey(profile, analysis), sourceKey: snapSourceKey(source), done: 0,
      total: new Set(scoreIds).size, rows: new Map() };
    this.onState(this.state);
    this.worker.postMessage({ kind: "measure", revision: this.jobRevision, source, profile, scoreIds, ...(analysis ? { analysis } : {}) });
  }
  cancel(): void {
    if (!this.jobRevision || this.disposed) return;
    this.worker.postMessage({ kind: "cancel", revision: this.jobRevision });
    this.jobRevision = 0;
  }
  reset(): void {
    this.cancel();
    this.state = emptySnapRanking("", ++this.revision);
    if (!this.disposed) this.onState(this.state);
  }
  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.worker.removeEventListener("message", this.message);
    this.worker.removeEventListener("error", this.workerError);
    this.worker.terminate();
  }
  private message = (event: MessageEvent<SnapWorkerResponse>): void => {
    if (this.disposed) return;
    const value = event.data;
    if (value.kind === "catalogue") {
      if (value.revision === this.catalogueRevision) this.onCatalogue(value.catalogue);
      return;
    }
    if (value.kind === "error" && value.phase === "catalogue") {
      if (value.revision === this.catalogueRevision) this.onCatalogueError?.(value);
      return;
    }
    if (!this.jobRevision || value.revision !== this.jobRevision) return;
    if (value.kind === "error") {
      const status = value.code === "needs-context" ? "needs-context" : value.code === "unsupported" ? "unsupported" : "error";
      this.state = { ...this.state, status, error: { code: value.code, message: value.message }, rows: new Map() };
    } else if (value.kind === "cancelled") {
      this.state = emptySnapRanking(this.state.profileKey, value.revision);
    } else {
      if (value.profileKey !== this.state.profileKey) return;
      const rows = new Map(this.state.rows);
      if (value.kind === "progress") for (const row of value.rows) rows.set(row.scoreId, row);
      this.state = { ...this.state, status: value.kind === "complete" ? "complete" : "running", done: value.done,
        total: value.total, rows, source: value.source, orderProgress: value.kind === "progress" ? value.orderProgress ?? null : null };
    }
    this.onState(this.state);
  };
  private workerError = (event: ErrorEvent): void => {
    if (this.disposed) return;
    const error = { code: "worker", message: event.message || "Replay Worker failed" };
    this.onCatalogueError?.(error);
    if (this.jobRevision) {
      this.state = { ...this.state, status: "error", error, rows: new Map() };
      this.onState(this.state);
    }
  };
}
