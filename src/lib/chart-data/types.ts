/**
 * The parts of nnnotes' music-data.json (`nnnotes.music-data/1`, deck statistics `ournotes-deck.chart-stats/2`) that
 * the chart data tool reads. The file comes from the network, so every field is optional and readers check what
 * they use; unknown keys are ignored, as the format's versioning rules ask.
 */

/** A text in every language of the file: `{ja, en, "zh-Hant", "zh-Hans", ko}`. */
export type DataText = Readonly<Record<string, string | undefined>>;

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
  /** The solo (rank 1) bonus percentage of the song's mission pattern. */
  rankBonusPercent?: number;
  /** Proposed: the bonus percentage by rank (index 0 = rank 1 .. 4 = rank 5). */
  rankBonusPercents?: readonly number[];
}

/** One seed's measurement of a range. */
export interface DeckSeedRange {
  rangeScore?: number;
  rankBonus?: number;
  maxCombo?: number;
  justCount?: number;
  lotResults?: readonly number[];
}

export interface DeckSeed {
  seed?: number;
  /** The no-skill score at the measurement power. */
  score: number;
  /** `weights[kind][position]`: the score a factor-1 effect of the kind at the position adds, per unit of power. */
  weights: ReadonlyArray<readonly number[] | undefined>;
  ranges?: readonly DeckSeedRange[];
  /** Proposed: `rangeWeights[kind][position][range]`, the part of the weight scored inside each range, per unit of power. */
  rangeWeights?: ReadonlyArray<ReadonlyArray<readonly number[]> | undefined>;
  check?: unknown;
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
  /** Proposed: the same measurement with Gekisou off (free lives), without range fields. */
  offSeeds?: readonly DeckSeed[];
  unplayable?: string | null;
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
  region?: string;
  client?: { versionName?: string | null; versionCode?: number | null } | null;
  master?: { source?: string; version?: string } | null;
  deck?: { name?: string; version?: string; source?: string; commit?: string; format?: string } | null;
}

export interface MusicData {
  format?: string;
  provenance?: DataProvenance;
  languages?: readonly string[];
  bands?: readonly DataBand[];
  deck?: { model?: { power?: number } | null; kinds?: readonly DeckKind[] } | null;
  songs?: readonly DataSong[];
}
