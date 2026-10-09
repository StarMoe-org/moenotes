/** Inputs to the shared Rust replay. These types contain no scoring rules. */
export type SnapSkillKind = "support" | "gekisou-support";
export interface SnapSkillSelection { kind: SnapSkillKind; skillId: number; level: number; cardId?: number }
export type FiveSlots<T> = readonly [T, T, T, T, T];
export type SnapRequirement = "paired-member" | "gekisou-mode" | "paired-gekisou-skill" | "raw-timing" | "missing-dependency";
export interface SnapSkillChoice extends SnapSkillSelection {
  key: string;
  name: string;
  description: string;
  iconUrl?: string;
  searchTerms: string[];
  cardIds: number[];
  rankBindings: Array<{ cardId: number; rank: number; binding: 1 | 2 }>;
  effectTypes: number[];
  requirements: SnapRequirement[];
  status: "supported" | "needs-context" | "unsupported";
}
export interface SnapTable { columns: string[]; rows: unknown[][] }
export interface SnapDeckData {
  format: string;
  provenance: Record<string, unknown>;
  master: Record<string, SnapTable>;
  charts: unknown[];
}
export interface SnapMemberContext {
  memberId?: number;
  bandId: number;
  characterId: number;
  cardType: number;
  tagIds: number[];
  liveSkillCategories: number[];
  gekisouSkillCategories: number[];
  gekisouMissionType: number;
  gekisouSkill: readonly [number, number] | null;
}
export interface SnapReplayResource { url: string; sha256: string; bytes?: number }
export interface SnapReplayReference { format: string; manifestUrl: string; sha256: string }
export interface SnapReplayManifest {
  format: string;
  deckData: SnapReplayResource;
  /** Optional same-snapshot full labels/card artwork metadata, SHA-bound by this manifest. */
  snapLabels?: SnapReplayResource;
  engine: { model: { commit: string }; requestFormat: string; js: SnapReplayResource; wasm: SnapReplayResource };
}
export interface SnapReplayEngine {
  template(scoreId: number, power: number, fps: number): string;
  describeChart(scoreId: number): string;
  run(request: string): string;
  startRankAnalysis?(request: string): SnapReplayRankJob;
  free?(): void;
}
export interface SnapReplayResult {
  format: string;
  scoreId: number;
  complete: boolean;
  score: number;
  life: number;
  combo: number;
  randomDraws: number;
  convertedJudgements: number;
}
export interface SnapReplayRankJob {
  advance(maxOrders: number): string;
  status(): string;
  free(): void;
}
export interface SnapPowerDomain { min: number; max: number }
export type SnapRequiredPower =
  | { status: "exact"; power: number; scoreSum: number; previousScoreSum: number | null }
  | { status: "outsideDomain" }
  | { status: "unproven"; reason: string };
export interface SnapRankResult {
  scoreId: number;
  power: number;
  threshold: number;
  orderModel: "uniformSkillOrder120";
  orderScores: number[];
  scoreSum: number;
  orderCount: 120;
  minScore: number;
  maxScore: number;
  targetHitCount: number;
  need: SnapRequiredPower;
  powerDomain: SnapPowerDomain;
}
export interface SnapRankProgress {
  format: "ournotes.replay-rank-result/1";
  status: "running" | "complete" | "unsupported";
  completedOrders: number;
  totalOrders: 120;
  result: SnapRankResult | null;
  code: string | null;
  reason: string | null;
}
export interface SnapEvaluationProfile {
  /** Declared synthetic plain score-up skills, duration exactly 5s. */
  memberSkillPercent: FiveSlots<number>;
  selections: FiveSlots<SnapSkillSelection | null>;
  /** Explicit member predicates for conditional Snap skills, never inferred from power. */
  pairedMembers: FiveSlots<SnapMemberContext | null>;
  power: number;
  mode: { kind: "normal" } | { kind: "fixedSoloGekisou"; ranks: readonly [number, number, number] };
  seed: number;
  fps: 30 | 60 | 120;
  greatFraction: number;
  justFraction: number;
  /** Physical slots stay fixed; this permutation changes only skill execution order. */
  skillOrder: FiveSlots<number>;
}
