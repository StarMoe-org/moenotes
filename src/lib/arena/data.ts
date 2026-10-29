import type { AppLocale } from "@/config/locales";
import type { RawBand, RawText } from "@/lib/cards/data";
import { arenaSongMatchesBand } from "@/lib/deck/arena";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MusicViewModel } from "@/lib/music/data";
import type { RawResource, RewardResolver, RewardViewModel } from "@/lib/rewards/resources";
import { parseMasterDate } from "@/lib/schedule";

export interface RawArenaSeason {
  id: number;
  nameTextId?: string;
  nameTextID?: string;
  startAt: string;
  endAt: string;
  rankingCountEndAt?: string;
}

export interface RawArenaLeague {
  id: number;
  bandId: number;
  nameTextId?: string;
  nameTextID?: string;
  startAt?: string;
}

export interface RawArenaLeagueRegulation {
  id: number;
  leagueId: number;
  liveMusicType: number;
  gekisouMission1: number;
  gekisouMission2: number;
  gekisouMission3: number;
  startAt: string;
  endAt: string;
}

export interface RawArenaRank {
  id: number;
  bandId: number;
  nameTextId?: string;
  nameTextID?: string;
  rank: number;
  division: number;
  lp: number;
}

export interface RawArenaRewardRow extends RawResource {
  id: number;
  leagueId?: number;
  rankMatchId?: number;
  arenaRankId?: number;
  rank?: number;
  lpStart?: number;
  lpEnd?: number;
  rankStart?: number;
  rankEnd?: number;
}

export interface ArenaRuleViewModel {
  id: number;
  leagueId: number;
  startAt: string;
  endAt: string;
  musicType: number;
  missions: [number, number, number];
}

export interface ArenaSongSummary {
  id: number;
  title: string;
  jacketUrl: string;
  musicType: number;
  startAt: string;
  expertLevel: number | null;
}

export interface ArenaRankStepViewModel {
  id: number;
  name: string;
  rank: number;
  division: number;
  lp: number;
  promotionRewards: RewardViewModel[];
  dailyRewards: RewardViewModel[];
}

export interface ArenaRangeRewardViewModel {
  id: number;
  leagueId: number;
  rankId: number;
  from: number;
  to: number;
  reward: RewardViewModel;
}

export interface ArenaLeagueViewModel {
  id: number;
  bandId: number;
  name: string;
  color: string;
  rules: ArenaRuleViewModel[];
  songs: ArenaSongSummary[];
  ranks: ArenaRankStepViewModel[];
}

export interface ArenaSeasonViewModel {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  rankingEndAt: string;
  leagues: ArenaLeagueViewModel[];
  dailyRewards: ArenaRangeRewardViewModel[];
  seasonRewards: ArenaRangeRewardViewModel[];
}

export interface ArenaCatalogViewModel {
  seasons: ArenaSeasonViewModel[];
}

export interface NormalizeArenaCatalogInput {
  seasons: readonly RawArenaSeason[];
  leagues: readonly RawArenaLeague[];
  regulations: readonly RawArenaLeagueRegulation[];
  ranks: readonly RawArenaRank[];
  dailyRewards: readonly RawArenaRewardRow[];
  seasonRewards: readonly RawArenaRewardRow[];
  promotionRewards: readonly RawArenaRewardRow[];
  bands: readonly RawBand[];
  songs: readonly MusicViewModel[];
  texts: readonly RawText[];
  resolveReward: RewardResolver;
  locale: AppLocale;
}

function endInstant(date: string): number | null {
  const parsed = parseMasterDate(date);
  return parsed === null ? null : parsed + 1000;
}

function toRangeReward(row: RawArenaRewardRow, resolveReward: RewardResolver): ArenaRangeRewardViewModel {
  const rankId = Number(row.rankMatchId ?? row.arenaRankId ?? row.rank ?? 0);
  const from = Number(row.lpStart ?? row.rankStart ?? 0);
  const to = Number(row.lpEnd ?? row.rankEnd ?? 0);
  return {
    id: Number(row.id ?? 0),
    leagueId: Number(row.leagueId ?? 0),
    rankId,
    from,
    to,
    reward: resolveReward({
      resourceType: Number(row.resourceType ?? 0),
      resourceId: Number(row.resourceId ?? 0),
      resourceCount: Number(row.resourceCount ?? 0),
    }),
  };
}

export function normalizeArenaCatalog(input: NormalizeArenaCatalogInput): ArenaCatalogViewModel {
  if (input.seasons.length === 0) return { seasons: [] };

  const textMap = new Map(input.texts.map((row) => [row.id, row]));
  const textOf = (key: string | undefined): string => (key ? localizeMasterText(textMap.get(key), input.locale) : "");
  const bandMap = new Map(input.bands.map((band) => [band.id, band]));

  const allRules: ArenaRuleViewModel[] = input.regulations
    .map((row): ArenaRuleViewModel => ({
      id: Number(row.id),
      leagueId: Number(row.leagueId),
      startAt: String(row.startAt ?? ""),
      endAt: String(row.endAt ?? ""),
      musicType: Number(row.liveMusicType ?? 0),
      missions: [
        Number(row.gekisouMission1 ?? 0),
        Number(row.gekisouMission2 ?? 0),
        Number(row.gekisouMission3 ?? 0),
      ],
    }))
    .sort((a, b) => (parseMasterDate(a.startAt) ?? 0) - (parseMasterDate(b.startAt) ?? 0) || a.id - b.id);

  const dailyRewards = input.dailyRewards.map((row) => toRangeReward(row, input.resolveReward));
  const seasonRewards = input.seasonRewards.map((row) => toRangeReward(row, input.resolveReward));
  const promotionRewards = input.promotionRewards.map((row) => toRangeReward(row, input.resolveReward));

  const sortedSeasons = [...input.seasons].sort(
    (a, b) => (parseMasterDate(b.startAt) ?? 0) - (parseMasterDate(a.startAt) ?? 0) || b.id - a.id,
  );

  const seasons: ArenaSeasonViewModel[] = sortedSeasons.map((season) => {
    const seasonId = Number(season.id);
    const seasonStart = parseMasterDate(season.startAt);
    const seasonEnd = endInstant(season.endAt);
    const title = textOf(season.nameTextId ?? season.nameTextID) || `#${seasonId}`;

    const leagues: ArenaLeagueViewModel[] = [...input.leagues]
      .sort((a, b) => a.bandId - b.bandId || a.id - b.id)
      .map((league) => {
        const leagueId = Number(league.id);
        const bandId = Number(league.bandId);
        const band = bandMap.get(bandId);
        const bandName = (band ? textOf(band.nameTextID) : "") || textOf(league.nameTextId ?? league.nameTextID) || `#${bandId}`;
        const color = band?.mainColorCode
          ? (band.mainColorCode.startsWith("#") ? band.mainColorCode : `#${band.mainColorCode}`)
          : "";

        const rules = allRules.filter((rule) => {
          if (rule.leagueId !== leagueId) return false;
          const rStart = parseMasterDate(rule.startAt);
          const rEnd = endInstant(rule.endAt);
          if (seasonStart === null || seasonEnd === null || rStart === null || rEnd === null) return true;
          return rStart < seasonEnd && rEnd > seasonStart;
        });

        const songs: ArenaSongSummary[] = input.songs
          .filter((song) => arenaSongMatchesBand(song, bandId, seasonEnd ?? undefined))
          .map((song) => {
            const expert = song.difficulties.find((d) => d.difficulty === "expert");
            return {
              id: song.id,
              title: song.title,
              jacketUrl: song.jacketUrl,
              musicType: song.musicType,
              startAt: song.startAt,
              expertLevel: expert?.displayLevel ?? null,
            };
          });

        const leaguePromos = promotionRewards.filter((entry) => entry.leagueId === 0 || entry.leagueId === leagueId);
        const leagueDaily = dailyRewards.filter((entry) => entry.leagueId === 0 || entry.leagueId === leagueId);

        const ranks: ArenaRankStepViewModel[] = input.ranks
          .filter((row) => Number(row.bandId) === bandId || Number(row.bandId) === 0)
          .sort((a, b) => a.lp - b.lp || a.rank - b.rank || a.division - b.division || a.id - b.id)
          .map((row) => {
            const rankId = Number(row.id);
            const name = textOf(row.nameTextId ?? row.nameTextID);
            const matchedPromos = leaguePromos
              .filter((entry) =>
                (entry.rankId > 0 && entry.rankId === rankId)
                || (entry.rankId === 0 && entry.from > 0 && entry.from === Number(row.lp)),
              )
              .map((entry) => entry.reward);
            const matchedDaily = leagueDaily
              .filter((entry) =>
                (entry.rankId > 0 && entry.rankId === rankId)
                || (entry.rankId === 0 && entry.to > 0 && Number(row.lp) >= entry.from && Number(row.lp) <= entry.to),
              )
              .map((entry) => entry.reward);
            return {
              id: rankId,
              name,
              rank: Number(row.rank),
              division: Number(row.division),
              lp: Number(row.lp),
              promotionRewards: matchedPromos,
              dailyRewards: matchedDaily,
            };
          });

        return {
          id: leagueId,
          bandId,
          name: bandName,
          color,
          rules,
          songs,
          ranks,
        };
      });

    return {
      id: seasonId,
      title,
      startAt: String(season.startAt ?? ""),
      endAt: String(season.endAt ?? ""),
      rankingEndAt: String(season.rankingCountEndAt ?? season.endAt ?? ""),
      leagues,
      dailyRewards,
      seasonRewards,
    };
  });

  return { seasons };
}

/** Picks the ongoing season at `now`, else the nearest upcoming season, else the latest past season. */
export function selectDefaultArenaSeason(
  seasons: readonly ArenaSeasonViewModel[],
  now: number | null,
): ArenaSeasonViewModel | null {
  if (seasons.length === 0) return null;
  if (now === null) return seasons[0]!;
  const ongoing = seasons.find((season) => {
    const start = parseMasterDate(season.startAt);
    const end = endInstant(season.endAt);
    return start !== null && end !== null && start <= now && now < end;
  });
  if (ongoing) return ongoing;
  const upcoming = [...seasons]
    .filter((season) => {
      const start = parseMasterDate(season.startAt);
      return start !== null && start > now;
    })
    .sort((a, b) => (parseMasterDate(a.startAt) ?? 0) - (parseMasterDate(b.startAt) ?? 0));
  if (upcoming.length > 0) return upcoming[0]!;
  return seasons[0]!;
}

/** Active weekly regulation of a league at `now`, or the first/last regulation when outside active windows. */
export function selectActiveLeagueRuleIndex(rules: readonly ArenaRuleViewModel[], now: number | null): number {
  if (rules.length === 0) return -1;
  if (now === null) return 0;
  const activeIdx = rules.findIndex((rule) => {
    const start = parseMasterDate(rule.startAt);
    const end = endInstant(rule.endAt);
    return start !== null && end !== null && start <= now && now < end;
  });
  if (activeIdx >= 0) return activeIdx;
  const upcomingIdx = rules.findIndex((rule) => {
    const start = parseMasterDate(rule.startAt);
    return start !== null && start > now;
  });
  return upcomingIdx >= 0 ? upcomingIdx : rules.length - 1;
}

/** Next schedule transition across a season and its league regulations after `now`. */
export function nextArenaTransitionAt(season: ArenaSeasonViewModel | null, now: number | null): number | null {
  if (!season || now === null) return null;
  const candidates = [
    parseMasterDate(season.startAt),
    endInstant(season.endAt),
    ...season.leagues.flatMap((league) =>
      league.rules.flatMap((rule) => [parseMasterDate(rule.startAt), endInstant(rule.endAt)]),
    ),
  ].filter((instant): instant is number => instant !== null && instant > now);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** Builds a `/tools/deck` query string prefilled with an Arena league or specific weekly rule. */
export function buildArenaDeckQuery(params: {
  leagueId: number;
  bandId: number;
  rule?: Pick<ArenaRuleViewModel, "musicType" | "missions"> | null;
  isLiveRule?: boolean;
}): string {
  const search = new URLSearchParams();
  search.set("goal", "arena");
  search.set("league", String(params.leagueId));
  if (params.rule && !params.isLiveRule) {
    search.set("source", "custom");
    search.set("band", String(params.bandId));
    search.set("attr", String(params.rule.musicType));
    search.set("m1", String(params.rule.missions[0]));
    search.set("m2", String(params.rule.missions[1]));
    search.set("m3", String(params.rule.missions[2]));
  }
  return search.toString();
}
