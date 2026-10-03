import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { StoryEpisodeKind, StoryUnlockCondition } from "@/lib/story/data";

const EPISODE_LABEL_KEYS: Readonly<Record<StoryEpisodeKind, string>> = {
  main: "story.ui.episode",
  another: "story.ui.anotherEpisode",
  extra: "story.ui.extraEpisode",
};

/** "EPISODE 3", or the another/extra numbering, which restarts at 1 within a chapter. */
export function storyEpisodeLabel(locale: AppLocale, story: { episodeKind: StoryEpisodeKind | null; episodeNumber: number | null }): string {
  if (story.episodeNumber === null) return "";
  return t(locale, EPISODE_LABEL_KEYS[story.episodeKind ?? "main"], { n: story.episodeNumber });
}

/** A story's playback length (MasterAdvPlayTime seconds) as "m:ss" or "h:mm:ss"; "" when unknown. */
export function formatPlayTime(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** One unlock requirement of a story, ready to show; `advId` links the episode to read first. */
export interface StoryUnlockLabel {
  key: string;
  text: string;
  advId?: number;
}

interface UnlockSource {
  unlock: StoryUnlockCondition;
  category: string;
  characterIds: number[];
  characterNames: string[];
  bandName: string;
}

/** The story's unlock conditions (StoryViewModel.unlock) as sentences; empty when it is open from the start. */
export function storyUnlockLabels(locale: AppLocale, story: UnlockSource): StoryUnlockLabel[] {
  const { unlock } = story;
  const labels: StoryUnlockLabel[] = [];
  if (unlock.playerRank > 0) labels.push({ key: "player", text: t(locale, "story.unlock.playerRank", { rank: unlock.playerRank }) });
  if (unlock.bandRank > 0) labels.push({ key: "band", text: story.bandName ? t(locale, "story.unlock.bandRank", { name: story.bandName, rank: unlock.bandRank }) : t(locale, "story.unlock.bandRankPlain", { rank: unlock.bandRank }) });
  if (unlock.characterRank > 0) {
    const name = story.characterNames[0] ?? "";
    labels.push({ key: "character", text: name ? t(locale, "story.unlock.characterRank", { name, rank: unlock.characterRank }) : t(locale, "story.unlock.characterRankPlain", { rank: unlock.characterRank }) });
  }
  if (unlock.friendshipLevel > 0) labels.push({ key: "friendship", text: t(locale, "story.unlock.friendshipLevel", { level: unlock.friendshipLevel }) });
  if (unlock.episodeNumber > 0) labels.push({ key: "episode", text: t(locale, "story.unlock.episode", { n: unlock.episodeNumber }) });
  if (unlock.eventPoint > 0) labels.push({ key: "event", text: t(locale, "story.unlock.eventPoint", { points: unlock.eventPoint.toLocaleString(locale) }) });
  if (unlock.releaseEpisodeId > 0) {
    labels.push({
      key: "release",
      text: t(locale, "story.unlock.release", { chapter: unlock.releaseChapterId, episode: unlock.releaseEpisodeId }),
      ...(unlock.releaseAdvId ? { advId: unlock.releaseAdvId } : {}),
    });
  }
  return labels;
}
