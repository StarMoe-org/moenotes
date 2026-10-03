import { describe, expect, test } from "bun:test";
import type { AppLocale } from "../src/config/locales";
import { normalizeEvents, type EventMasterData, type RawEvent, type RawEventMission } from "../src/lib/events/data";
import { normalizeRewardEntries, type RawLimitedMission, type RawSeasonPassMission, type RewardsMasterData } from "../src/lib/rewards/data";
import type { RewardResolver } from "../src/lib/rewards/resources";
import { describeMission, type MissionDescribeContext } from "../src/lib/missions/describe";

// Fixed fixtures shared by both normalizers. Expected strings were captured from the pre-refactor implementations of
// events/data.ts `describeMission` and rewards/data.ts `describe`, so the shared helper must reproduce them exactly.
const text = (id: string, english: string, simplifiedChinese = "", japanese = "") =>
  ({ id, english, simplifiedChinese, japanese, traditionalChinese: "", korean: "" });

const texts = [
  text("Mission_Achieve", "Clear {AchievementCount}  lives  ", "完成{AchievementCount}次演出"),
  text("Mission_Music", "Clear {MusicId} on {MusicDifficulty} with rank {ScoreRank} or higher", "以{ScoreRank}以上评价通关{MusicDifficulty}的{MusicId}"),
  text("Mission_Band", "Use {BandId}\tmembers \t with {CharacterId} and a {CardType} card", "编入{BandId}与{CharacterId}的{CardType}卡"),
  text("Mission_Story", "Read Episode {EpisodeId.Value} \"{EpisodeId}\" of {StoryChapterId}", "阅读{StoryChapterId}第{EpisodeId.Value}话「{EpisodeId}」"),
  text("Mission_Exchange", "Exchange {Value} times at {ExchangeId} {MissionCategory}", "在{ExchangeId}交换{Value}次{MissionCategory}"),
  text("Mission_Missing", "  {Unknown}   only   {MusicId}  ", ""),
  text("Exchange_1", "Event Shop", "活动交换所"),
  text("Chapter_1", "Main Story Ch.1", "主线第一章"),
  text("Adv_Title_5", "First Meeting", "初次见面"),
  text("Band_1", "Sumimi", "Sumimi"),
  text("Char_1", "Mana", "真奈"),
  text("ui_difficulty_easy", "EASY"),
  text("ui_difficulty_normal", "NORMAL"),
  text("ui_difficulty_hard", "HARD"),
  text("ui_difficulty_expert", "EXPERT"),
  text("Event_1", "Fixture Event", "测试活动"),
];

const fields = {
  achievementCount: 0, value: 0, exchangeId: 0, characterId: 0, bandId: 0, musicId: 0, musicDifficulty: 0,
  scoreRank: 0, cardType: 0, storyChapterId: 0, episodeId: 0,
};
const missions = [
  { id: 1, descriptionTextId: "Mission_Achieve", ...fields, achievementCount: 12345 },
  { id: 2, descriptionTextId: "Mission_Music", ...fields, musicId: 7, musicDifficulty: 3, scoreRank: 6 },
  { id: 3, descriptionTextId: "Mission_Band", ...fields, bandId: 1, characterId: 1, cardType: 2 },
  { id: 4, descriptionTextId: "Mission_Story", ...fields, storyChapterId: 1, episodeId: 50 },
  { id: 5, descriptionTextId: "Mission_Exchange", ...fields, value: 1500, exchangeId: 1 },
  { id: 6, descriptionTextId: "Mission_Missing", ...fields, musicId: 999, musicDifficulty: 1 },
  { id: 7, descriptionTextId: "Mission_Music", ...fields, musicId: 7, musicDifficulty: 0, scoreRank: 1 },
];

const lookups = {
  exchanges: [{ id: 1, nameTextId: "Exchange_1" }],
  chapters: [{ id: 1, nameTextId: "Chapter_1" }],
  episodes: [{ id: 50, episodeNumber: 3, advId: 5 }],
};
const resolve: RewardResolver = (row) => ({ kind: "item", id: row.resourceId, count: row.resourceCount, name: "", imageUrl: "" });

function eventDescriptions(locale: AppLocale): string[] {
  const event: RawEvent = {
    id: 1, nameTextId: "Event_1", startAt: "", endAt: "", displayEndAt: "", eventType: 1, storyChapterId: 0, eventItemId: 0,
    isRankingDisabled: true, isMusicRankingDisabled: true, isTotalMusicRankingDisabled: true, liveEventRewardGroup: 0,
    liveEventPointGroup: 0, challengeLiveEventRewardGroup: 0, challengeLiveEventPointGroup: 0, musicId: 0, logoAsset: "", backgroundAsset: "",
  };
  const eventMissions: RawEventMission[] = missions.map((mission) => ({ ...mission, eventMissionGroupId: 1, missionType: 1, priority: mission.id, missionRewardIds: [] }));
  const data: EventMasterData = {
    events: [event], effects: [], pickUpCards: [], achievementRewards: [], loopRewards: [], livePoints: [], liveRewards: [],
    challengePoints: [], challengeRewards: [], eventMissions,
    missionLookups: { ...lookups, advs: [{ id: 5, nameTextId: "Adv_Title_5" }] },
    boxGachas: [], boxGachaRewards: [], rankingRewards: [], challengeMusic: [], challengeBoostBonuses: [], challengeMusicRankingRewards: [],
    rewards: [],
    characters: [{ id: 1, bandID: 1, displayOrder: 1, nameTextID: "Char_1", enDisplayNameTextId: "", mainColorCode: "" }],
    bands: [{ id: 1, nameTextID: "Band_1", mainColorCode: "" }],
    texts,
  };
  const music = [{ id: 7, title: "Fixture Song" }] as unknown as Parameters<typeof normalizeEvents>[1]["music"];
  const [detail] = normalizeEvents(data, { cards: [], supportCards: [], music, stories: [] }, resolve, locale);
  return detail!.missions.map((mission) => mission.description);
}

function rewardDescriptions(locale: AppLocale): string[] {
  const passMissions: RawSeasonPassMission[] = missions.map((mission) => ({ ...mission, priority: mission.id, seasonPassId: 1, missionCategory: 2, seasonPassPoint: 10 }));
  const limited: RawLimitedMission[] = missions.map((mission) => ({ ...mission, priority: mission.id, limitedMissionGroupId: 1, releaseDay: 1, missionRewardIds: [] }));
  const data: RewardsMasterData = {
    ...lookups,
    advs: [{ id: 5, titleTextId: "Adv_Title_5" }],
    bands: [{ id: 1, nameTextID: "Band_1" }],
    characters: [{ id: 1, nameTextID: "Char_1" }],
    music: [{ id: 7, title: "Fixture Song" }],
    seasonPasses: [{ id: 1, nameTextId: "", descriptionTextId: "", levelGroup: 1, startAt: "", endAt: "", recommendationLevelRewardIds: [], bannerAsset: "" }],
    seasonPassLevels: [], seasonPassLevelRewards: [], seasonPassRewards: [], seasonPassMissions: passMissions,
    missionGroups: [{ id: 1, nameTextID: "", completeRewardIds: [], bannerAsset: "", startAt: "", endAt: "" }],
    missions: limited, missionRewards: [], loginBonuses: [], loginBonusSlots: [], texts,
  };
  const entries = normalizeRewardEntries(data, resolve, locale);
  const pass = entries.find((entry) => entry.kind === "seasonPass");
  const group = entries.find((entry) => entry.kind === "mission");
  const passList = pass && "missionGroups" in pass ? pass.missionGroups.flatMap((g) => g.missions.map((m) => m.description)) : [];
  const groupList = group && "days" in group ? group.days.flatMap((d) => d.missions.map((m) => m.description)) : [];
  expect(passList).toEqual(groupList);
  return groupList;
}

describe("mission descriptions (events/data.ts)", () => {
  test("en-US matches the original output", () => {
    expect(eventDescriptions("en-US")).toEqual([
      "Clear 12,345 lives",
      "Clear Fixture Song on with rank S or higher",
      "Use Sumimi\tmembers with Mana and a Blue card",
      "Read Episode 3 \"First Meeting\" of Main Story Ch.1",
      "Exchange 1500 times at Event Shop",
      "only",
      "Clear Fixture Song on with rank or higher",
    ]);
  });
  test("zh-CN matches the original output", () => {
    expect(eventDescriptions("zh-CN")).toEqual([
      "完成12,345次演出",
      "以S以上评价通关的Fixture Song",
      "编入Sumimi与真奈的绀碧卡",
      "阅读主线第一章第3话「初次见面」",
      "在活动交换所交换1500次",
      "only",
      "以以上评价通关的Fixture Song",
    ]);
  });
});

describe("mission descriptions (rewards/data.ts)", () => {
  test("en-US matches the original output", () => {
    expect(rewardDescriptions("en-US")).toEqual([
      "Clear 12,345 lives",
      "Clear Fixture Song on EXPERT with rank S or higher",
      "Use Sumimi\tmembers with Mana and a Blue card",
      "Read Episode 3 \"First Meeting\" of Main Story Ch.1",
      "Exchange 1500 times at Event Shop",
      "only",
      "Clear Fixture Song on EASY with rank or higher",
    ]);
  });
  test("zh-CN matches the original output", () => {
    expect(rewardDescriptions("zh-CN")).toEqual([
      "完成12,345次演出",
      "以S以上评价通关EXPERT的Fixture Song",
      "编入Sumimi与真奈的绀碧卡",
      "阅读主线第一章第3话「初次见面」",
      "在活动交换所交换1500次",
      "only",
      "以以上评价通关EASY的Fixture Song",
    ]);
  });
});

describe("describeMission (shared)", () => {
  const ctx: MissionDescribeContext = {
    locale: "en-US",
    text: (id) => texts.find((row) => row.id === id)?.english ?? "",
    exchangeName: (id) => (id === 1 ? "Event Shop" : undefined),
    chapterName: () => undefined,
    episode: () => undefined,
    bandName: () => undefined,
    characterName: () => undefined,
    musicTitle: (id) => (id === 7 ? "Song" : undefined),
    difficulty: () => "HARD",
  };
  test("fills known placeholders, drops unknown ones and collapses runs of spaces", () => {
    expect(describeMission(missions[1]!, ctx)).toBe("Clear Song on HARD with rank S or higher");
    expect(describeMission(missions[5]!, ctx)).toBe("only");
    expect(describeMission({ ...missions[5]!, musicId: 7 }, ctx)).toBe("only Song");
  });
  test("fillMissionTemplate leaves single tabs and newlines intact", async () => {
    const { fillMissionTemplate } = await import("../src/lib/missions/describe");
    expect(fillMissionTemplate("a  {X}\n {Y}  b", { X: "1" })).toBe("a 1\n b");
  });
});
