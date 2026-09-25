import { describe, expect, test } from "bun:test";
import { normalizeStories, storyNeighbors, type RawStoryEpisode, type StoryMasterData } from "../src/lib/story/data";

function episode(id: number, episodeNumber: number, kind: "main" | "another" | "extra" = "main", characterId = 0): RawStoryEpisode {
  return {
    id, advId: id, chapterId: 5, episodeNumber, characterId,
    isAnotherEpisode: kind === "another", isExtraEpisode: kind === "extra",
    banner: "", image: "", thumbnail: "", descriptionTextId: "", characterRank: 0, eventPoint: 0, eventStoryRewardGroupId: 0,
    isEventSecondHalfEpisode: false, storyFriendshipEpisodeId: 0, storyRewardGroupId: 0, unlockEpisodeNumber: 0, playerRank: 0, bandRank: 0,
  };
}

describe("story list", () => {
  const episodes = [episode(1, 1), episode(21, 1, "another", 21), episode(2, 2), episode(31, 1, "extra"), episode(22, 2, "another", 22)];
  const data: StoryMasterData = {
    chapters: [{ id: 5, bandId: 5, banner: "", descriptionTextId: "", endAt: "", eventId: 0, icon: "", image: "", isSpecialStory: false, mainCharacterIds: [21, 22, 23], musicId: 0, nameTextId: "", startAt: "" }],
    episodes,
    friendshipEpisodes: [], homeTapEpisodes: [], liveResultEpisodes: [], homeSpots: [], friendships: [], bands: [], texts: [],
    advs: episodes.map((entry) => ({ id: entry.advId, advEpisodeAsset: `adv_script_test_${entry.id}`, playbackMode: 0, sheetName: "", titleTextId: `T${entry.id}` })),
    characters: [21, 22, 23].map((id) => ({ id, bandID: 5, displayOrder: id, nameTextID: `N${id}`, shortNameTextID: `S${id}`, mainColorCode: "" })),
  };

  test("a chapter lists its main episodes, then another episodes, then extra episodes", () => {
    const stories = normalizeStories(data, "en-US");
    expect(stories.map((story) => [story.advId, story.episodeKind, story.episodeNumber])).toEqual([
      [1, "main", 1], [2, "main", 2], [21, "another", 1], [22, "another", 2], [31, "extra", 1],
    ]);
    // An another episode follows its own character, not the chapter's cast.
    expect(stories.find((story) => story.advId === 22)?.characterIds).toEqual([22]);
  });

  test("previous and next follow that order", () => {
    const stories = normalizeStories(data, "en-US");
    const { previous, next } = storyNeighbors(stories, 21);
    expect([previous?.advId, next?.advId]).toEqual([2, 22]);
    expect(storyNeighbors(stories, 1).previous).toBeNull();
    expect(storyNeighbors(stories, 31).next).toBeNull();
  });
});
