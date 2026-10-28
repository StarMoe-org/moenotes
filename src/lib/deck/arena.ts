import { parseMasterDate } from "@/lib/schedule";

export type DeckArenaRuleSource = "auto" | "custom";
export type DeckArenaMode = "shared" | "individual";
export type DeckArenaMissions = readonly [number, number, number];

export interface DeckArenaRule {
  bandId: number;
  /** 0 = song's own attribute, 1..5 = specific attribute, 99 = All attributes. */
  musicType: number;
  /** Per-range Gekisou mission override: 0 = song's own, 1 = Combo, 2 = Luck, 3 = Just count. */
  missions: DeckArenaMissions;
  mode?: DeckArenaMode;
}

export interface DeckSongRules {
  /** 0 = song's own attribute, 1..5 = specific attribute, 99 = All attributes. */
  musicType: number;
  /** Per-range Gekisou mission override: 0 = song's own, 1 = Combo, 2 = Luck, 3 = Just count. */
  missions: DeckArenaMissions;
}

export const DEFAULT_SONG_RULES: DeckSongRules = {
  musicType: 0,
  missions: [0, 0, 0],
};

export function isValidSongRules(value: unknown): value is DeckSongRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const typeOk = typeof raw.musicType === "number" && Number.isInteger(raw.musicType)
    && ((raw.musicType >= 0 && raw.musicType <= 5) || raw.musicType === 99);
  const missionsOk = Array.isArray(raw.missions) && raw.missions.length === 3
    && raw.missions.every((m) => typeof m === "number" && Number.isInteger(m) && m >= 0 && m <= 3);
  return typeOk && missionsOk;
}

/** Active non-default song rule overrides; non-Gekisou modes strip Gekisou range missions to `[0, 0, 0]`. */
export function activeSongRules(
  rule: DeckSongRules | null | undefined,
  gekiso: boolean,
): { musicType: number; missions: [number, number, number] } | undefined {
  if (!rule || !isValidSongRules(rule)) return undefined;
  const missions: [number, number, number] = gekiso
    ? [rule.missions[0], rule.missions[1], rule.missions[2]]
    : [0, 0, 0];
  return rule.musicType !== 0 || missions.some((m) => m !== 0)
    ? { musicType: rule.musicType, missions }
    : undefined;
}

export interface DeckArenaSeason {
  id: number;
  name?: string;
  startAt: string;
  endAt: string;
}

export interface DeckArenaLeague {
  id: number;
  bandId: number;
  startAt?: string;
}

export interface DeckArenaRegulation {
  id: number;
  seasonId?: number;
  leagueId: number;
  musicType: number;
  missions: [number, number, number];
  startAt: string;
  endAt: string;
}

export interface DeckArenaCatalog {
  seasons: readonly DeckArenaSeason[];
  leagues: readonly DeckArenaLeague[];
  regulations: readonly DeckArenaRegulation[];
}

export const ARENA_BAND_IDS = [1, 2, 3, 4, 5] as const;
export const ARENA_MUSIC_TYPES = [0, 99, 1, 2, 3, 4, 5] as const;
export const ARENA_MISSION_TYPES = [0, 1, 2, 3] as const;
export const DEFAULT_ARENA_RULE: DeckArenaRule = {
  bandId: 1,
  musicType: 0,
  missions: [0, 0, 0],
  mode: "shared",
};

function endInstant(date: string): number | null {
  const parsed = parseMasterDate(date);
  return parsed === null ? null : parsed + 1000;
}

export interface DeckArenaPeriod {
  season: DeckArenaSeason | null;
  regulation: DeckArenaRegulation | null;
  nextAt: number | null;
}

/** Active season, active league regulation, and next schedule boundary at `now` (epoch ms). */
export function arenaPeriod(
  catalog: DeckArenaCatalog | null | undefined,
  leagueId: number,
  now: number,
): DeckArenaPeriod {
  if (!catalog) return { season: null, regulation: null, nextAt: null };
  const season = catalog.seasons.find((row) => {
    const start = parseMasterDate(row.startAt);
    const end = endInstant(row.endAt);
    return start !== null && end !== null && start <= now && now < end;
  }) ?? null;
  const regulation = season
    ? (catalog.regulations
        .filter((row) => {
          if (row.leagueId !== leagueId) return false;
          const start = parseMasterDate(row.startAt);
          const end = endInstant(row.endAt);
          return start !== null && end !== null && start <= now && now < end;
        })
        .sort((a, b) => (parseMasterDate(b.startAt) ?? 0) - (parseMasterDate(a.startAt) ?? 0))[0] ?? null)
    : null;
  const transitions = [
    ...catalog.seasons.flatMap((row) => [parseMasterDate(row.startAt), endInstant(row.endAt)]),
    ...catalog.regulations
      .filter((row) => row.leagueId === leagueId)
      .flatMap((row) => [parseMasterDate(row.startAt), endInstant(row.endAt)]),
  ].filter((time): time is number => time !== null && time > now);
  return {
    season,
    regulation,
    nextAt: transitions.length ? Math.min(...transitions) : null,
  };
}

/** Resolve the effective `DeckArenaRule` from either the live schedule (`auto`) or user overrides (`custom`). */
export function resolveArenaRule(options: {
  catalog: DeckArenaCatalog | null | undefined;
  ruleSource: DeckArenaRuleSource;
  leagueId: number;
  customBandId: number;
  customMusicType: number;
  customMissions: DeckArenaMissions;
  mode: DeckArenaMode;
  now: number;
}): { period: DeckArenaPeriod; rule: DeckArenaRule | null } {
  const period = arenaPeriod(options.catalog, options.leagueId, options.now);
  if (options.ruleSource === "custom") {
    return {
      period,
      rule: {
        bandId: options.customBandId,
        musicType: options.customMusicType,
        missions: [options.customMissions[0], options.customMissions[1], options.customMissions[2]],
        mode: options.mode,
      },
    };
  }
  const league = options.catalog?.leagues.find((row) => row.id === options.leagueId) ?? null;
  if (!league || !period.season || !period.regulation) {
    return { period, rule: null };
  }
  return {
    period,
    rule: {
      bandId: league.bandId,
      musicType: period.regulation.musicType,
      missions: [period.regulation.missions[0], period.regulation.missions[1], period.regulation.missions[2]],
      mode: options.mode,
    },
  };
}

export function isValidArenaRule(value: unknown): value is DeckArenaRule {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  const bandOk = typeof raw.bandId === "number" && Number.isInteger(raw.bandId) && raw.bandId >= 1 && raw.bandId <= 5;
  const typeOk = typeof raw.musicType === "number" && Number.isInteger(raw.musicType) && ((raw.musicType >= 0 && raw.musicType <= 5) || raw.musicType === 99);
  const missionsOk = Array.isArray(raw.missions) && raw.missions.length === 3
    && raw.missions.every((m) => typeof m === "number" && Number.isInteger(m) && m >= 0 && m <= 3);
  const modeOk = raw.mode === undefined || raw.mode === "shared" || raw.mode === "individual";
  return bandOk && typeOk && missionsOk && modeOk;
}

/** Whether a song belongs to the league band and has been released by `now`. */
export function arenaSongMatchesBand(
  song: { bandId: number; bandIds?: readonly number[]; startAt?: string },
  bandId: number,
  now?: number,
): boolean {
  const inBand = song.bandIds && song.bandIds.length > 0
    ? song.bandIds.includes(bandId)
    : song.bandId === bandId;
  if (!inBand) return false;
  if (now !== undefined && song.startAt) {
    const releasedAt = parseMasterDate(song.startAt);
    if (releasedAt !== null && releasedAt > now) return false;
  }
  return true;
}

/** Effective attribute and Gekisou missions of a song under an Arena rule. */
export function effectiveArenaSongRule(
  song: { musicType: number; gekisouMissions?: readonly number[] },
  rule: Pick<DeckArenaRule, "musicType" | "missions">,
): { musicType: number; missions: [number, number, number] } {
  const base = song.gekisouMissions ?? [];
  return {
    musicType: rule.musicType || song.musicType,
    missions: [
      rule.missions[0] || base[0] || 0,
      rule.missions[1] || base[1] || 0,
      rule.missions[2] || base[2] || 0,
    ],
  };
}
