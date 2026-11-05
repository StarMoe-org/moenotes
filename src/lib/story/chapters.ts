import type { StoryCategory, StoryEpisodeKind, StoryViewModel } from "@/lib/story/data";
import { parseMasterDate } from "@/lib/schedule";

/** The episodes of one chapter, split the way the game lists them (main, then another, then extra runs). */
export interface StoryChapterRun {
  kind: StoryEpisodeKind;
  episodes: StoryViewModel[];
}

/**
 * One chapter of the main or event story, summarized for its card. Chapter fields repeat on every episode; the
 * details that do not (the earliest start, the main cast, the length) are aggregated here so a card never shows
 * whichever episode happened to be last in the list.
 */
export interface StoryChapterSummary {
  chapterId: number;
  category: StoryCategory;
  name: string;
  description: string;
  banner: string;
  image: string;
  bandId: number;
  bandName: string;
  eventId: number | null;
  startAt: string;
  endAt: string;
  /** Total playback length of the chapter's episodes, in seconds. */
  playTime: number;
  episodeCount: number;
  characterIds: number[];
  characterNames: string[];
  /** Every episode's search text, so a chapter matches a search for any of its episodes. */
  searchText: string;
  episodes: StoryViewModel[];
  runs: StoryChapterRun[];
}

const RUN_ORDER: readonly StoryEpisodeKind[] = ["main", "another", "extra"];

function earliest(a: StoryViewModel, b: StoryViewModel): StoryViewModel {
  const timeA = parseMasterDate(a.startAt);
  const timeB = parseMasterDate(b.startAt);
  if (timeA === null) return b;
  if (timeB === null) return a;
  return timeB < timeA ? b : a;
}

function latestEnd(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const timeA = parseMasterDate(a);
  const timeB = parseMasterDate(b);
  if (timeA === null) return b;
  if (timeB === null) return a;
  return timeB > timeA ? b : a;
}

/** The characters of the chapter's main run, in their in-game order; another/extra casts do not replace them. */
function chapterCast(episodes: StoryViewModel[]): { ids: number[]; names: string[] } {
  const source = episodes.filter((episode) => (episode.episodeKind ?? "main") === "main");
  const ids: number[] = [];
  const names: string[] = [];
  for (const episode of source.length > 0 ? source : episodes) {
    episode.characterIds.forEach((id, index) => {
      if (ids.includes(id)) return;
      ids.push(id);
      names.push(episode.characterNames[index] ?? "");
    });
  }
  return { ids, names };
}

function summarize(chapterId: number, episodes: StoryViewModel[]): StoryChapterSummary {
  const ordered = [...episodes].sort((a, b) => a.sortOrder - b.sortOrder);
  const anchor = ordered.find((episode) => (episode.episodeKind ?? "main") === "main") ?? ordered[0]!;
  const first = ordered.reduce(earliest);
  const cast = chapterCast(ordered);
  const searchText = [...new Set(ordered.map((episode) => episode.searchText).filter(Boolean))].join(" ");

  return {
    chapterId,
    category: anchor.category,
    name: anchor.chapterName,
    description: anchor.chapterDescription,
    banner: anchor.chapterBanner,
    image: anchor.chapterImage,
    bandId: anchor.bandId,
    bandName: anchor.bandName,
    eventId: anchor.eventId,
    startAt: first.startAt,
    endAt: ordered.reduce((end, episode) => latestEnd(end, episode.endAt), ""),
    playTime: ordered.reduce((total, episode) => total + (episode.playTime ?? 0), 0),
    episodeCount: ordered.length,
    characterIds: cast.ids,
    characterNames: cast.names,
    searchText,
    episodes: ordered,
    runs: RUN_ORDER
      .map((kind) => ({ kind, episodes: ordered.filter((episode) => (episode.episodeKind ?? "main") === kind) }))
      .filter((run) => run.episodes.length > 0),
  };
}

/** The chapters among `stories`, in chapter order. Episodes without a chapter (bond stories) are skipped. */
export function groupStoryChapters(stories: readonly StoryViewModel[]): StoryChapterSummary[] {
  const byChapter = new Map<number, StoryViewModel[]>();
  for (const story of stories) {
    if (story.chapterId === null) continue;
    const episodes = byChapter.get(story.chapterId);
    if (episodes) episodes.push(story);
    else byChapter.set(story.chapterId, [story]);
  }
  return [...byChapter.entries()]
    .sort(([a], [b]) => a - b)
    .map(([chapterId, episodes]) => summarize(chapterId, episodes));
}

/** The chapter with this id, or null. */
export function findStoryChapter(stories: readonly StoryViewModel[], chapterId: number): StoryChapterSummary | null {
  return groupStoryChapters(stories.filter((story) => story.chapterId === chapterId))[0] ?? null;
}
