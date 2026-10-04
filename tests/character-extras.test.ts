import { describe, expect, test } from "bun:test";
import {
  characterVoiceLines,
  collectVoiceLines,
  groupVoiceLines,
  voiceAudioUrl,
  voiceLinesByCharacter,
  type CharacterVoicesPayload,
  type VoiceTables,
} from "../src/lib/characters/voices";
import {
  characterFriendshipStories,
  characterMissionText,
  characterPartners,
  characterRelatedStories,
  groupCharacterMissions,
  unpackMissionRows,
} from "../src/lib/characters/relations";
import {
  birthdaySortValue,
  bandPartPositions,
  matchesCharacterFilters,
  positionOptions,
  schoolOptions,
  EMPTY_CHARACTER_FILTERS,
} from "../src/lib/characters/list-filter";
import { cardSortReaders, listSortOf, tableSortOf, CARD_SORT_FIELDS } from "../src/lib/cards/list-sort";
import { sortEntries } from "../src/lib/filter/list-sort";
import { getVoiceTypeName } from "../src/lib/characters/data";
import { assetConfig } from "../src/config/assets";
import type { StoryViewModel } from "../src/lib/story/data";

const sound = (id: number) => (id ? `Sheet_${Math.floor(id / 1000)}/Cue_${id}` : "");

// Rows as validateMasterTable leaves them (leading `_` stripped), in each table's own key spelling.
const tables: VoiceTables = {
  talks: [
    { id: 1, characterId: 1, category: 0, textId: "Talk_1", voiceSoundId: 1001, unlockCharacterRank: 1 },
    { id: 2, characterId: 1, category: 2, textId: "Talk_2", voiceSoundId: 1002, seasonStartAt: "4/1", seasonEndAt: "4/30" },
    { id: 3, characterId: 1, category: 3, textId: "Talk_3", voiceSoundId: 1003, birthdayCharacterId: 2 },
    { id: 4, characterId: 2, category: 0, textId: "Talk_4", voiceSoundId: 2001 },
  ],
  characterVoices: [{ id: 10, characterId: 1, type: 7, textId: "CV_10", soundId: 1010, scoreRank: 7 }],
  memberCards: [
    { id: 100, characterID: 1, gachaVoiceTextId: "Gacha_100", gachaVoiceSoundId: 1100 },
    { id: 101, characterID: 1, gachaVoiceTextId: "", gachaVoiceSoundId: 0 },
  ],
  liveCharacters: [{ id: 1, characterID: 1, liveSkillVoiceTextID: "Skill_1", liveSkillVoiceSoundID: 1200 }],
  gekisouVoices: [{ id: 1, characterID: 1, gekisouVoiceType: 3, voiceTextID: "Gekisou_1", voiceID: 1300 }],
  dialogueCommons: [{ id: 1, characterID: 1, dialogueType: 2, comboVoiceTextID: "Common_1", comboVoiceSoundID: 1400 }],
  dialoguePairs: [{
    id: 7, dialogueType: 1, characterID01: 1, characterID02: 2,
    character01ComboVoiceTextID: "Pair_7_a", character01ComboVoiceSoundID: 1500,
    character02ComboVoiceTextID: "Pair_7_b", character02ComboVoiceSoundID: 2500,
  }],
  liveStarts: [{ id: 1, characterId: 1, voiceTextId: "Start_1", voiceSoundId: 1600 }],
};

describe("character voices", () => {
  const lines = collectVoiceLines(tables, sound, getVoiceTypeName);
  const byCharacter = voiceLinesByCharacter(lines);

  test("each source table becomes its own group, in page order, with MasterTalk split by kind", () => {
    const groups = groupVoiceLines(byCharacter["1"] ?? []);
    expect(groups.map((group) => group.source)).toEqual([
      "talk", "characterVoice", "memberCard", "liveStart", "liveCharacter", "liveGekisou", "liveDialogueCommon", "liveDialogueFixedPair",
    ]);
    expect(groups[0]!.sections.map((section) => [section.kind, section.lines.map((line) => line.id)])).toEqual([["normal", [1]], ["seasonal", [2]], ["birthday", [3]]]);
    const talk = groups[0]!.sections;
    expect(talk[1]!.lines[0]).toMatchObject({ seasonStart: "4/1", seasonEnd: "4/30" });
    expect(talk[2]!.lines[0]).toMatchObject({ birthdayCharacterId: 2 });
  });

  test("source-specific labels: voice type and score rank, gekisou and dialogue types, the card of a gacha voice", () => {
    const own = byCharacter["1"] ?? [];
    expect(own.find((line) => line.source === "characterVoice")).toMatchObject({ kind: "result", scoreRank: 7 });
    expect(own.find((line) => line.source === "liveGekisou")).toMatchObject({ kind: "top" });
    expect(own.find((line) => line.source === "liveDialogueCommon")).toMatchObject({ kind: "skill" });
    // A card without a gacha voice adds no line.
    expect(own.filter((line) => line.source === "memberCard").map((line) => line.cardId)).toEqual([100]);
  });

  test("a pair dialogue shows on both characters' pages, each side naming and carrying the other", () => {
    const first = byCharacter["1"]!.find((line) => line.source === "liveDialogueFixedPair");
    const second = byCharacter["2"]!.find((line) => line.source === "liveDialogueFixedPair");
    expect(first).toMatchObject({ id: 7, partnerId: 2, pairOrder: 1, text: "Pair_7_a", partnerText: "Pair_7_b", kind: "combo" });
    expect(second).toMatchObject({ id: 7, partnerId: 1, pairOrder: 2, text: "Pair_7_b", partnerText: "Pair_7_a", sound: sound(2500), partnerSound: sound(1500) });
  });

  test("lines resolve to the cue file inside their sheet; a server without its own set reads the first", () => {
    expect(voiceAudioUrl("VoiceLive_01/Live_Tomori_Start_01_1", "ja-JP")).toBe(`${assetConfig.api}/ja/Cri/Sound/VoiceLive_01/Live_Tomori_Start_01_1.m4a`);
    expect(voiceAudioUrl("", "ja-JP")).toBe("");
    const payload: CharacterVoicesPayload = { texts: {}, sets: [byCharacter], servers: { tw: 0 } };
    expect(characterVoiceLines(payload, "jp", 2).map((line) => line.source)).toEqual(["talk", "liveDialogueFixedPair"]);
    expect(characterVoiceLines(payload, "tw", 99)).toEqual([]);
  });
});

describe("character bonds", () => {
  const friendships = [
    { id: 102, masterCharacterIdA: 1, masterCharacterIdB: 2 },
    { id: 301, masterCharacterIdA: 3, masterCharacterIdB: 1 },
    { id: 203, masterCharacterIdA: 2, masterCharacterIdB: 3 },
  ];

  test("a character's partners count pairs where it is A and where it is B", () => {
    expect(characterPartners(friendships, 1)).toEqual([{ friendshipId: 102, partnerId: 2 }, { friendshipId: 301, partnerId: 3 }]);
    expect(characterPartners(friendships, 2)).toEqual([{ friendshipId: 102, partnerId: 1 }, { friendshipId: 203, partnerId: 3 }]);
  });

  const story = (advId: number, category: StoryViewModel["category"], characterIds: number[], friendshipId: number | null, sortOrder: number) =>
    ({ advId, category, characterIds, friendshipId, sortOrder }) as unknown as StoryViewModel;
  const stories = [
    story(12, "friendship", [1, 2], 102, 2),
    story(11, "friendship", [1, 2], 102, 1),
    story(13, "friendship", [2, 3], 203, 3),
    story(20, "main", [1, 4], null, 0),
    story(20, "main", [1, 4], null, 0),
    story(21, "home", [5], null, 5),
  ];

  test("bond stories are the character's pairs' episodes in order; related stories exclude them and repeat no ADV", () => {
    expect(characterFriendshipStories(stories, [102, 301]).map((entry) => entry.advId)).toEqual([11, 12]);
    expect(characterRelatedStories(stories, 1).map((entry) => entry.advId)).toEqual([20]);
  });
});

describe("character missions", () => {
  const missions = [
    { id: 3, titleTextId: "T_Live", descriptionTextId: "D_Live", missionType: 80, achievementCount: 100, priority: 3, missionRewardIds: [154] },
    { id: 2, titleTextId: "T_Live", descriptionTextId: "D_Live", missionType: 80, achievementCount: 50, priority: 2, missionRewardIds: [154] },
    { id: 9, titleTextId: "T_Skill", descriptionTextId: "D_Skill", missionType: 42, achievementCount: 2, value: 3, priority: 9, missionRewardIds: [155] },
  ];
  const text: Record<string, string> = {
    T_Live: "LIVE Clear", D_Live: "Clear {AchievementCount} lives with \"{CharacterId}\" in the deck",
    T_Skill: "Member Skill Level", D_Skill: "Raise {AchievementCount} \"{CharacterId}\" members' skills to Lv.{Value}",
  };

  test("groups the shared templates by type, each by priority, and packs the rows", () => {
    const groups = groupCharacterMissions(missions, (id) => text[id] ?? "");
    expect(groups.map((group) => group.type)).toEqual([42, 80]);
    expect(unpackMissionRows(groups[1]!.rows)).toEqual([
      { achievementCount: 50, value: 0, rewardIds: [154] },
      { achievementCount: 100, value: 0, rewardIds: [154] },
    ]);
    expect(groups[0]!.title).toBe("Member Skill Level");
  });

  test("{CharacterId} reads as the page's character, the other placeholders as the row's", () => {
    expect(characterMissionText(text.D_Live!, "en-US", "Tomori", { achievementCount: 1250, value: 0 })).toBe("Clear 1,250 lives with \"Tomori\" in the deck");
    expect(characterMissionText(text.D_Skill!, "en-US", "Anon", { achievementCount: 2, value: 3 })).toBe("Raise 2 \"Anon\" members' skills to Lv.3");
  });
});

describe("character list filters", () => {
  const characters = [
    { id: 1, bandId: 1, bandPart: "Vo.", schoolKey: "School_A", school: "A", birthdayMonth: 11, birthdayDay: 22, searchText: "tomori" },
    { id: 6, bandId: 2, bandPart: "Gt.&Vo.", schoolKey: "School_B", school: "B", birthdayMonth: 6, birthdayDay: 14, searchText: "uika" },
    { id: 8, bandId: 2, bandPart: "Ba.", schoolKey: "School_B", school: "B", birthdayMonth: 4, birthdayDay: 7, searchText: "mutsumi" },
  ];
  const match = (patch: Partial<typeof EMPTY_CHARACTER_FILTERS>) => characters.filter((entry) => matchesCharacterFilters(entry, { ...EMPTY_CHARACTER_FILTERS, ...patch })).map((entry) => entry.id);

  test("band parts split on '&', so a guitar-vocalist matches both parts", () => {
    expect(bandPartPositions("Gt.&Vo.")).toEqual(["Gt.", "Vo."]);
    expect(positionOptions(characters)).toEqual(["Vo.", "Gt.", "Ba."]);
    expect(match({ positions: ["Vo."] })).toEqual([1, 6]);
  });

  test("school, birth month and band filters combine; values within one facet widen", () => {
    expect(schoolOptions(characters)).toEqual([{ key: "School_A", name: "A" }, { key: "School_B", name: "B" }]);
    expect(match({ schools: ["School_B"] })).toEqual([6, 8]);
    expect(match({ months: [4, 11] })).toEqual([1, 8]);
    expect(match({ schools: ["School_B"], months: [6] })).toEqual([6]);
    expect(match({ bands: [2], query: "mutsu" })).toEqual([8]);
  });

  test("birthday sort orders by month then day", () => {
    const sorted = sortEntries(characters, "field:birthday:asc", "en-US", { numeric: { birthday: birthdaySortValue } });
    expect(sorted.map((entry) => entry.id)).toEqual([8, 6, 1]);
  });
});

describe("card list sorting", () => {
  const cards = [
    { id: 1, performancePower: 9000, technicPower: 7000, visualPower: 7000, totalPower: 23000, skill: "Score UP" },
    { id: 2, performancePower: 8000, technicPower: 9500, visualPower: 7000, totalPower: 24500, skill: "Life UP" },
    { id: 3, performancePower: 8500, technicPower: 7000, visualPower: 9900, totalPower: 25400, skill: "" },
  ];
  const read = cardSortReaders((card: typeof cards[number]) => card.skill, cards.map((card) => card.skill), "en-US");
  const order = (sort: string) => sortEntries(cards, sort as never, "en-US", { numeric: read }).map((card) => card.id);

  test("each stat and the total sort numerically in both directions", () => {
    expect(CARD_SORT_FIELDS.map((field) => field.key)).toEqual(["performance", "technique", "visual", "total", "skill"]);
    expect(order("field:performance:desc")).toEqual([1, 3, 2]);
    expect(order("field:technique:desc")).toEqual([2, 1, 3]);
    expect(order("field:visual:asc")).toEqual([1, 2, 3]);
    expect(order("field:total:desc")).toEqual([3, 2, 1]);
  });

  test("skills sort by name, cards without one last", () => {
    expect(order("field:skill:asc")).toEqual([2, 1, 3]);
    expect(order("field:skill:desc")).toEqual([1, 2, 3]);
  });

  test("table headers and the list sort map onto each other", () => {
    expect(tableSortOf("field:total:desc")).toEqual({ key: "total", direction: "desc" });
    expect(tableSortOf("dateAsc")).toEqual({ key: "startAt", direction: "asc" });
    expect(tableSortOf("default")).toBeNull();
    expect(listSortOf({ key: "rarity", direction: "desc" })).toBe("rarityDesc");
    expect(listSortOf({ key: "title", direction: "asc" })).toBe("nameAsc");
    expect(listSortOf({ key: "visual", direction: "asc" })).toBe("field:visual:asc");
    expect(listSortOf(null)).toBe("default");
  });
});
