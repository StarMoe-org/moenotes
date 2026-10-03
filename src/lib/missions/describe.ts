import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

/** Score grade letters by MasterData `scoreRank`. */
const scoreRankLabels: Record<number, string> = { 2: "D", 3: "C", 4: "B", 5: "A", 6: "S", 7: "SS" };

export function scoreRankLabel(scoreRank: number): string {
  return scoreRankLabels[scoreRank] ?? "";
}

/** The mission row fields a description's `{Key}` placeholders read (MasterEventMission, MasterSeasonPassMission, …). */
export interface MissionDescriptionFields {
  descriptionTextId: string;
  achievementCount: number;
  value: number;
  exchangeId: number;
  characterId: number;
  bandId: number;
  musicId: number;
  musicDifficulty: number;
  scoreRank: number;
  cardType: number;
  storyChapterId: number;
  episodeId: number;
}

/**
 * Where the placeholders get their names. Each lookup returns undefined (or "") when the row is unknown; that
 * placeholder then drops out of the sentence.
 */
export interface MissionDescribeContext {
  locale: AppLocale;
  /** Localized MasterText by id (the description template itself). */
  text: (textId: string) => string;
  exchangeName: (id: number) => string | undefined;
  chapterName: (id: number) => string | undefined;
  /** An episode's number and story title (`{EpisodeId.Value}` and `{EpisodeId}`). */
  episode: (id: number) => { number: number; title: string } | undefined;
  bandName: (id: number) => string | undefined;
  characterName: (id: number) => string | undefined;
  musicTitle: (id: number) => string | undefined;
  /** `{MusicDifficulty}`: callers differ in how they index and word it, so they pass their own. */
  difficulty: (musicDifficulty: number) => string;
}

/**
 * Fills `{Key}` placeholders from `values`. Unknown placeholders drop out, then runs of two or more spaces/tabs left
 * behind collapse into one space and the ends are trimmed, so the sentence still reads naturally.
 */
export function fillMissionTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => values[key] ?? "").replace(/[ \t]{2,}/g, " ").trim();
}

/** The placeholder values one mission row supplies. */
export function missionPlaceholderValues(mission: MissionDescriptionFields, context: MissionDescribeContext): Record<string, string> {
  const { locale } = context;
  const episode = context.episode(mission.episodeId);
  return {
    AchievementCount: mission.achievementCount.toLocaleString(locale),
    Value: String(mission.value),
    ExchangeId: context.exchangeName(mission.exchangeId) ?? "",
    StoryChapterId: context.chapterName(mission.storyChapterId) ?? "",
    // "Episode {EpisodeId.Value} \"{EpisodeId}\"": the number, then the episode's story title.
    EpisodeId: episode ? episode.title : "",
    "EpisodeId.Value": episode ? String(episode.number) : "",
    BandId: context.bandName(mission.bandId) ?? "",
    CharacterId: context.characterName(mission.characterId) ?? "",
    MusicId: context.musicTitle(mission.musicId) ?? "",
    MusicDifficulty: context.difficulty(mission.musicDifficulty),
    ScoreRank: scoreRankLabel(mission.scoreRank),
    CardType: mission.cardType ? t(locale, `cards.attributes.${mission.cardType}`) : "",
  };
}

/** A mission's description: its MasterText template with every placeholder filled (see fillMissionTemplate). */
export function describeMission(mission: MissionDescriptionFields, context: MissionDescribeContext): string {
  return fillMissionTemplate(context.text(mission.descriptionTextId), missionPlaceholderValues(mission, context));
}
