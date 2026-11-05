import { describe, expect, test } from "bun:test";
import { findRouteMatch } from "../src/lib/route/registry";
import { findStoryChapter, groupStoryChapters } from "../src/lib/story/chapters";
import type { StoryViewModel } from "../src/lib/story/data";
import { parseStoryChapterPath, storyChapterPath } from "../src/lib/story/paths";

function episode(overrides: Partial<StoryViewModel> & { id: number }): StoryViewModel {
  return {
    advId: overrides.id,
    category: "event",
    chapterId: 10,
    chapterName: "Colors of Pure Sense",
    chapterDescription: "A chapter description.",
    chapterBanner: "chapter_banner",
    chapterImage: "",
    bandId: 25,
    bandName: "25時、ナイトコードで。",
    eventId: 184,
    characterIds: [1, 2],
    characterNames: ["Mafuyu", "Kanade"],
    playTime: 60,
    title: `Episode ${overrides.id}`,
    episodeKind: "main",
    startAt: "2026/09/01 12:00:00",
    endAt: "2026/09/10 12:00:00",
    searchText: `episode ${overrides.id}`,
    sortOrder: 100_000_000 + 10_000 + overrides.id,
    ...overrides,
  } as StoryViewModel;
}

describe("story chapters", () => {
  const stories = [
    episode({ id: 1, sortOrder: 100_010_001 }),
    episode({ id: 2, sortOrder: 100_010_002, startAt: "2026/09/03 12:00:00", playTime: 90 }),
    episode({ id: 3, sortOrder: 100_011_001, episodeKind: "another", characterIds: [3], characterNames: ["Ena"], startAt: "2026/08/20 12:00:00", playTime: 30 }),
    episode({ id: 4, sortOrder: 100_012_001, episodeKind: "extra", playTime: 0 }),
  ];

  test("one summary per chapter aggregates its episodes", () => {
    const chapters = groupStoryChapters(stories);
    expect(chapters).toHaveLength(1);
    const chapter = chapters[0]!;
    expect(chapter.chapterId).toBe(10);
    expect(chapter.episodeCount).toBe(4);
    expect(chapter.playTime).toBe(180);
    // The earliest episode starts the chapter, not whichever episode happens to be last.
    expect(chapter.startAt).toBe("2026/08/20 12:00:00");
    // An another episode's single character does not replace the chapter's cast.
    expect(chapter.characterIds).toEqual([1, 2]);
    expect(chapter.characterNames).toEqual(["Mafuyu", "Kanade"]);
    expect(chapter.runs.map((run) => [run.kind, run.episodes.length])).toEqual([["main", 2], ["another", 1], ["extra", 1]]);
    expect(chapter.searchText).toContain("episode 1");
    expect(chapter.searchText).toContain("episode 3");
  });

  test("chapters are found by id and unknown ids are null", () => {
    expect(findStoryChapter(stories, 10)?.name).toBe("Colors of Pure Sense");
    expect(findStoryChapter(stories, 99)).toBeNull();
    expect(groupStoryChapters([episode({ id: 5, chapterId: null })])).toEqual([]);
  });
});

describe("story chapter paths", () => {
  test("a chapter path carries its section and id", () => {
    expect(storyChapterPath("event", 184)).toBe("/story/event/184");
    expect(storyChapterPath("main", 7)).toBe("/story/main/7");
    expect(parseStoryChapterPath("/story/event/184")).toEqual({ section: "event", chapterId: 184 });
    expect(parseStoryChapterPath("/ja/story/main/7")).toEqual({ section: "main", chapterId: 7 });
  });

  test("other sections and invalid ids are not chapter pages", () => {
    expect(parseStoryChapterPath("/story/friendship/184")).toBeNull();
    expect(parseStoryChapterPath("/story/main/0")).toBeNull();
    expect(parseStoryChapterPath("/story/184")).toBeNull();
  });

  test("the chapter route matches beside the story list and detail routes", () => {
    const chapter = findRouteMatch("/story/event/184");
    expect(chapter?.item.id).toBe("story-chapter");
    expect(chapter?.params).toEqual({ category: "event", id: "184" });
    expect(findRouteMatch("/story/event")?.item.id).toBe("event-story");
    expect(findRouteMatch("/story/184")?.item.id).toBe("story-detail");
  });
});
