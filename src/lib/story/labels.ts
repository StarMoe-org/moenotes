import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { StoryEpisodeKind } from "@/lib/story/data";

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
