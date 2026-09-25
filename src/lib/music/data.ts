import type { AppLocale } from "@/config/locales";
import { getAssetUrl } from "@/lib/assets/url";
import { getCueUrl } from "@/lib/story/assets";
import { localizeMasterText, type MasterTextRow } from "@/lib/masterdata/localize-text";

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
  vocalCharacterIDs: number[];
  musicType: number;
  startAt: string;
  easyID: number;
  normalID: number;
  hardID: number;
  expertID: number;
  musicSoundID: number;
  jingleSoundID: number;
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
  level: number;
  displayLevel: number;
  notesCount: number;
  /** MasterLiveMusicScore.musicScoreTextFileName, e.g. `0069/0069_03`; names the published chart file. */
  chartKey: string;
}

export interface MusicViewModel {
  id: number;
  title: string;
  jacketUrl: string;
  jacketAssetName: string;
  composer: string;
  lyricist: string;
  arranger: string;
  bandId: number;
  bandName: string;
  musicType: number;
  startAt: string;
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
    const bandName = band ? resolveText(band.nameTextID) : "";

    const title = resolveText(music.titleTextID);
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
      jacketUrl: getMusicJacketUrl(music.jacketAssetName),
      jacketAssetName: music.jacketAssetName,
      composer,
      lyricist,
      arranger,
      bandId,
      bandName,
      musicType: music.musicType,
      startAt: music.startAt,
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


function normalizeEntry(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key.replace(/^_/, ""), entryValue]),
  );
}
