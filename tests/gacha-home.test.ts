import { describe, expect, test } from "bun:test";
import type { CardViewModel } from "../src/lib/cards/data";
import { normalizeDegrees } from "../src/lib/degrees/data";
import { normalizeGachas, optionLabel, toGachaSummary, type RawGacha } from "../src/lib/gacha/data";
import { drawGacha } from "../src/lib/gacha/simulate";
import { birthdayCardFor, birthdayGachaFor, buildHomeData, currentHomeEvent, homeBirthdays, homeEvents, type RawHomeBanner } from "../src/lib/home/data";
import { normalizeRewardEntries, type RewardsMasterData, type RewardEntrySummary } from "../src/lib/rewards/data";
import type { RewardResolver } from "../src/lib/rewards/resources";
import { compareByStartDesc, parseMasterDate, scheduleStatus } from "../src/lib/schedule";

const card = (id: number, rarity: 2 | 3 | 4, characterId: number, bandId: number) => ({
  id, assetId: id, characterId, bandId, rarity, cardType: 1, title: `Card ${id}`, characterName: `Chara ${characterId}`,
  bandName: `Band ${bandId}`, characterColor: "", performancePower: 0, technicPower: 0, visualPower: 0, totalPower: 0,
  startAt: "2026-01-01 0:00:00", gachaVoice: "", liveSkillId: 0, leaderSkillId: 0, gekisouSkillId: 0, searchText: "",
}) as CardViewModel;

const gacha = (id: number, overrides: Partial<RawGacha> = {}): RawGacha => ({
  id, nameTextId: `Gacha_Name_${id}`, descriptionTextId: "", lotGroupId: id, startAt: "", endAt: "", priority: 0,
  isLimited: false, bannerAssetName: `Gacha/Banner/gacha_banner_${id}`, logoAssetName: "", ...overrides,
});

const text = (id: string, english: string) => ({ id, japanese: "", english, traditionalChinese: "", simplifiedChinese: "", korean: "" });

describe("schedule", () => {
  test("parses both MasterData date formats as UTC+8 and treats blanks and 'null' as open", () => {
    expect(parseMasterDate("2026/09/28 12:59:59")).toBe(Date.parse("2026-09-28T04:59:59Z"));
    expect(parseMasterDate("2026-09-01 0:00:00")).toBe(Date.parse("2026-08-31T16:00:00Z"));
    expect(parseMasterDate("")).toBeNull();
    expect(parseMasterDate("null")).toBeNull();
  });

  test("derives status from the open or closed ends of a schedule", () => {
    const now = Date.parse("2026-09-24T12:00:00+08:00");
    expect(scheduleStatus("", "2026/09/28 12:59:59", now)).toBe("ongoing");
    expect(scheduleStatus("2026/09/27 15:00:00", "", now)).toBe("upcoming");
    expect(scheduleStatus("2026/01/01 0:00:00", "2026/03/14 14:00:00", now)).toBe("ended");
    expect(scheduleStatus("", "", now)).toBe("permanent");
  });

  test("newest start first, undated entries last", () => {
    const rows = [{ id: 1, startAt: "" }, { id: 2, startAt: "2026/09/29 15:00:00" }, { id: 3, startAt: "2026-01-01 0:00:00" }];
    expect([...rows].sort(compareByStartDesc).map((row) => row.id)).toEqual([2, 3, 1]);
  });
});

describe("gacha normalization", () => {
  const cards = [card(51, 4, 1, 1), card(52, 4, 2, 1), card(53, 4, 3, 1), card(26, 3, 6, 2)];
  const [pickup, permanent] = normalizeGachas(
    [gacha(1, { priority: 10, productId1: 3 }), gacha(2)],
    [
      { lotGroupId: 1, rarityConstraint: 4, resourceTypeConstraint: 2, prizeGroupId: 7, weight: 300 },
      { lotGroupId: 1, rarityConstraint: 3, resourceTypeConstraint: 2, prizeGroupId: 2, weight: 9700 },
      // Stale constraint: the prize rows are items, so this must count as an item pool.
      { lotGroupId: 2, rarityConstraint: 4, resourceTypeConstraint: 2, prizeGroupId: 12, weight: 1 },
    ],
    [
      { groupId: 7, resourceType: 2, resourceId: 51, amount: 1, pickUpType: 2, pickUpFixedRate: 50 },
      { groupId: 7, resourceType: 2, resourceId: 53, amount: 1, pickUpType: 2, pickUpFixedRate: 50 },
      { groupId: 7, resourceType: 2, resourceId: 52, amount: 1, pickUpType: 1 },
      { groupId: 2, resourceType: 2, resourceId: 26, amount: 1, pickUpType: 1 },
      { groupId: 12, resourceType: 1, resourceId: 5, amount: 5000, pickUpType: 1 },
    ],
    [],
    [{ id: 3, drawCount: 10, ensuredCount: 1, ensuredRarity: 3 }],
    cards,
    [],
    [{ id: 5, type: 0, group: 0, name: "Coin", desc: "", imagePath: "Item/common/coin", orderNum: 0, searchText: "" }],
    [text("Gacha_Name_1", "Pickup")],
    "en-US",
  );

  test("orders by priority and converts lot weights to per-draw rates", () => {
    expect(pickup?.id).toBe(1);
    expect(pickup?.pools.map((pool) => [pool.kind, pool.rarity, pool.rate])).toEqual([["member", 4, 3], ["member", 3, 97]]);
    expect(permanent?.pools).toEqual([{ kind: "item", rarity: 0, rate: 100, count: 1, pickupCount: 0, pickupShare: 0 }]);
    expect(pickup?.pools[0]).toMatchObject({ count: 3, pickupCount: 2, pickupShare: 50 });
    expect(permanent?.items).toEqual([{ id: 5, name: "Coin", imagePath: "Item/common/coin", amount: 5000 }]);
  });

  test("only rate-up prizes count as pickups and drive the band filter", () => {
    expect(pickup?.pickupMemberIds).toEqual([51, 53]);
    expect(pickup?.memberCards.map((item) => item.id)).toEqual([51, 53, 52, 26]);
    expect(pickup && toGachaSummary(pickup)).toMatchObject({ bandIds: [1], pickupCharacters: [{ id: 1, name: "Chara 1" }, { id: 3, name: "Chara 3" }], memberCount: 4 });
  });

  test("the rate-up group takes its share of the lot, split evenly, and the rest splits the remainder", () => {
    // SSR lot of 300: pickups share 50% (75 each), the lone non-pickup gets the other 150.
    expect(pickup?.draws.map((entry) => [entry.id, entry.weight])).toEqual([[51, 75], [53, 75], [52, 150], [26, 9700]]);
    expect(pickup?.drawPlans.ten).toEqual({ count: 10, guaranteeCount: 1, guaranteeRarity: 3 });
    expect(pickup?.drawPlans.single).toEqual({ count: 1, guaranteeCount: 0, guaranteeRarity: 0 });
  });

  test("the guaranteed slot only draws eligible cards", () => {
    const entries = [
      { kind: "member" as const, id: 1, amount: 1, rarity: 2, weight: 99, pickup: false },
      { kind: "member" as const, id: 2, amount: 1, rarity: 3, weight: 1, pickup: false },
    ];
    // A roll of 0 always lands on the first entry unless the pool excludes it.
    const results = drawGacha(entries, { count: 10, guaranteeCount: 1, guaranteeRarity: 3 }, () => 0);
    expect(results.map((entry) => entry.id)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  });

  test("bonuses are named after their draw option and skip options without one", () => {
    const [withBonus] = normalizeGachas(
      [gacha(11, { productId1: 4, productId2: 5, gachaBonusIds1: [1], gachaBonusIds2: [] })],
      [], [], [],
      [
        { id: 4, drawCount: 1, ensuredCount: 0, ensuredRarity: 0, ratesLabelTextId: "gacha_rates_label_draw_one_paid" },
        { id: 5, drawCount: 10, ensuredCount: 1, ensuredRarity: 3, ratesLabelTextId: "gacha_rates_label_draw_ten_paid" },
      ],
      [], [], [],
      [text("Gacha_Name_11", "Birthday"), text("gacha_rates_label_draw_one_paid", "\"Pull 1 Time (Paid)\"")],
      "en-US",
      {
        bonuses: [{ id: 1, bonusDrawTiming: 1, requiredGachaDrawCount: 1, bonusDrawCount: 1 }],
        bonusLots: [{ id: 1, gachaBonusId: 1, bonusPrizeType: 1, bonusPrizeId: 64, bonusPrizeCount: 5, weight: 1 }],
      },
    );
    expect(withBonus?.bonusRewards.map((bonus) => [bonus.slot, bonus.label, bonus.drawCount, bonus.rules.length])).toEqual([[1, "Pull 1 Time (Paid)", 1, 1]]);
    expect(withBonus?.bonusRewards[0]?.rules[0]?.rewards[0]).toMatchObject({ rate: 100, reward: { id: 64, count: 5 } });
  });

  test("option labels drop the quotes the game writes them in", () => {
    expect(optionLabel("「招募1次（付费）」")).toBe("招募1次（付费）");
    expect(optionLabel("\"Pull 10 Times\"")).toBe("Pull 10 Times");
    expect(optionLabel("")).toBe("");
  });
  });

describe("rewards", () => {
  const resolve: RewardResolver = ({ resourceType, resourceId, resourceCount }) => ({
    kind: resourceType === 17 ? "degree" : "item", id: resourceId, count: resourceCount, name: `R${resourceId}`, imageUrl: `img/${resourceId}`,
  });
  const base = {
    id: 0, descriptionTextId: "", achievementCount: 0, value: 0, exchangeId: 0, characterId: 0, bandId: 0, musicId: 0,
    musicDifficulty: 0, scoreRank: 0, cardType: 0, storyChapterId: 0, episodeId: 0, priority: 1,
  };
  const data: RewardsMasterData = {
    seasonPasses: [{ id: 1, nameTextId: "Pass", descriptionTextId: "", levelGroup: 1, startAt: "2026/01/01 0:00:00", endAt: "2026/10/28 14:59:59", recommendationLevelRewardIds: [3], bannerAsset: "banner_seasonpass_00001" }],
    seasonPassLevels: [{ group: 1, level: 2, point: 100 }, { group: 1, level: 1, point: 0 }, { group: 2, level: 1, point: 0 }],
    seasonPassLevelRewards: [
      { id: 1, seasonPassId: 1, level: 1, isPremium: false, rewardIds: [10] },
      { id: 2, seasonPassId: 1, level: 1, isPremium: true, rewardIds: [11, 12] },
      { id: 3, seasonPassId: 1, level: 2, isPremium: true, rewardIds: [13] },
    ],
    seasonPassRewards: [
      { id: 10, resourceType: 1, resourceId: 1, resourceCount: 50 },
      { id: 11, resourceType: 1, resourceId: 5, resourceCount: 25000 },
      { id: 12, resourceType: 1, resourceId: 6, resourceCount: 25000 },
      { id: 13, resourceType: 17, resourceId: 4, resourceCount: 1 },
    ],
    seasonPassMissions: [
      { ...base, id: 2, seasonPassId: 1, missionCategory: 4, seasonPassPoint: 10, descriptionTextId: "Clear", achievementCount: 3 },
      { ...base, id: 1, seasonPassId: 1, missionCategory: 1, seasonPassPoint: 15, descriptionTextId: "Band", bandId: 2, scoreRank: 6 },
    ],
    missionGroups: [{ id: 7, nameTextID: "Limited", completeRewardIds: [], bannerAsset: "", startAt: "2026/09/24 0:00:00", endAt: "2026/10/28 12:00:00" }],
    missions: [{ ...base, id: 5, limitedMissionGroupId: 7, releaseDay: 2, missionRewardIds: [1], descriptionTextId: "Song", musicId: 100107, musicDifficulty: 3 }],
    missionRewards: [{ id: 1, resourceType: 1, resourceId: 1, resourceCount: 30 }],
    loginBonuses: [{ id: 9, nameTextID: "Login", isLoop: false, startAt: "", endAt: "", sheetImageAsset: "", priority: 1 }],
    loginBonusSlots: [
      { loginBonusID: 9, sheetNo: 1, slotNo: 2, isDecorated: false, resourceType: 1, resourceId: 1, resourceCount: 200 },
      { loginBonusID: 9, sheetNo: 1, slotNo: 1, isDecorated: true, resourceType: 1, resourceId: 57, resourceCount: 1 },
      { loginBonusID: 9, sheetNo: 1, slotNo: 1, isDecorated: false, resourceType: 1, resourceId: 1, resourceCount: 100 },
    ],
    exchanges: [], chapters: [], episodes: [], advs: [],
    bands: [{ id: 2, nameTextID: "Band_2" }],
    characters: [],
    music: [{ id: 100107, title: "Abracadabra" }],
    texts: [
      text("Pass", "Season Pass"), text("Band_2", "Ave Mujica"),
      text("Clear", "Clear {AchievementCount} lives"), text("Band", "Score {ScoreRank} with {BandId}{MissionCategory}"),
      text("Song", "Clear \"{MusicId}\" on {MusicDifficulty}"), text("ui_difficulty_expert", "EXPERT"),
    ],
  };
  const [pass, missions, login] = normalizeRewardEntries(data, resolve, "en-US") as [
    Extract<ReturnType<typeof normalizeRewardEntries>[number], { kind: "seasonPass" }>,
    Extract<ReturnType<typeof normalizeRewardEntries>[number], { kind: "mission" }>,
    Extract<ReturnType<typeof normalizeRewardEntries>[number], { kind: "loginBonus" }>,
  ];

  test("season pass levels pair free and premium rewards and mark the featured level", () => {
    expect(pass.slug).toBe("season-pass-1");
    expect(pass.levels.map((level) => [level.level, level.point, level.free.length, level.premium.length, level.featured])).toEqual([[1, 0, 1, 2, false], [2, 100, 0, 1, true]]);
    expect(pass.highlights[0]).toMatchObject({ kind: "degree", id: 4 });
  });

  test("mission descriptions resolve placeholders and group daily missions first", () => {
    expect(pass.missionGroups.map((group) => [group.category, group.missions.map((mission) => mission.description)])).toEqual([
      ["daily", ["Score S with Ave Mujica"]],
      ["normal", ["Clear 3 lives"]],
    ]);
    expect(missions.days).toEqual([{ day: 2, missions: [{ id: 5, description: "Clear \"Abracadabra\" on EXPERT", points: 0, rewards: [resolve({ resourceType: 1, resourceId: 1, resourceCount: 30 })] }] }]);
  });

  test("login bonus slots group by round and day", () => {
    expect(login.sheets).toHaveLength(1);
    expect(login.sheets[0]?.days.map((day) => [day.day, day.decorated, day.rewards.map((reward) => reward.id)])).toEqual([[1, true, [57, 1]], [2, false, [1]]]);
  });
});

describe("titles", () => {
  test("character stickers without characterIds take the character from the file name, jackets the band", () => {
    const characters = [{ id: 22, bandID: 5, displayOrder: 22, nameTextID: "Chara_22", enDisplayNameTextId: "", mainColorCode: "" }];
    const [sticker, jacket] = normalizeDegrees([
      { id: 126, nameTextId: "Degree_126", descriptionTextId: "", degreeType: 3, characterIds: [], imagePath: "Image/Degree/Char/02/degree_char_02_22", orderNum: 1 },
      { id: 10000034, nameTextId: "Degree_J", descriptionTextId: "", degreeType: 5, characterIds: [], imagePath: "Image/Jacket/jkt_002_100034", orderNum: 2 },
    ], characters, [text("Degree_126", "[Sticker] Miku Name ver.")], "en-US");
    expect(sticker).toMatchObject({ name: "Miku Name ver.", characterIds: [22], bandIds: [5] });
    expect(jacket).toMatchObject({ characterIds: [], bandIds: [2] });
  });
});

describe("home data", () => {
  const banners: RawHomeBanner[] = [
    { id: 1, imageAsset: "Gacha/Banner/gacha_banner_00001", displayType: 2, contentId: 1, displayOrder: 110, startAt: "2026-09-01 0:00:00", endAt: "2026-09-28 12:59:59" },
    { id: 4, imageAsset: "SeasonPass/Banner/banner_seasonpass_00001", displayType: 25, contentId: 1, displayOrder: 120, startAt: "2026-09-01 0:00:00", endAt: "2026-10-28 14:59:59" },
    { id: 5, imageAsset: "Image/Banner/home_banner_1100000001", displayType: 4, contentId: 9, displayOrder: 105, startAt: "2026-09-24 0:00:00", endAt: "2026-10-28 11:59:59" },
    { id: 6, imageAsset: "Image/Banner/banner_sample", displayType: 3, contentId: 10, displayOrder: 1, startAt: "2026-03-05 14:00:00", endAt: "2026-03-14 14:00:00" },
  ];
  const entry = (slug: string, kind: RewardEntrySummary["kind"], id: number, startAt: string, endAt: string): RewardEntrySummary => ({ slug, kind, id, title: slug, bannerUrl: "", startAt, endAt, highlights: [], searchText: "" });
  const rewards = [
    entry("season-pass-1", "seasonPass", 1, "2026/01/01 0:00:00", "2026/10/28 14:59:59"),
    entry("missions-1", "mission", 1, "null", "null"),
    entry("missions-2", "mission", 2, "2026/09/24 0:00:00", "2026/10/28 12:00:00"),
  ];
  const gachas = [{ id: 1, name: "MyGO Pickup" }] as Parameters<typeof buildHomeData>[1];
  const data = buildHomeData(banners, gachas, rewards, [], [], [], Date.parse("2026-09-24T12:00:00+08:00"));

  test("carousel keeps live banners, drops shop packs and ended ones, and links to detail pages", () => {
    expect(data.slides.map((slide) => [slide.id, slide.kind, slide.title, slide.link])).toEqual([
      [4, "seasonPass", "season-pass-1", { routeId: "rewards", detailId: "season-pass-1" }],
      [1, "gacha", "MyGO Pickup", { routeId: "gacha", detailId: 1 }],
    ]);
  });

  test("exchange banners (displayType 3 and 11) open the shop, story banners the main story", () => {
    // TW MasterHomeBanner, 2026-10: contentId 10 is MasterExchange 10; the chapter banner names chapter 6 under contentId 1.
    const live: RawHomeBanner[] = [
      { id: 6, imageAsset: "Image/Banner/home_banner_00006", displayType: 3, contentId: 10, displayOrder: 120, startAt: "2026-09-25 15:00:00", endAt: "2026-10-07 23:59:59" },
      { id: 8, imageAsset: "Story/Banner/Chapter/ui_banner_chapter_6", displayType: 1, contentId: 1, displayOrder: 2, startAt: "2026-09-30 15:00:00", endAt: "2026-10-08 20:59:59" },
      { id: 11, imageAsset: "Exchange/Banner/Banner_19", displayType: 11, contentId: 10, displayOrder: 10, startAt: "2026-10-04 0:00:00", endAt: "2026-10-06 23:59:59" },
      { id: 12, imageAsset: "Exchange/Banner/Banner_20", displayType: 11, contentId: 99, displayOrder: 9, startAt: "2026-10-04 0:00:00", endAt: "2026-10-06 23:59:59" },
    ];
    const home = buildHomeData(live, [], [], [], [], [], Date.parse("2026-10-01T12:00:00+08:00"), {
      targets: {
        exchanges: new Map([[10, { id: 10, title: "Event Shop", link: { routeId: "exchange", detailId: 10 } }]]),
        chapters: [{ id: 1, banner: "ui_banner_chapter_1", title: "Chapter 1" }, { id: 6, banner: "ui_banner_chapter_6", title: "Chapter 6" }],
      },
    });
    expect(home.slides.map((slide) => [slide.id, slide.kind, slide.title, slide.link])).toEqual([
      [6, "exchange", "Event Shop", { routeId: "exchange", detailId: 10 }],
      [11, "exchange", "Event Shop", { routeId: "exchange", detailId: 10 }],
      [12, "exchange", "", { routeId: "exchange" }],
      [8, "story", "Chapter 6", { routeId: "main-story" }],
    ]);
  });

  test("only time-limited reward entries are listed, newest first", () => {
    expect(data.rewards.map((item) => item.slug)).toEqual(["missions-2", "season-pass-1"]);
  });
});

describe("home events and birthdays", () => {
  const event = (id: number, startAt: string, endAt: string) => ({ id, name: `Event ${id}`, startAt, endAt, displayEndAt: endAt, bannerUrl: "", logoUrl: "", backgroundUrl: "", bandIds: [], characters: [], searchText: "" });
  const now = Date.parse("2026-10-05T12:00:00+08:00");

  test("keeps unfinished events and features the running one, else the next", () => {
    const events = homeEvents([event(1, "2026-09-01 0:00:00", "2026-09-30 0:00:00"), event(3, "2026-10-20 15:00:00", "2026-10-28 20:59:59"), event(2, "2026-10-01 15:00:00", "2026-10-09 20:59:59")], now);
    expect(events.map((entry) => entry.id)).toEqual([2, 3]);
    expect(currentHomeEvent(events, now)?.id).toBe(2);
    expect(currentHomeEvent(events, Date.parse("2026-10-15T12:00:00+08:00"))?.id).toBe(3);
    expect(currentHomeEvent(events, Date.parse("2026-11-15T12:00:00+08:00"))).toBeNull();
  });

  const bdCard = { ...card(64, 4, 22, 5), rarity: 20, startAt: "2026-10-04 0:00:00" } as unknown as CardViewModel;
  const characters = [
    { id: 22, name: "Chara 22", mainColor: "#22CCFF", bandName: "Band 5", birthdayMonth: 10, birthdayDay: 4 },
    { id: 1, name: "Chara 1", mainColor: "#77BBDD", bandName: "Band 1", birthdayMonth: 11, birthdayDay: 22 },
  ] as Parameters<typeof homeBirthdays>[0];
  const gachaList = [
    { id: 7, name: "Birthday Gacha", bannerPath: "g7", startAt: "2026-10-04 0:00:00", endAt: "2026-10-06 23:59:59" },
    { id: 8, name: "Rerun", bannerPath: "g8", startAt: "2027-03-01 0:00:00", endAt: "2027-03-06 23:59:59" },
  ] as Parameters<typeof homeBirthdays>[2];
  const birthdays = homeBirthdays(characters, [bdCard, card(65, 4, 22, 5)], gachaList, [{ id: 7, pickupMemberIds: [64] }, { id: 8, pickupMemberIds: [64] }]);

  test("collects every character's BD cards and the gacha picking them up", () => {
    expect(birthdays.map((entry) => [entry.characterId, entry.cards.map((item) => item.id), entry.gachas.map((item) => item.id)])).toEqual([[22, [64], [7, 8]], [1, [], []]]);
  });

  test("links the card and gacha released within 45 days of the birthday", () => {
    const kanon = birthdays[0]!;
    const birthday2026 = Date.parse("2026-10-04T00:00:00+08:00");
    expect(birthdayCardFor(kanon, birthday2026)?.id).toBe(64);
    expect(birthdayGachaFor(kanon, birthday2026, now)?.id).toBe(7);
    const birthday2027 = Date.parse("2027-10-04T00:00:00+08:00");
    expect(birthdayCardFor(kanon, birthday2027)).toBeNull();
    expect(birthdayGachaFor(kanon, birthday2027, now)).toBeNull();
  });
});

describe("compact counts", () => {
  test("badge counts shorten to K and M", async () => {
    const { formatCompactCount } = await import("../src/lib/format/compact-count");
    expect([50, 999, 1_000, 1_500, 40_000, 100_000, 999_960, 2_500_000].map(formatCompactCount)).toEqual(["50", "999", "1K", "1.5K", "40K", "100K", "1M", "2.5M"]);
  });
});

describe("home birthdays in the reader's zone", () => {
  test("lists the next 30 days from today, wrapping the year", async () => {
    const { upcomingBirthdays } = await import("../src/lib/home/data");
    const birthday = (characterId: number, month: number, day: number) => ({ characterId, name: "", color: "", bandName: "", month, day, cards: [], gachas: [] });
    const list = [birthday(1, 1, 2), birthday(2, 12, 25), birthday(3, 6, 1), birthday(4, 12, 20)];
    // 2026-12-20 23:30 in Shanghai is still the 20th there but already the 21st in Tokyo.
    const now = Date.parse("2026-12-20T23:30:00+08:00");
    expect(upcomingBirthdays(list, now, "Asia/Shanghai").map((entry) => [entry.birthday.characterId, entry.date, entry.daysLeft])).toEqual([
      [4, "2026-12-20", 0], [2, "2026-12-25", 5], [1, "2027-01-02", 13],
    ]);
    expect(upcomingBirthdays(list, now, "Asia/Tokyo").map((entry) => entry.birthday.characterId)).toEqual([2, 1]);
    expect(upcomingBirthdays(list, now, "Asia/Shanghai")[0]!.at).toBe(Date.parse("2026-12-20T00:00:00+08:00"));
  });
});

describe("home layout", () => {
  test("stored layouts are repaired and new modules keep their default place", async () => {
    const { HOME_MODULES, normalizeHomeLayout, moveHomeModule, toggleHomeModule, homeLayoutCss, isDefaultHomeLayout, defaultHomeLayout } = await import("../src/lib/home/layout");
    expect(normalizeHomeLayout(null)).toEqual(defaultHomeLayout());
    const repaired = normalizeHomeLayout({ order: ["cards", "now", "bogus", "now"], hidden: ["music", "x"] });
    expect(repaired.order).toHaveLength(HOME_MODULES.length);
    expect(repaired.order).toEqual(["cards", "shortcuts", "now", "event", "birthdays", "rewards", "music"]);
    expect(repaired.order.indexOf("event")).toBe(repaired.order.indexOf("now") + 1);
    expect(repaired.hidden).toEqual(["music"]);
    const moved = moveHomeModule(defaultHomeLayout(), "event", -1);
    expect(moved.order.slice(0, 2)).toEqual(["event", "now"]);
    expect(moveHomeModule(defaultHomeLayout(), "now", -1)).toEqual(defaultHomeLayout());
    const hidden = toggleHomeModule(defaultHomeLayout(), "rewards");
    expect(hidden.hidden).toEqual(["rewards"]);
    expect(isDefaultHomeLayout(hidden)).toBe(false);
    expect(homeLayoutCss(hidden)).toContain('[data-home-module="rewards"]{order:3;display:none!important}');
    expect(isDefaultHomeLayout(toggleHomeModule(hidden, "rewards"))).toBe(true);
  });
});
