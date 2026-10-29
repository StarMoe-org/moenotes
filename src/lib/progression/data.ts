export interface RawExpRankRow {
  id?: number;
  rank: number;
  exp: number;
  bonus?: number;
}

export interface RawBandRatingRow {
  id?: number;
  rank: number;
  value: number;
}

export interface RawHighScoreRatingRow {
  id?: number;
  bandId?: number;
  bandID?: number;
  grade: number;
  step: number;
  rating: number;
}

export interface ExpRankStepViewModel {
  rank: number;
  deltaExp: number;
  cumulativeExp: number;
  bonus?: number;
}

export interface BandRatingStepViewModel {
  rank: number;
  totalRating: number;
  singleRating: number | null;
}

export type HighScoreGradeKind = "bronze" | "silver" | "gold";

export interface HighScoreRatingStepViewModel {
  key: string;
  grade: number;
  gradeKind: HighScoreGradeKind;
  step: number;
  romanStep: string;
  bandRating: number;
  totalRating: number | null;
}

export interface ProgressionReferenceViewModel {
  playerRanks: ExpRankStepViewModel[];
  characterRanks: ExpRankStepViewModel[];
  friendshipRanks: ExpRankStepViewModel[];
  bandRatings: BandRatingStepViewModel[];
  highScoreRatings: HighScoreRatingStepViewModel[];
}

export interface NormalizeProgressionInput {
  playerRanks: readonly RawExpRankRow[];
  characterRanks: readonly RawExpRankRow[];
  friendshipRanks: readonly RawExpRankRow[];
  bandRanks: readonly RawBandRatingRow[];
  bandTypeRanks: readonly RawBandRatingRow[];
  bandHighScoreRatings: readonly RawHighScoreRatingRow[];
  totalHighScoreRatings: readonly RawHighScoreRatingRow[];
}

const ROMAN_STEPS = ["", "I", "II", "III", "IV", "V"] as const;

function normalizeExpTable(rows: readonly RawExpRankRow[], includeBonus = false): ExpRankStepViewModel[] {
  const sorted = [...rows]
    .filter((row) => Number.isFinite(row.rank) && row.rank > 0 && Number.isFinite(row.exp) && row.exp >= 0)
    .sort((a, b) => a.rank - b.rank || a.exp - b.exp);

  const deduped: RawExpRankRow[] = [];
  for (const row of sorted) {
    if (deduped.at(-1)?.rank === row.rank) continue;
    deduped.push(row);
  }

  return deduped.map((row, index) => {
    const prevExp = index > 0 ? deduped[index - 1]!.exp : 0;
    const base: ExpRankStepViewModel = {
      rank: Number(row.rank),
      deltaExp: Math.max(0, Number(row.exp) - Number(prevExp)),
      cumulativeExp: Number(row.exp),
    };
    if (includeBonus && typeof row.bonus === "number" && row.bonus > 0) {
      base.bonus = row.bonus;
    }
    return base;
  });
}

function gradeKindOf(grade: number): HighScoreGradeKind {
  if (grade === 1) return "silver";
  if (grade >= 2) return "gold";
  return "bronze";
}

export function normalizeProgressionReference(input: NormalizeProgressionInput): ProgressionReferenceViewModel {
  const playerRanks = normalizeExpTable(input.playerRanks);
  const characterRanks = normalizeExpTable(input.characterRanks, true);
  const friendshipRanks = normalizeExpTable(input.friendshipRanks);

  const singleByRank = new Map<number, number>();
  for (const row of input.bandTypeRanks) {
    if (Number.isFinite(row.rank) && Number.isFinite(row.value)) {
      singleByRank.set(Number(row.rank), Number(row.value));
    }
  }
  const bandRatings: BandRatingStepViewModel[] = [...input.bandRanks]
    .filter((row) => Number.isFinite(row.rank) && row.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .map((row) => ({
      rank: Number(row.rank),
      totalRating: Number(row.value ?? 0),
      singleRating: singleByRank.get(Number(row.rank)) ?? null,
    }));

  const totalByStep = new Map<string, number>();
  for (const row of input.totalHighScoreRatings) {
    totalByStep.set(`${Number(row.grade ?? 0)}:${Number(row.step ?? 0)}`, Number(row.rating ?? 0));
  }

  const bandRows = input.bandHighScoreRatings.filter((row) => Number(row.bandId ?? row.bandID ?? 0) === 0);
  const effectiveBandRows =
    bandRows.length > 0
      ? bandRows
      : (() => {
          const seen = new Set<string>();
          return input.bandHighScoreRatings.filter((row) => {
            const key = `${Number(row.grade ?? 0)}:${Number(row.step ?? 0)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        })();

  const highScoreRatings: HighScoreRatingStepViewModel[] = [...effectiveBandRows]
    .sort((a, b) => Number(a.grade) - Number(b.grade) || Number(a.step) - Number(b.step))
    .map((row) => {
      const grade = Number(row.grade ?? 0);
      const step = Number(row.step ?? 0);
      const key = `${grade}:${step}`;
      return {
        key,
        grade,
        gradeKind: gradeKindOf(grade),
        step,
        romanStep: ROMAN_STEPS[step] ?? (step > 0 ? String(step) : ""),
        bandRating: Number(row.rating ?? 0),
        totalRating: totalByStep.get(key) ?? null,
      };
    });

  return {
    playerRanks,
    characterRanks,
    friendshipRanks,
    bandRatings,
    highScoreRatings,
  };
}

export interface ExpGapCalculation {
  fromRank: number;
  toRank: number;
  fromExp: number;
  toExp: number;
  requiredExp: number;
  remainingExp: number;
  progressFraction: number;
}

/** Calculates required EXP between `fromRank` and `toRank`, accounting for `carryExp` earned past `fromRank`. */
export function calculateExpGap(
  rows: readonly ExpRankStepViewModel[],
  fromRank: number,
  toRank: number,
  carryExp = 0,
): ExpGapCalculation | null {
  if (rows.length === 0) return null;
  const minRank = rows[0]!.rank;
  const maxRank = rows.at(-1)!.rank;
  const clampedFrom = Math.min(maxRank, Math.max(minRank, Math.trunc(fromRank)));
  const clampedTo = Math.min(maxRank, Math.max(clampedFrom, Math.trunc(toRank)));
  const startRow = rows.find((row) => row.rank === clampedFrom) ?? rows[0]!;
  const endRow = rows.find((row) => row.rank === clampedTo) ?? rows.at(-1)!;
  const requiredExp = Math.max(0, endRow.cumulativeExp - startRow.cumulativeExp);
  const validCarry = Math.max(0, Math.trunc(carryExp || 0));
  const remainingExp = Math.max(0, requiredExp - validCarry);
  const progressFraction = requiredExp === 0 ? 1 : Math.min(1, validCarry / requiredExp);
  return {
    fromRank: startRow.rank,
    toRank: endRow.rank,
    fromExp: startRow.cumulativeExp,
    toExp: endRow.cumulativeExp,
    requiredExp,
    remainingExp,
    progressFraction,
  };
}

export function hasProgressionData(data: ProgressionReferenceViewModel | null | undefined): boolean {
  if (!data) return false;
  return (
    data.playerRanks.length > 0
    || data.characterRanks.length > 0
    || data.friendshipRanks.length > 0
    || data.bandRatings.length > 0
    || data.highScoreRatings.length > 0
  );
}
