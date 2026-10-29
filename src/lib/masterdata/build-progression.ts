import type { GameServer } from "@/config/servers";
import type { MasterTable } from "@/lib/cards/data";
import { eachServer, memo, table } from "@/lib/masterdata/build-core";
import {
  normalizeProgressionReference,
  type ProgressionReferenceViewModel,
  type RawBandRatingRow,
  type RawExpRankRow,
  type RawHighScoreRatingRow,
} from "@/lib/progression/data";

function optionalTable<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  return table<T>(path, server).catch(() => ({ _allData: [] as T[] }));
}

export function progressionReferenceOn(server: GameServer): Promise<ProgressionReferenceViewModel> {
  return memo(`progression-reference:${server}`, async () => {
    const [
      playerRanks,
      characterRanks,
      friendshipRanks,
      bandRanks,
      bandTypeRanks,
      bandHighScoreRatings,
      totalHighScoreRatings,
    ] = await Promise.all([
      optionalTable<RawExpRankRow>("MasterPlayerRank.json", server),
      optionalTable<RawExpRankRow>("MasterCharacterRank.json", server),
      optionalTable<RawExpRankRow>("MasterCharacterFriendshipRank.json", server),
      optionalTable<RawBandRatingRow>("MasterBandRank.json", server),
      optionalTable<RawBandRatingRow>("MasterBandTypeRank.json", server),
      optionalTable<RawHighScoreRatingRow>("MasterLiveBandHighScoreRating.json", server),
      optionalTable<RawHighScoreRatingRow>("MasterLiveTotalHighScoreRating.json", server),
    ]);

    return normalizeProgressionReference({
      playerRanks: playerRanks._allData,
      characterRanks: characterRanks._allData,
      friendshipRanks: friendshipRanks._allData,
      bandRanks: bandRanks._allData,
      bandTypeRanks: bandTypeRanks._allData,
      bandHighScoreRatings: bandHighScoreRatings._allData,
      totalHighScoreRatings: totalHighScoreRatings._allData,
    });
  });
}

export function getBuildProgressionReferences(): Promise<Partial<Record<GameServer, ProgressionReferenceViewModel>>> {
  return memo("progression-references", async () => {
    const entries = await eachServer((server) => progressionReferenceOn(server));
    return Object.fromEntries(entries) as Partial<Record<GameServer, ProgressionReferenceViewModel>>;
  });
}
