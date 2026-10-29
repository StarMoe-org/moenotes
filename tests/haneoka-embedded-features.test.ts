import { describe, expect, test } from "bun:test";
import { withSyntheticMasterData } from "../scripts/synthetic-masterdata";
import {
  buildArenaDeckQuery,
  nextArenaTransitionAt,
  normalizeArenaCatalog,
  selectActiveLeagueRuleIndex,
  selectDefaultArenaSeason,
} from "@/lib/arena/data";
import { computeDeckShareHeight } from "@/lib/deck/share-image";
import { getBuildArenaCatalogs } from "@/lib/masterdata/build-arena";
import { getBuildProgressionReferences } from "@/lib/masterdata/build-progression";
import { getBuildSkillDictionaries } from "@/lib/masterdata/build-skill-dictionary";
import {
  computeLevelBreakdown,
  computeProgressSummary,
  cycleSongProgressStatus,
  extractSaveSongProgress,
  matchesProgressFilter,
  parseImportedProgressJson,
  serializeProgressExport,
  songProgressKey,
  type SongProgressChart,
} from "@/lib/music/song-progress";
import { calculateExpGap, normalizeProgressionReference } from "@/lib/progression/data";
import { normalizeSkillDictionary } from "@/lib/skills/dictionary";
import { parseMasterDate } from "@/lib/schedule";

describe("Gekiso Arena overview normalization & schedule helpers", () => {
  test("normalizes seasons, band leagues, weekly regulations, ranks, and rewards", () => {
    const catalog = normalizeArenaCatalog({
      seasons: [
        {
          id: 1,
          nameTextId: "season.1",
          startAt: "2026-10-01 12:00:00",
          endAt: "2026-10-31 20:59:59",
          rankingCountEndAt: "2026-10-31 20:59:59",
        },
      ],
      leagues: [{ id: 10, bandId: 1, startAt: "2026-10-01 12:00:00" }],
      regulations: [
        {
          id: 101,
          leagueId: 10,
          liveMusicType: 2,
          gekisouMission1: 1,
          gekisouMission2: 2,
          gekisouMission3: 3,
          startAt: "2026-10-01 12:00:00",
          endAt: "2026-10-07 20:59:59",
        },
        {
          id: 102,
          leagueId: 10,
          liveMusicType: 4,
          gekisouMission1: 3,
          gekisouMission2: 1,
          gekisouMission3: 2,
          startAt: "2026-10-08 12:00:00",
          endAt: "2026-10-14 20:59:59",
        },
      ],
      ranks: [{ id: 1, bandId: 1, nameTextId: "rank.1", rank: 1, division: 1, lp: 200 }],
      dailyRewards: [{ id: 1, leagueId: 10, rankMatchId: 1, resourceType: 1, resourceId: 50, resourceCount: 5 }],
      seasonRewards: [{ id: 2, rankStart: 1, rankEnd: 10, resourceType: 1, resourceId: 50, resourceCount: 100 }],
      promotionRewards: [{ id: 3, leagueId: 10, rankMatchId: 1, resourceType: 1, resourceId: 50, resourceCount: 20 }],
      bands: [{ id: 1, nameTextID: "band.1", mainColorCode: "3388BB" }],
      songs: [],
      texts: [
        { id: "season.1", simplifiedChinese: "Season 1", traditionalChinese: "Season 1", japanese: "Season 1", english: "Season 1", korean: "Season 1" },
        { id: "band.1", simplifiedChinese: "MyGO!!!!!", traditionalChinese: "MyGO!!!!!", japanese: "MyGO!!!!!", english: "MyGO!!!!!", korean: "MyGO!!!!!" },
        { id: "rank.1", simplifiedChinese: "Bronze I", traditionalChinese: "Bronze I", japanese: "Bronze I", english: "Bronze I", korean: "Bronze I" },
      ],
      resolveReward: ({ resourceId, resourceCount }) => ({
        kind: "item",
        id: resourceId,
        count: resourceCount,
        name: `Item ${resourceId}`,
        imageUrl: "",
      }),
      locale: "en-US",
    });

    expect(catalog.seasons).toHaveLength(1);
    const season = catalog.seasons[0]!;
    expect(season.title).toBe("Season 1");
    expect(season.leagues).toHaveLength(1);
    expect(season.leagues[0]!.color).toBe("#3388BB");
    expect(season.leagues[0]!.rules).toHaveLength(2);
    expect(season.leagues[0]!.ranks[0]!.promotionRewards[0]!.count).toBe(20);
    expect(season.leagues[0]!.ranks[0]!.dailyRewards[0]!.count).toBe(5);

    const midWeek1 = parseMasterDate("2026-10-03 12:00:00")!;
    expect(selectDefaultArenaSeason(catalog.seasons, midWeek1)?.id).toBe(1);
    expect(selectActiveLeagueRuleIndex(season.leagues[0]!.rules, midWeek1)).toBe(0);
    expect(nextArenaTransitionAt(season, midWeek1)).toBe(parseMasterDate("2026-10-07 20:59:59")! + 1000);

    expect(buildArenaDeckQuery({ leagueId: 10, bandId: 1, rule: season.leagues[0]!.rules[0], isLiveRule: true })).toBe(
      "goal=arena&league=10",
    );
    expect(buildArenaDeckQuery({ leagueId: 10, bandId: 1, rule: season.leagues[0]!.rules[1], isLiveRule: false })).toBe(
      "goal=arena&league=10&source=custom&band=1&attr=4&m1=3&m2=1&m3=2",
    );
  });
});

describe("Song Progress tracker domain logic", () => {
  const charts: SongProgressChart[] = [
    { key: songProgressKey(1, "expert"), songId: 1, difficulty: "expert", playLevel: 26, noteCount: 750 },
    { key: songProgressKey(2, "expert"), songId: 2, difficulty: "expert", playLevel: 26, noteCount: 800 },
    { key: songProgressKey(3, "expert"), songId: 3, difficulty: "expert", playLevel: 28, noteCount: 1050 },
  ];

  test("cycles statuses, summarizes cumulative Clear/FC/AP counts, and buckets by chart level", () => {
    expect(cycleSongProgressStatus(0)).toBe(1);
    expect(cycleSongProgressStatus(1)).toBe(2);
    expect(cycleSongProgressStatus(2)).toBe(3);
    expect(cycleSongProgressStatus(3)).toBe(0);

    const state = { "1:expert": 3, "2:expert": 2 } as const;
    const statusOf = (key: string) => state[key as keyof typeof state] ?? 0;

    const summary = computeProgressSummary(charts, statusOf);
    expect(summary).toEqual({
      total: 3,
      notCleared: 1,
      clearedOnly: 0,
      fullComboOnly: 1,
      allPerfect: 1,
      clearedOrBetter: 2,
      fullComboOrBetter: 2,
    });

    const levels = computeLevelBreakdown(charts, statusOf);
    expect(levels.map((b) => b.level)).toEqual([28, 26]);
    expect(levels[1]!.fullComboOrBetter).toBe(2);

    expect(matchesProgressFilter(2, "fcPlus")).toBe(true);
    expect(matchesProgressFilter(2, "unap")).toBe(true);
    expect(matchesProgressFilter(3, "unap")).toBe(false);
  });

  test("imports both moenotes JSON and Haneoka Box replica JSON and extracts game save results", () => {
    const haneokaJson = JSON.stringify({
      schema: "haneoka-team-box-replica-v1",
      entries: {
        "l.10.3": { v: 3 },
        "l.11.2": { v: 2 },
        "m.1001.own": { v: true },
      },
    });
    expect(parseImportedProgressJson(haneokaJson)).toEqual({
      "10:expert": 3,
      "11:hard": 2,
    });

    const exported = serializeProgressExport("tw", { "10:expert": 3, "11:hard": 0 });
    expect(parseImportedProgressJson(exported)).toEqual({ "10:expert": 3 });

    const saveJson = JSON.stringify({
      _player: {
        _liveMusics: [
          {
            _musicId: 42,
            _difficulties: [
              { _difficulty: 2, _isCleared: true, _isFullCombo: true },
              { _difficulty: 3, _isAllPerfect: true },
            ],
          },
        ],
      },
    });
    expect(extractSaveSongProgress(saveJson)).toEqual({
      "42:hard": 2,
      "42:expert": 3,
    });
  });
});

describe("Deck share image geometry", () => {
  test("computes compact single-song height and caps multi-song Arena breakdown height", () => {
    expect(computeDeckShareHeight(0)).toBe(820);
    expect(computeDeckShareHeight(3)).toBe(820 + 76 + 3 * 52);
    expect(computeDeckShareHeight(20)).toBe(computeDeckShareHeight(6));
  });
});

describe("Skills dictionary & Progression reference normalization", () => {
  test("consolidates 5 skill families with upgrade cost groups and reverse card lookup", () => {
    const dict = normalizeSkillDictionary({
      leaderSkills: [{ id: 1, nameTextID: "sk.ld", descriptionTextFormatID: "sk.ld.d", skillIconID: 1 }],
      leaderEffects: [{ id: 1, leaderSkillID: 1, level: 1, effectValue: 40, skillEffectType: 1 }],
      liveSkills: [{ id: 2, nameTextID: "sk.lv", descriptionTextFormatID: "sk.lv.d", skillIconID: 1 }],
      liveEffects: [
        { id: 10, liveSkillID: 2, level: 1, effectValue: 100, skillEffectType: 1 },
        { id: 11, liveSkillID: 2, level: 5, effectValue: 120, skillEffectType: 1 },
      ],
      gekisouSkills: [],
      gekisouEffects: [],
      supportSkills: [{ id: 3, nameTextID: "sk.sp", descriptionTextFormatID: "sk.sp.d", skillIconID: 1 }],
      supportEffects: [{ id: 20, supportSkillID: 3, level: 1, effectValue: 50, skillEffectType: 1 }],
      gekisouSupportSkills: [],
      gekisouSupportEffects: [],
      icons: [{ id: 1, normalIconAssetName: "icon_01" }],
      conditionSets: [],
      conditions: [],
      cumulativeConditions: [],
      skillTargets: [],
      skillResources: [
        { group: 1, level: 2, itemID: 10, count: 5 },
        { group: 1, level: 3, itemID: 10, count: 15 },
      ],
      memberResourceRows: [{ id: 1001, liveSkillID: 2, liveSkillLevelResourceGroup: 1 }],
      characters: [],
      bands: [],
      texts: [
        { id: "sk.ld", simplifiedChinese: "Leader Boost", traditionalChinese: "Leader Boost", japanese: "Leader Boost", english: "Leader Boost", korean: "Leader Boost" },
        { id: "sk.ld.d", simplifiedChinese: "+{0}%", traditionalChinese: "+{0}%", japanese: "+{0}%", english: "+{0}%", korean: "+{0}%" },
        { id: "sk.lv", simplifiedChinese: "Score Up", traditionalChinese: "Score Up", japanese: "Score Up", english: "Score Up", korean: "Score Up" },
        { id: "sk.lv.d", simplifiedChinese: "Score +{0}%", traditionalChinese: "Score +{0}%", japanese: "Score +{0}%", english: "Score +{0}%", korean: "Score +{0}%" },
        { id: "sk.sp", simplifiedChinese: "Snap Assist", traditionalChinese: "Snap Assist", japanese: "Snap Assist", english: "Snap Assist", korean: "Snap Assist" },
        { id: "sk.sp.d", simplifiedChinese: "Support +{0}%", traditionalChinese: "Support +{0}%", japanese: "Support +{0}%", english: "Support +{0}%", korean: "Support +{0}%" },
      ],
      memberCards: [
        {
          id: 1001,
          assetId: 1001,
          rarity: 4,
          cardType: 1,
          characterId: 1,
          characterName: "Tomori",
          characterColor: "#77BBDD",
          bandId: 1,
          bandName: "MyGO!!!!!",
          title: "Mayoiuta",
          startAt: "2026-01-01 12:00:00",
          gachaVoice: "",
          totalPower: 35000,
          performancePower: 12000,
          technicPower: 11500,
          visualPower: 11500,
          leaderSkillId: 1,
          liveSkillId: 2,
          gekisouSkillId: 0,
          searchText: "tomori",
        },
      ],
      supportCards: [],
      resolveItemCost: (itemId, count) => ({ id: String(itemId), name: `Ticket ${itemId}`, imageUrl: "", count }),
      locale: "en-US",
    });

    expect(dict.entries.map((e) => e.key)).toEqual(["live:2", "leader:1", "support:3"]);
    expect(dict.entries[0]!.memberIds).toEqual([1001]);
    expect(dict.entries[0]!.upgradeGroupIds).toEqual([1]);
    expect(dict.upgradeGroups[1]).toHaveLength(2);
  });

  test("normalizes progression EXP, ratings, and calculates EXP gaps accurately", () => {
    const ref = normalizeProgressionReference({
      playerRanks: [
        { rank: 1, exp: 0 },
        { rank: 2, exp: 100 },
        { rank: 3, exp: 350 },
      ],
      characterRanks: [
        { rank: 1, exp: 0, bonus: 0 },
        { rank: 2, exp: 50, bonus: 10 },
      ],
      friendshipRanks: [],
      bandRanks: [{ rank: 1, value: 100000 }],
      bandTypeRanks: [{ rank: 1, value: 20000 }],
      bandHighScoreRatings: [
        { bandId: 0, grade: 0, step: 1, rating: 500 },
        { bandId: 0, grade: 2, step: 5, rating: 5000 },
      ],
      totalHighScoreRatings: [
        { grade: 0, step: 1, rating: 2500 },
        { grade: 2, step: 5, rating: 25000 },
      ],
    });

    expect(ref.playerRanks[2]).toEqual({ rank: 3, deltaExp: 250, cumulativeExp: 350 });
    expect(ref.characterRanks[1]?.bonus).toBe(10);
    expect(ref.bandRatings[0]).toEqual({ rank: 1, totalRating: 100000, singleRating: 20000 });
    expect(ref.highScoreRatings[1]).toMatchObject({ gradeKind: "gold", romanStep: "V", bandRating: 5000, totalRating: 25000 });

    const gap = calculateExpGap(ref.playerRanks, 1, 3, 140);
    expect(gap).toEqual({
      fromRank: 1,
      toRank: 3,
      fromExp: 0,
      toExp: 350,
      requiredExp: 350,
      remainingExp: 210,
      progressFraction: 140 / 350,
    });
  });

  test("builds Arena, Skills Dictionary, and Progression Reference against synthetic MasterData", async () => {
    await withSyntheticMasterData(async () => {
      const [arenas, skills, progression] = await Promise.all([
        getBuildArenaCatalogs("zh-CN"),
        getBuildSkillDictionaries("zh-CN"),
        getBuildProgressionReferences(),
      ]);

      expect(arenas.tw?.seasons[0]?.leagues[0]?.ranks[0]?.lp).toBe(100);
      expect(skills.tw?.entries.some((e) => e.family === "live" && e.id === 1)).toBe(true);
      expect(progression.tw?.playerRanks).toHaveLength(3);
      expect(progression.tw?.bandRatings[1]?.totalRating).toBe(250000);
      expect(progression.tw?.highScoreRatings).toHaveLength(2);
    });
  });
});
