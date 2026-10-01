/**
 * The parts of nnnotes' music-data.json (`nnnotes.music-data/1`, deck statistics `ournotes-deck.chart-stats/2`) that
 * the chart data tool reads. The file comes from the network, so every field is optional and readers check what
 * they use; unknown keys are ignored, as the format's versioning rules ask.
 */

/** A text in every language of the file: `{ja, en, "zh-Hant", "zh-Hans", ko}`. */
export type DataText = Readonly<Record<string, string | undefined>>;

export interface ReplayReference {
  format: "nnnotes.replay-manifest/1";
  manifestUrl: string;
  sha256: string;
  charts: number;
}

export interface DataBand {
  id: number;
  name?: DataText | null;
  mainColor?: string;
  subColor?: string;
}

export interface DataScoreRank {
  rank: string;
  requiredScore: number;
  battleRequiredScore?: number;
}

export interface DataBgm {
  soundId?: number;
  cueSheet?: string;
  cue?: string;
  length?: { lengthMs?: number | null; samples?: number; sampleRate?: number; durationMs?: number | null } | null;
}

/** One Gekisou range of a chart's deck statistics. */
export interface DeckRange {
  index?: number;
  mission?: number;
  startMs?: number;
  endMs?: number;
  /** The rank 1 bonus percentage (`rankBonusPercents[0]`). */
  rankBonusPercent?: number;
  /** The rank bonus percentages of ranks 1..5 of the song's mission pattern (MasterLiveGekisouRankingScoreBonus). */
  rankBonusPercents?: readonly number[];
}

/** One seed's measurement of a range. */
export interface DeckSeedRange {
  rangeScore?: number;
  rankBonus?: number;
  /** `rangeScore` on the Perfect play (every Just judged Perfect). */
  rangeScorePerfect?: number;
  /** The range's largest Gekisou combo: what a combo mission range ranks the room by. */
  maxCombo?: number;
  /** The range's Just count: what a Just mission range ranks the room by. */
  justCount?: number;
  /** The range's luck points (TotalBonusPoint): what a luck mission range ranks the room by; missing in older files. */
  luckPoints?: number;
  /** Lot results: Miss, Hit, Super Hit, Critical. */
  lotResults?: readonly number[];
}

export interface DeckSeed {
  seed?: number;
  /** The no-skill score at the measurement power (with Gekisou on, the rank 1 bonuses included). */
  score: number;
  /** `score` on the Perfect play (every Just judged Perfect; rank 1 bonuses included). */
  scorePerfect?: number;
  /**
   * `weights[kind][position]`: the score a factor-1 effect of the kind at the position adds, per unit of power; a kind
   * null in `offSeeds` when its conditions read the Gekisou state.
   */
  weights: ReadonlyArray<readonly (number | null)[] | null | undefined>;
  ranges?: readonly DeckSeedRange[];
  /**
   * `rangeWeights[kind][position][range]`: the range points per unit of deck power and of factor; null for overlapping
   * ranges, a kind null when its conditions read the confirmed rank.
   */
  rangeWeights?: ReadonlyArray<ReadonlyArray<readonly (number | null)[] | null> | null | undefined> | null;
  check?: unknown;
  rankCheck?: unknown;
}

export interface ChartDeck {
  convertedNoteCount?: number;
  skip?: number | null;
  /** `[position, timeMs]` per skill event, in chart order. */
  events?: ReadonlyArray<readonly [number, number]>;
  positions?: number;
  ranges?: readonly DeckRange[];
  justNotes?: number;
  seeds?: readonly DeckSeed[];
  /** Gekisou off (Free Live, Challenge Live): one seed, without range fields. */
  offSeeds?: readonly DeckSeed[];
  unplayable?: string | null;
  /**
   * The chart's aptitude for every Gekisou skill (each taken alone); null when the chart cannot play with Gekisou on,
   * has no Gekisou range or the master has no Gekisou skills; missing in files made before it.
   */
  gekisouAptitude?: ChartAptitude | null;
}

/** A mean over seeds and its standard error (sample standard deviation / √n); se 0 for a seed-independent figure. */
export type MeanSe = readonly [number, number];

/** A chart factor of a Gekisou range: what the chart and a no-skill run give, to read the aptitude by. */
export interface RangeFactors {
  /** Judged notes in the range's score frames (after the Start frame, up to the End frame). */
  judgedNotes?: number;
  /** Of them judged Just (0 outside Just mission ranges). */
  justNotes?: number;
  /** Judged Perfect in a Just mission range: judgement types without a Just row (0 outside Just ranges). */
  perfectNotes?: number;
  /** Judged after the End frame up to the Complete frame: moved by the range's skills, not in its range score. */
  tailNotes?: number;
  /** The combo when the range starts. */
  comboAtStart?: number;
  /** The range's lotteries without skills over `deck.seeds` ([0, 0] outside luck ranges). */
  lotteries?: MeanSe;
}

/** One range of an aptitude variant: the gains in the range, every one a [mean, se]. */
export interface VariantRange {
  rangeScore?: MeanSe;
  /** At rank 1. */
  rankBonus?: MeanSe;
  rangeScorePerfect?: MeanSe;
  maxCombo?: MeanSe;
  justCount?: MeanSe;
  luckPoints?: MeanSe;
}

/**
 * One Gekisou skill shape taken alone on the chart: the gains (with it minus without, same seeds and play, points at
 * the measurement power), every one a [mean, se].
 */
export interface AptitudeVariant {
  /** `deck.gekisouAptitude.shapes[].id` of the file. */
  shape: number;
  /** A support skill's band condition held (true) or not (false) for its member; null without one. */
  bandMatch?: boolean | null;
  /** The gains do not depend on the seed (one seed reported, se 0). */
  deterministic?: boolean;
  seeds?: number;
  /** The standard error met the seed rule's target. */
  seTargetMet?: boolean;
  /** The seeds of the cross terms (`weights`, `rangeWeights`). */
  crossSeeds?: number;
  /** Rank 1, the Just play, rank bonuses included. */
  score?: MeanSe;
  /** Rank 1, the Perfect play (every Just judged Perfect). */
  scorePerfect?: MeanSe;
  /** The gain outside the ranges: score − Σ_j (rangeScore_j + rankBonus_j). */
  tail?: MeanSe;
  tailPerfect?: MeanSe;
  /** Judgement conversions (13005 and the like). */
  converted?: MeanSe;
  ranges?: readonly VariantRange[];
  /** The plain kind's weight change per performance position (`deck.seeds[i].weights[plainKind][k]`'s unit). */
  weights?: readonly MeanSe[] | null;
  /** The plain kind's range weight change `[position][range]`; null where the ranks do not follow the linear formula. */
  rangeWeights?: ReadonlyArray<readonly MeanSe[]> | null;
  check?: unknown;
}

export interface ChartAptitude {
  /** One per deck range. */
  factors?: readonly RangeFactors[];
  variants?: readonly AptitudeVariant[];
}

/** A (skill, level) of a shape. */
export interface ShapeSkill {
  id: number;
  level: number;
  /** Condition 5000's target members; null without a band condition. */
  memberTargetIds?: readonly number[] | null;
  /** Their bands. */
  bandIds?: readonly number[] | null;
}

/** A class of Gekisou skills whose score-relevant effect parameters are the same. */
export interface AptitudeShape {
  id: number;
  /** "member" (a member card's Gekisou skill) or "support" (a snap's Gekisou support skill). */
  source?: string;
  /** 1 combo, 2 luck, 3 Just, 4 every mission. */
  mission?: number;
  bandCondition?: boolean;
  effects?: readonly unknown[];
  skills?: readonly ShapeSkill[];
}

/** The file's aptitude header (`deck.gekisouAptitude`). */
export interface FileAptitude {
  plainKind?: number | null;
  host?: string;
  seedRule?: { deterministicTest?: number; batches?: readonly number[]; relative?: number; baseline?: number; crossSeeds?: number } | null;
  shapes?: readonly AptitudeShape[];
}

/** A Gekisou skill or support skill of `gekisouCatalog`. */
export interface CatalogSkill {
  id: number;
  mission?: number;
  maxLevel?: number;
  name?: DataText | null;
  description?: DataText | null;
}

/** Same-snapshot member and Snap card labels used when the full replay label sidecar is absent. */
export interface CatalogCard {
  id: number;
  name?: DataText | null;
  subtitle?: DataText | null;
}

/** The Gekisou skill names and optional source card labels (top-level `gekisouCatalog`). */
export interface GekisouCatalog {
  skills?: readonly CatalogSkill[];
  supportSkills?: readonly CatalogSkill[];
  members?: readonly CatalogCard[];
  snaps?: readonly CatalogCard[];
}

export interface DataChart {
  difficulty: string;
  scoreId: number;
  level: number;
  displayLevel?: number;
  fullComboCount?: number;
  notes?: { judged?: number; total?: number; byOperateType?: Readonly<Record<string, number>> } | null;
  bpm?: { main?: number; min?: number; max?: number; changes?: ReadonlyArray<{ timeMs: number; bpm: number }> } | null;
  firstNoteMs?: number;
  lastJudgedNoteMs?: number;
  lastNoteMs?: number;
  musicLengthMs?: number;
  skillEventsMs?: readonly number[];
  fevers?: ReadonlyArray<readonly [number, number]>;
  deck?: ChartDeck | null;
}

export interface DataSong {
  id: number;
  title?: DataText | null;
  ruby?: DataText | null;
  phonetic?: DataText | null;
  bandIds?: readonly number[];
  bandName?: DataText | null;
  lyricist?: DataText | null;
  composer?: DataText | null;
  arranger?: DataText | null;
  musicType?: number;
  jacket?: string;
  gekisouMissions?: readonly number[];
  bgm?: DataBgm | null;
  scoreRanks?: readonly DataScoreRank[];
  charts?: readonly DataChart[];
}

/** A score-up kind of `deck.kinds`: one grouping of MasterLiveSkillEffect rows. */
export interface DeckKind {
  id: number;
  effectType?: number;
  activationTimeSecond?: number;
  durationMs?: number;
  skillTargetIds?: readonly number[];
  skillConditionGroup?: number;
  skillReleaseConditionGroup?: number;
  effectLimitCount?: number;
  effectExecuteLimitCount?: number;
}

export interface DataProvenance {
  developmentSample?: string;
  localModel?: { gitHead?: string; workingTreeDirty?: boolean; sourceTreeSha256?: string; executableSha256?: string };
  region?: string;
  client?: { versionName?: string | null; versionCode?: number | null } | null;
  master?: { source?: string; version?: string } | null;
  deck?: { name?: string; version?: string; source?: string; commit?: string; format?: string } | null;
}

export interface MusicData {
  format?: string;
  /** Resources belong to this music-data snapshot and are SHA-verified before replay. */
  replay?: ReplayReference;
  provenance?: DataProvenance;
  languages?: readonly string[];
  bands?: readonly DataBand[];
  deck?: { model?: { power?: number } | null; kinds?: readonly DeckKind[]; gekisouAptitude?: FileAptitude | null } | null;
  gekisouCatalog?: GekisouCatalog | null;
  songs?: readonly DataSong[];
}
