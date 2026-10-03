import { describe, expect, test } from "bun:test";
import { degreeRankUnlocks, degreeSourceCardId, isDegreeRetired, normalizeDegrees } from "../src/lib/degrees/data";
import { birthdayChapterCharacters, normalizeStories, type RawStoryChapter, type RawStoryEpisode, type StoryMasterData } from "../src/lib/story/data";
import { carouselImagePaths, normalizeHelp, stripHelpBrackets } from "../src/lib/help/data";
import { formatPlayTime, storyUnlockLabels } from "../src/lib/story/labels";
import type { RewardResolver } from "../src/lib/rewards/resources";

const text = (id: string, english: string, simplifiedChinese = english) => ({ id, japanese: "", english, simplifiedChinese, traditionalChinese: "", korean: "" });

describe("title unlocks", () => {
  const characters = [
    { id: 1, bandID: 1, displayOrder: 1, nameTextID: "Chara_1", enDisplayNameTextId: "", mainColorCode: "" },
    { id: 2, bandID: 1, displayOrder: 2, nameTextID: "Chara_2", enDisplayNameTextId: "", mainColorCode: "" },
  ];
  const rankRewards = [
    { characterId: 1, rank: 25, resourceType: 17, resourceId: 105, resourceCount: 1 },
    { characterId: 1, rank: 15, resourceType: 17, resourceId: 105, resourceCount: 1 },
    { characterId: 2, rank: 15, resourceType: 17, resourceId: 106, resourceCount: 1 },
    // Items and shared (characterId 0) rows are not title unlocks.
    { characterId: 1, rank: 2, resourceType: 1, resourceId: 105, resourceCount: 500 },
    { characterId: 0, rank: 3, resourceType: 17, resourceId: 106, resourceCount: 1 },
  ];

  test("character rank rewards of resource type 17 are reverse-mapped to their title, lowest rank first", () => {
    const map = degreeRankUnlocks(rankRewards);
    expect(map.get(105)).toEqual([{ characterId: 1, rank: 15 }, { characterId: 1, rank: 25 }]);
    expect(map.get(106)).toEqual([{ characterId: 2, rank: 15 }]);
  });

  test("normalized titles carry their unlocks, schedule, source card and character names", () => {
    const [card, sticker] = normalizeDegrees([
      { id: 5, nameTextId: "D5", descriptionTextId: "", degreeType: 1, characterIds: [1], imagePath: "MemberCard/12/member_character", orderNum: 1, startAt: "", endAt: "null" },
      { id: 105, nameTextId: "D105", descriptionTextId: "", degreeType: 3, characterIds: [], imagePath: "Image/Degree/Char/02/degree_char_02_01", orderNum: 2, startAt: "2026/01/01 0:00:00", endAt: "" },
    ], characters, [text("Chara_1", "Tomori"), text("D5", "Card"), text("D105", "[Sticker] Tomori")], "en-US", rankRewards);
    expect(card).toMatchObject({ sourceCardId: 12, unlocks: [], characterNames: ["Tomori"] });
    expect(sticker).toMatchObject({ name: "Tomori", startAt: "2026/01/01 0:00:00" });
    expect(sticker?.unlocks.map((unlock) => [unlock.characterName, unlock.rank])).toEqual([["Tomori", 15], ["Tomori", 25]]);
  });

  test("source cards and retirement", () => {
    expect(degreeSourceCardId("MemberCard/7/member_character")).toBe(7);
    expect(degreeSourceCardId("Image/Degree/Other/degree_animelogo_01")).toBeNull();
    const now = Date.parse("2026-10-10T00:00:00+08:00");
    expect(isDegreeRetired({ endAt: "null" }, now)).toBe(false);
    expect(isDegreeRetired({ endAt: "" }, now)).toBe(false);
    expect(isDegreeRetired({ endAt: "2026/10/01 0:00:00" }, now)).toBe(true);
    expect(isDegreeRetired({ endAt: "2026/12/01 0:00:00" }, now)).toBe(false);
  });
});

describe("birthday stories", () => {
  const chapter = (id: number, isSpecialStory = false, mainCharacterIds: number[] = []): RawStoryChapter => ({
    id, bandId: 0, banner: "", descriptionTextId: "", endAt: "", eventId: 0, icon: "", image: "", isSpecialStory, mainCharacterIds, musicId: 0, nameTextId: `C${id}`, startAt: "2026/01/01 0:00:00",
  });
  const episode = (id: number, chapterId: number, storyRewardGroupId = 0): RawStoryEpisode => ({
    id, advId: id, chapterId, episodeNumber: 1, characterId: 0, isAnotherEpisode: false, isExtraEpisode: false, banner: "", image: "", thumbnail: "", descriptionTextId: "",
    characterRank: 0, eventPoint: 0, eventStoryRewardGroupId: 0, isEventSecondHalfEpisode: false, storyFriendshipEpisodeId: 0, storyRewardGroupId, unlockEpisodeNumber: 0, playerRank: 0, bandRank: 0,
  });
  const landing = { id: 1, storyChapterId: 33, storyEpisodeId: 3301, startAt: "", endAt: "", contentPrefabAddress: "Birthday/birthday_effect", characterId: 22 };

  test("Birthday/ login landings and special chapters mark birthday chapters", () => {
    const map = birthdayChapterCharacters([chapter(1), chapter(33, true, [22]), chapter(40, true, [5])], [landing, { ...landing, id: 2, storyChapterId: 1, contentPrefabAddress: "Event/effect" }]);
    expect([...map]).toEqual([[33, 22], [40, 5]]);
    // The JP server has no landing rows; its special chapter still counts.
    expect([...birthdayChapterCharacters([chapter(33, true, [22])], [])]).toEqual([[33, 22]]);
  });

  const resolve: RewardResolver = (resource) => ({ kind: "item", id: resource.resourceId, count: resource.resourceCount, name: `Item ${resource.resourceId}`, imageUrl: "" });
  const data: StoryMasterData = {
    chapters: [chapter(5, false, [1]), chapter(33, true, [22])],
    episodes: [episode(5001, 5, 2), episode(3301, 33)],
    friendshipEpisodes: [], homeTapEpisodes: [], liveResultEpisodes: [], homeSpots: [], friendships: [], bands: [],
    texts: [text("N22", "Miku")],
    advs: [5001, 3301].map((id) => ({ id, advEpisodeAsset: `adv_script_test_${id}`, playbackMode: 0, sheetName: "", titleTextId: `T${id}` })),
    characters: [1, 22].map((id) => ({ id, bandID: 1, displayOrder: id, nameTextID: `N${id}`, shortNameTextID: `S${id}`, mainColorCode: "", birthdayMonth: 10, birthdayDay: 4 })),
    loginLandings: [landing],
    playTimes: [{ id: 5001, playTime: 633 }],
    storyRewards: [{ group: 2, resourceType: 1, resourceId: 1, resourceCount: 50 }, { group: 3, resourceType: 1, resourceId: 9, resourceCount: 1 }],
    resolveReward: resolve,
  };

  test("birthday episodes leave the main story and name the birthday character", () => {
    const stories = normalizeStories(data, "en-US");
    expect(stories.map((story) => [story.advId, story.category])).toEqual([[5001, "main"], [3301, "birthday"]]);
    expect(stories.find((story) => story.advId === 3301)?.birthday).toEqual({ characterId: 22, characterName: "Miku", month: 10, day: 4 });
  });

  test("episodes carry their play time and clear rewards", () => {
    const main = normalizeStories(data, "en-US").find((story) => story.advId === 5001)!;
    expect(main.playTime).toBe(633);
    expect(main.rewards.map((reward) => [reward.id, reward.count])).toEqual([[1, 50]]);
    expect(formatPlayTime(main.playTime)).toBe("10:33");
    expect(formatPlayTime(3725)).toBe("1:02:05");
    expect(formatPlayTime(null)).toBe("");
  });

  test("unlock conditions render as labels", () => {
    const labels = storyUnlockLabels("en-US", {
      unlock: { episodeNumber: 2, playerRank: 10, characterRank: 0, friendshipLevel: 5, eventPoint: 0, bandRank: 0, releaseChapterId: 0, releaseEpisodeId: 0 },
      category: "friendship", characterIds: [], characterNames: [], bandName: "",
    });
    expect(labels.map((label) => label.key)).toEqual(["player", "friendship", "episode"]);
  });
});

describe("help", () => {
  const texts = [
    text("Help_Category_Title_10", "[Home]", "【主页】"),
    text("Help_Category_Title_20", "[Live]"),
    text("Help_SubCategory_Title_10001", "About Home"),
    text("Help_SubCategory_Description_10001", "Line one\r\nLine <b>two</b>"),
    text("Help_SubCategory_Title_10002", "Gifts"),
    text("Help_SubCategory_Title_20001", "Lives"),
    text("Help_Carousel_Title_4", "Band"),
    text("Tips_Name_1", "Item Details"),
    text("Tips_Description_1", "Long-press an item."),
    text("Faq_Title_1", "Question"),
    text("Faq_Detail_1", "Answer"),
  ];
  const help = normalizeHelp({
    categories: [{ id: 20, titleTextId: "Help_Category_Title_20", order: 2 }, { id: 10, titleTextId: "Help_Category_Title_10", order: 1 }, { id: 30, titleTextId: "Missing", order: 3 }],
    subCategories: [
      { id: 10002, helpCategoryId: 10, titleTextId: "Help_SubCategory_Title_10002", descriptionTextId: "", order: 10002 },
      { id: 20001, helpCategoryId: 20, titleTextId: "Help_SubCategory_Title_20001", descriptionTextId: "", order: 20001 },
      { id: 10001, helpCategoryId: 10, titleTextId: "Help_SubCategory_Title_10001", descriptionTextId: "Help_SubCategory_Description_10001", order: 10001 },
      { id: 99001, helpCategoryId: 99, titleTextId: "x", descriptionTextId: "", order: 1 },
    ],
    carousels: [{ id: 4, helpCategoryId: 20, displayName: "BandTop", titleTextId: "Help_Carousel_Title_4", suffix: "", pageCount: 2 }],
    tips: [{ id: 1, title: "Tips_Name_1", description: "Tips_Description_1" }],
    faq: [{ id: 1, title: "Faq_Title_1", detail: "Faq_Detail_1", startAt: "2026/01/01 0:00:00", endAt: "null" }],
    texts,
  }, "zh-CN");

  test("categories follow their order; topics without a known category are dropped; empty categories hidden", () => {
    expect(help.categories.map((category) => [category.id, category.title, category.topicIds])).toEqual([[10, "主页", [10001, 10002]], [20, "Live", [20001]]]);
    expect(help.topics.map((topic) => topic.id)).toEqual([10001, 10002, 20001]);
  });

  test("bodies keep line breaks and rich text runs", () => {
    const topic = help.topics[0]!;
    expect(topic.body.text).toBe("Line one\nLine two");
    expect(topic.body.runs?.some((run) => run.bold)).toBe(true);
    expect(topic.categoryTitle).toBe("主页");
  });

  test("carousels attach to their category with one image per page", () => {
    const carousel = help.categories[1]!.carousels[0]!;
    expect(carousel.title).toBe("Band");
    expect(carousel.imageUrls).toHaveLength(2);
    expect(carousel.imageUrls[1]).toContain("Image/CarouselHelp/Help_BandTop_1/Help_BandTop_1.webp");
  });

  test("carousel suffixes are appended to the name", () => {
    expect(carouselImagePaths({ displayName: "ExchangeItemList", suffix: "12", pageCount: 1 })).toEqual(["Image/CarouselHelp/Help_ExchangeItemList12_0"]);
    expect(stripHelpBrackets("【主页】")).toBe("主页");
    expect(stripHelpBrackets("[Home]")).toBe("Home");
  });

  test("tips and FAQ resolve their text ids; a 'null' end date stays as written", () => {
    expect(help.tips.map((tip) => [tip.title, tip.body.text])).toEqual([["Item Details", "Long-press an item."]]);
    expect(help.faq[0]).toMatchObject({ title: "Question", endAt: "null" });
  });
});
