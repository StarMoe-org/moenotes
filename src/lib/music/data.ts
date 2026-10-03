import type { AppLocale } from "@/config/locales";
import { getAssetUrl } from "@/lib/assets/url";
import { getCueUrl } from "@/lib/story/assets";
import { isUsableMasterText, localizeMasterText, type MasterTextRow } from "@/lib/masterdata/localize-text";

export interface MasterTable<T> {
  _allData: T[];
}

export interface RawMusic {
  id: number;
  titleTextID: string;
  rubyTitleTextID?: string;
  phoneticTextID?: string;
  jacketAssetName: string;
  composerTextID: string;
  lyricistTextID: string;
  arrangerTextID: string;
  bandIDs: number[];
  /** A song can name a band without a MasterBand entry (for example CRYCHIC). */
  bandNameTextID?: string;
  vocalCharacterIDs: number[];
  musicType: number;
  startAt: string;
  /** The game's song order (band, then category, then song). */
  sortOrder?: number;
  easyID: number;
  normalID: number;
  hardID: number;
  expertID: number;
  musicSoundID: number;
  jingleSoundID: number;
  /** MasterLiveMusicCategory ids, e.g. original / cover / virtual-singer buckets. */
  musicCategories: number[];
  /** Group key into MasterLiveScoreRank for this song's score-rank thresholds. */
  liveScoreRankGroup: number;
  /** Alternate-vocal song ids offered for this track. */
  anotherVocalIDs: number[];
  /** MasterReward.id entries paid per achieved score rank (D has none). */
  scoreCLiveMusicRewardID: number;
  scoreBLiveMusicRewardID: number;
  scoreALiveMusicRewardID: number;
  scoreSLiveMusicRewardID: number;
  scoreSSLiveMusicRewardID: number;
  /** MasterReward.id entries paid per difficulty's full-combo reward. */
  comboEasyLiveMusicRewardID: number;
  comboNormalLiveMusicRewardID: number;
  comboHardLiveMusicRewardID: number;
  comboExpertLiveMusicRewardID: number;
  /** Group key into MasterLiveMusicComboReward (the 25 / 50 / 75 / 100 % combo tiers). */
  comboRewardGroup?: number;
  /** Gekisou mission of each of the three ranges: 1 Combo, 2 Luck, 3 Just count. */
  gekisouMission1?: number;
  gekisouMission2?: number;
  gekisouMission3?: number;
}

/** MasterLiveMusicCategory row: the bucket a song belongs to and the text key naming it. */
export interface RawLiveMusicCategory {
  id: number;
  musicCategories: number[];
  textKey: string;
}

/** MasterLiveScoreRank row: one rank's thresholds inside a group's ladder. */
export interface RawLiveScoreRank {
  id: number;
  group: number;
  liveScoreRank: number; // 2=D, 3=C, 4=B, 5=A, 6=S, 7=SS
  requiredScore: number;
  battleLiveRequiredScore: number;
}

/** MasterLiveMusicAnotherVocal row: an alternate vocalist offered for a song. */
export interface RawLiveMusicAnotherVocal {
  id: number;
  musicId: number;
  characterId: number;
}

/** Shared shape of MasterReward rows the music reward ids point at. */
export interface RawLiveMusicRewardRow {
  id: number;
  resourceType: number;
  resourceId: number;
  resourceCount: number;
}

export interface RawMusicScore {
  id: number;
  musicScoreLevel: number;
  musicScoreDisplayLevel: number;
  fullComboCount: number;
  musicScoreTextFileName: string;
}

export interface RawCharacter {
  id: number;
  bandID: number;
  displayOrder: number;
  nameTextID: string;
  enDisplayNameTextId: string;
  mainColorCode: string;
}

export interface RawBand {
  id: number;
  nameTextID: string;
  mainColorCode: string;
}

export type RawText = MasterTextRow;

export interface SongDifficultyModel {
  difficulty: "easy" | "normal" | "hard" | "expert";
  /** MasterLiveMusicScore id; music-data.json names charts by it. */
  scoreId?: number;
  level: number;
  displayLevel: number;
  notesCount: number;
  /** MasterLiveMusicScore.musicScoreTextFileName, e.g. `0069/0069_03`; names the published chart file. */
  chartKey: string;
}

export interface MusicViewModel {
  id: number;
  title: string;
  /** The title's Japanese MasterText cell (the localized title when there is none); see title-preference.ts. */
  titleJa?: string;
  jacketUrl: string;
  jacketAssetName: string;
  composer: string;
  lyricist: string;
  arranger: string;
  bandId: number;
  bandName: string;
  /** Every MasterLiveMusic `_bandIDs` entry (empty for songs outside every band). */
  bandIds?: number[];
  musicType: number;
  startAt: string;
  /** The game's order of the song (MasterLiveMusic `_sortOrder`); 0 when the table has none. */
  sortOrder?: number;
  /** MasterLiveMusicCategory ids (original / cover / virtual-singer …). */
  categoryIds?: number[];
  /** Gekisou mission of each range (1 Combo, 2 Luck, 3 Just count); empty when the table has none. */
  gekisouMissions?: number[];
  difficulties: SongDifficultyModel[];
  vocalistIds: number[];
  vocalists: Array<{ id: number; name: string }>;
  searchText: string;
  musicSoundID: number;
  /** Full track and the short game-menu cut; undefined until the release export includes them. */
  audioUrl?: string | undefined;
  previewAudioUrl?: string | undefined;
}

/** MasterSound joined with MasterSoundCueSheet. */
export interface MusicSoundCue {
  id: number;
  cueName: string;
  cueSheetName: string;
}

/** MasterLiveScoreRank.liveScoreRank 2–7, matching the D–SS rank icons. */
export const SCORE_RANK_LABELS: Record<number, string> = { 2: "D", 3: "C", 4: "B", 5: "A", 6: "S", 7: "SS" };

/** A named category the song is filed under (original / cover / virtual-singer …). */
export interface MusicCategoryModel {
  id: number;
  name: string;
}

/** One rung of the song's score-rank ladder, both the solo and the Gekisou-room threshold. */
export interface MusicScoreRankModel {
  /** "C" | "B" | "A" | "S" | "SS" */
  rank: string;
  liveScoreRank: number;
  requiredScore: number;
  battleLiveRequiredScore: number;
}

/** An alternate vocalist the track can be sung by (character id + resolved name, like `vocalists`). */
export interface MusicAnotherVocalModel {
  characterId: number;
  name: string;
}

/** Live-system extras of the music detail page, joined from the MasterLiveMusic* tables. */
export interface MusicLiveDetail {
  categories: MusicCategoryModel[];
  scoreRanks: MusicScoreRankModel[];
  anotherVocals: MusicAnotherVocalModel[];
  /**
   * Reward ids (into MasterReward) paid for each difficulty's full combo and for each achieved
   * score rank; resolved to names / icons by the caller, which has the full reward sources.
   */
  comboRewardIds: Array<{ difficulty: SongDifficultyModel["difficulty"]; rewardId: number }>;
  scoreRewardIds: Array<{ rank: string; liveScoreRank: number; rewardId: number }>;
}

/** Raw inputs the live detail is built from (all already-normalized tables). */
export interface MusicLiveSources {
  categories: RawLiveMusicCategory[];
  scoreRanks: RawLiveScoreRank[];
}

/**
 * Reads the song's live-system extras out of its raw row and the shared tables. The reward rows
 * stay as MasterReward ids; the build layer resolves them against items / cards / … because the
 * reward resolver needs every reward source (and through them the music list itself).
 */
export function buildMusicLiveDetail(
  music: RawMusic,
  sources: MusicLiveSources,
  texts: RawText[],
  characters: RawCharacter[],
  locale: AppLocale,
): MusicLiveDetail {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const characterMap = new Map(characters.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  const categoryNameById = new Map(
    sources.categories.map((category) => [category.id, resolveText(category.textKey)]),
  );
  const categories: MusicCategoryModel[] = (music.musicCategories ?? [])
    .map((id) => ({ id, name: categoryNameById.get(id) ?? `#${id}` }));

  const scoreRanks: MusicScoreRankModel[] = sources.scoreRanks
    .filter((row) => row.group === music.liveScoreRankGroup)
    .sort((a, b) => a.liveScoreRank - b.liveScoreRank)
    .map((row) => ({
      rank: SCORE_RANK_LABELS[row.liveScoreRank] ?? String(row.liveScoreRank),
      liveScoreRank: row.liveScoreRank,
      requiredScore: row.requiredScore,
      battleLiveRequiredScore: row.battleLiveRequiredScore,
    }));

  const anotherVocals: MusicAnotherVocalModel[] = (music.anotherVocalIDs ?? []).map((characterId) => {
    const character = characterMap.get(characterId);
    return { characterId, name: character ? resolveText(character.nameTextID) : `Char #${characterId}` };
  });

  const comboRewardIds: MusicLiveDetail["comboRewardIds"] = (
    [
      { difficulty: "easy", rewardId: music.comboEasyLiveMusicRewardID },
      { difficulty: "normal", rewardId: music.comboNormalLiveMusicRewardID },
      { difficulty: "hard", rewardId: music.comboHardLiveMusicRewardID },
      { difficulty: "expert", rewardId: music.comboExpertLiveMusicRewardID },
    ] as const
  ).filter((entry) => entry.rewardId > 0) as MusicLiveDetail["comboRewardIds"];

  const scoreRewardIds: MusicLiveDetail["scoreRewardIds"] = [
    { rank: "C", liveScoreRank: 3, rewardId: music.scoreCLiveMusicRewardID },
    { rank: "B", liveScoreRank: 4, rewardId: music.scoreBLiveMusicRewardID },
    { rank: "A", liveScoreRank: 5, rewardId: music.scoreALiveMusicRewardID },
    { rank: "S", liveScoreRank: 6, rewardId: music.scoreSLiveMusicRewardID },
    { rank: "SS", liveScoreRank: 7, rewardId: music.scoreSSLiveMusicRewardID },
  ].filter((entry) => entry.rewardId > 0);

  return { categories, scoreRanks, anotherVocals, comboRewardIds, scoreRewardIds };
}


export function validateMasterTable<T>(raw: unknown): MasterTable<T> {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { _allData?: unknown })._allData)
      ? (raw as { _allData: unknown[] })._allData
      : null;
  if (!rows) {
    throw new Error("Invalid masterdata table");
  }
  return { _allData: rows.map(normalizeEntry) as T[] };
}

export function getMusicJacketUrl(jacketAssetName: string): string {
  // The index is keyed by the MasterData PNG path; the published file is WebP.
  return getAssetUrl({ path: `Image/Jacket/${jacketAssetName}.png`, type: "raw" });
}

/** Songs resolve like other CRI sounds, by cue sheet and exact cue. */
export function getMusicAudioUrl(sound: MusicSoundCue | undefined, locale: AppLocale): string | undefined {
  return sound ? getCueUrl(sound.cueSheetName, sound.cueName, locale) : undefined;
}

export function normalizeMusic(
  musicList: RawMusic[],
  scoresList: RawMusicScore[],
  characters: RawCharacter[],
  bands: RawBand[],
  texts: RawText[],
  locale: AppLocale,
  sounds: MusicSoundCue[] = [],
): MusicViewModel[] {
  const soundMap = new Map(sounds.map((sound) => [sound.id, sound]));
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const characterMap = new Map(characters.map((entry) => [entry.id, entry]));
  const bandMap = new Map(bands.map((entry) => [entry.id, entry]));
  const scoreMap = new Map(scoresList.map((entry) => [entry.id, entry]));

  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  return musicList.map((music) => {
    const bandId = music.bandIDs[0] ?? 0;
    const band = bandMap.get(bandId);
    const bandName = music.bandNameTextID ? resolveText(music.bandNameTextID) : band ? resolveText(band.nameTextID) : "";

    const title = resolveText(music.titleTextID);
    const japaneseTitle = textMap.get(music.titleTextID)?.japanese;
    const titleJa = isUsableMasterText(japaneseTitle, music.titleTextID) ? japaneseTitle : title;
    const composer = resolveText(music.composerTextID);
    const lyricist = resolveText(music.lyricistTextID);
    const arranger = resolveText(music.arrangerTextID);

    // Difficulties mapping
    const difficulties: SongDifficultyModel[] = [];
    const diffConfigs: Array<{ key: "easy" | "normal" | "hard" | "expert"; scoreId: number }> = [
      { key: "easy", scoreId: music.easyID },
      { key: "normal", scoreId: music.normalID },
      { key: "hard", scoreId: music.hardID },
      { key: "expert", scoreId: music.expertID },
    ];

    diffConfigs.forEach(({ key, scoreId }) => {
      const score = scoreMap.get(scoreId);
      if (score) {
        difficulties.push({
          difficulty: key,
          scoreId,
          level: score.musicScoreLevel,
          displayLevel: score.musicScoreDisplayLevel,
          notesCount: score.fullComboCount,
          chartKey: score.musicScoreTextFileName,
        });
      }
    });

    // Vocalists mapping
    const vocalists = (music.vocalCharacterIDs || [])
      .map((charId) => {
        const char = characterMap.get(charId);
        return {
          id: charId,
          name: char ? resolveText(char.nameTextID) : `Char #${charId}`,
        };
      });

    const searchParts = [
      title,
      ...(titleJa !== title ? [titleJa] : []),
      composer,
      lyricist,
      arranger,
      bandName,
      music.id,
      ...vocalists.map((v) => v.name),
    ];


    return {
      id: music.id,
      title,
      titleJa,
      jacketUrl: getMusicJacketUrl(music.jacketAssetName),
      jacketAssetName: music.jacketAssetName,
      composer,
      lyricist,
      arranger,
      bandId,
      bandName,
      bandIds: music.bandIDs ?? [],
      musicType: music.musicType,
      startAt: music.startAt,
      sortOrder: typeof music.sortOrder === "number" ? music.sortOrder : 0,
      categoryIds: music.musicCategories ?? [],
      gekisouMissions: gekisouMissions(music),
      difficulties,
      vocalistIds: music.vocalCharacterIDs || [],
      vocalists,
      searchText: searchParts.join(" ").toLowerCase(),
      musicSoundID: music.musicSoundID,
      audioUrl: getMusicAudioUrl(soundMap.get(music.musicSoundID), locale),
      previewAudioUrl: getMusicAudioUrl(soundMap.get(music.jingleSoundID), locale),
    };
  });
}

/** The three ranges' Gekisou missions of a MasterLiveMusic row; empty when the row has none. */
export function gekisouMissions(music: Pick<RawMusic, "gekisouMission1" | "gekisouMission2" | "gekisouMission3">): number[] {
  const missions = [music.gekisouMission1, music.gekisouMission2, music.gekisouMission3];
  return missions.every((value) => typeof value === "number" && value > 0) ? missions as number[] : [];
}

function normalizeEntry(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key.replace(/^_/, ""), entryValue]),
  );
}
