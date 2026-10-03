import { describe, expect, test } from "bun:test";
import { missionCategoryKey, normalizeRegularMissions, parseMissionsDeepLink, type MissionSources, type RawMission } from "../src/lib/missions/data";
import type { RewardResolver } from "../src/lib/rewards/resources";

const mission = (over: Partial<RawMission>): RawMission => ({
  id: 1, missionCategory: 4, missionType: 1, descriptionTextId: "Mission_Description_PlayerRank", achievementCount: 5, value: 0, exchangeId: 0,
  characterId: 0, bandId: 0, musicId: 0, musicDifficulty: 0, scoreRank: 0, cardType: 0, storyChapterId: 0, episodeId: 0, priority: 1,
  missionRewardIds: [], startAt: "2026/01/01 0:00:00", endAt: "null", ...over,
});
const text = (id: string, english: string) => ({ id, japanese: "", english, simplifiedChinese: "", traditionalChinese: "", korean: "" });

function sources(over: Partial<MissionSources> = {}): MissionSources {
  return {
    missions: [
      mission({ id: 400000002, priority: 2 }),
      mission({ id: 100000001, missionCategory: 1, descriptionTextId: "Mission_Description_MissionClear", missionRewardIds: [2] }),
      mission({ id: 1600000001, missionCategory: 16, descriptionTextId: "Mission_Description_BandRank", bandId: 1, missionRewardIds: [171, 999] }),
      mission({ id: 400000001, priority: 1 }),
      mission({ id: 950000001, missionCategory: 9, descriptionTextId: "Mission_Description_LiveClearMusic", musicId: 100001, achievementCount: 100, startAt: "", endAt: "" }),
    ],
    missionRewards: [{ id: 2, resourceType: 1, resourceId: 1, resourceCount: 5 }, { id: 171, resourceType: 19, resourceId: 10002, resourceCount: 1 }],
    exchanges: [], chapters: [], episodes: [], advs: [],
    bands: [{ id: 1, nameTextID: "Band_Name_1" }],
    characters: [],
    music: [{ id: 100001, title: "Abracadabra" }],
    texts: [
      text("Mission_Description_PlayerRank", "Raise Player Rank to {AchievementCount}"),
      text("Mission_Description_MissionClear", "Clear {AchievementCount} {MissionCategory} Missions"),
      text("Mission_Description_BandRank", "Raise Band Rank of \"{BandId}\" to {BandRank}"),
      text("Mission_Description_LiveClearMusic", "Clear the song \"{MusicId}\" {AchievementCount} time(s)"),
      text("Band_Name_1", "MyGO!!!!!"),
    ],
    ...over,
  };
}

const resolve: RewardResolver = (resource) => ({ kind: "item", id: resource.resourceId, count: resource.resourceCount, name: "", imageUrl: "" });

describe("regular missions", () => {
  test("group by category in tab order, each in the game's order", () => {
    const categories = normalizeRegularMissions(sources(), resolve, "en-US");
    expect(categories.map((category) => category.id)).toEqual([1, 4, 9, 16]);
    expect(categories[1]!.missions.map((entry) => entry.id)).toEqual([400000001, 400000002]);
  });

  test("describe each mission with its placeholders, the category name included", () => {
    const [daily, normal, titles, home] = normalizeRegularMissions(sources(), resolve, "en-US");
    expect(daily!.missions[0]!.description).toBe("Clear 5 Daily Missions");
    expect(normal!.missions[0]!.description).toBe("Raise Player Rank to 5");
    expect(titles!.missions[0]!.description).toBe("Clear the song \"Abracadabra\" 100 time(s)");
    expect(home!.missions[0]!.description).toContain("MyGO!!!!!");
  });

  test("carry the goal and resolved rewards; unknown reward ids drop out; 'null' dates read as open", () => {
    const categories = normalizeRegularMissions(sources(), resolve, "en-US");
    const home = categories.find((category) => category.id === 16)!.missions[0]!;
    expect(home.rewards.map((reward) => reward.id)).toEqual([10002]);
    expect(categories[1]!.missions[0]!.goal).toBe(5);
    expect(categories[1]!.missions[0]!.endAt).toBe("");
  });

  test("category keys name the known categories", () => {
    expect([1, 4, 9, 15, 16, 7].map(missionCategoryKey)).toEqual(["daily", "normal", "titles", "songs", "home", "other"]);
  });
});

describe("missions deep link", () => {
  test("reads mode and id; anything else is ignored", () => {
    expect(parseMissionsDeepLink("?mode=regular&id=400000001")).toEqual({ mode: "regular", id: 400000001 });
    expect(parseMissionsDeepLink("?mode=limited&id=1")).toEqual({ mode: "limited", id: 1 });
    expect(parseMissionsDeepLink("?mode=other&id=abc")).toEqual({ mode: null, id: null });
    expect(parseMissionsDeepLink("")).toEqual({ mode: null, id: null });
  });
});
