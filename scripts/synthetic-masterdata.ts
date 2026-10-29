import { setBuildFetchTransportForTests } from "@/lib/build/fetch";
import { state as buildCoreState } from "@/lib/masterdata/build-core";
import { resetMasterDataSnapshotForTests } from "@/lib/masterdata/build-snapshot";

const TABLES: Record<string, { _allData: unknown[] }> = {
  "MasterText.json": {
    _allData: [
      { id: "band.1", sc: "MyGO!!!!!", tc: "MyGO!!!!!", jp: "MyGO!!!!!", en: "MyGO!!!!!", kr: "MyGO!!!!!" },
      { id: "char.1", sc: "高松灯", tc: "高松燈", jp: "高松燈", en: "Tomori Takamatsu", kr: "타카마츠 토모리" },
      { id: "card.1001.sub", sc: "迷星叫", tc: "迷星叫", jp: "迷星叫", en: "Mayoiuta", kr: "미성규" },
      { id: "event.1", sc: "春日影", tc: "春日影", jp: "春日影", en: "Haruhikage", kr: "하루히카게" },
      { id: "song.1", sc: "壹雫空", tc: "壹雫空", jp: "壱雫空", en: "Hitoshizuku", kr: "히토시즈쿠" },
      { id: "artist.1", sc: "藤原優樹", tc: "藤原優樹", jp: "藤原優樹", en: "Yuki Fujiwara", kr: "후지와라 유키" },
      { id: "arena.season.1", simplifiedChinese: "第 1 赛季", traditionalChinese: "第 1 賽季", japanese: "シーズン 1", english: "Season 1", korean: "시즌 1" },
      { id: "arena.rank.1", simplifiedChinese: "青铜 I", traditionalChinese: "青銅 I", japanese: "ブロンズ I", english: "Bronze I", korean: "브론즈 I" },
      { id: "skill.live.1", simplifiedChinese: "分数值提升", traditionalChinese: "分數值提升", japanese: "スコアUP", english: "Score Boost", korean: "스코어 UP" },
      { id: "skill.live.1.desc", simplifiedChinese: "分数提升 {0}%", traditionalChinese: "分數提升 {0}%", japanese: "スコア {0}% UP", english: "Score +{0}%", korean: "스코어 {0}% UP" },
      { id: "item.1", simplifiedChinese: "技能练习券", traditionalChinese: "技能練習券", japanese: "スキル練習チケット", english: "Skill Ticket", korean: "스킬 티켓" },
    ],
  },
  "MasterBand.json": {
    _allData: [
      { id: 1, nameTextID: "band.1", mainColorCode: "#3388BB" },
    ],
  },
  "MasterCharacter.json": {
    _allData: [
      {
        id: 1,
        bandID: 1,
        displayOrder: 1,
        nameTextID: "char.1",
        enDisplayNameTextId: "char.1",
        shortNameTextID: "char.1",
        mainColorCode: "#77BBDD",
        subColorCode: "#3388BB",
        bandPart: "Vocal",
        birthdayMonth: 11,
        birthdayDay: 22,
        bloodTypeTextId: "",
        catchCopyTextId: "",
        constellationTextId: "",
        descriptionTextId: "",
        favoriteFoodTextId: "",
        heightTextId: "",
        hobbyTextId: "",
        instrumentTypes: [],
        schoolClassTextId: "",
        schoolTextId: "",
        voiceActorTextId: "",
      },
    ],
  },
  "MasterMemberCard.json": {
    _allData: [
      {
        id: 1001,
        assetID: 1001,
        characterID: 1,
        rarity: 4,
        cardType: 1,
        nameTextID: "char.1",
        subtitleTextID: "card.1001.sub",
        gachaVoiceTextId: "",
        startAt: "2026-01-01 12:00:00",
        liveSkillID: 1,
        leaderSkillID: 1,
        gekisouSkillID: 1,
        performancePowerMax: 12000,
        technicPowerMax: 11500,
        visualPowerMax: 11800,
        memberCardLevelGroup: 1,
        memberCardAwakeGroup: 1,
        memberCardRankGroup: 1,
      },
    ],
  },
  "MasterEvent.json": {
    _allData: [
      {
        id: 1,
        nameTextId: "event.1",
        startAt: "2026-02-01 12:00:00",
        endAt: "2026-02-09 20:59:59",
        displayEndAt: "2026-02-11 20:59:59",
        eventType: 1,
        storyChapterId: 0,
        eventItemId: 0,
        isRankingDisabled: false,
        isMusicRankingDisabled: false,
        isTotalMusicRankingDisabled: false,
        liveEventRewardGroup: 0,
        liveEventPointGroup: 0,
        challengeLiveEventRewardGroup: 0,
        challengeLiveEventPointGroup: 0,
        musicId: 1,
        logoAsset: "01/Logo/event_logo_01_0001",
        backgroundAsset: "01/Background/event_bg_01_0001",
      },
    ],
  },
  "MasterEventPickUpCard.json": {
    _allData: [
      { id: 1, eventId: 1, resourceType: 2, resourceId: 1001 },
    ],
  },
  "MasterLiveMusic.json": {
    _allData: [
      {
        id: 1,
        titleTextID: "song.1",
        jacketAssetName: "jacket_0001",
        composerTextID: "artist.1",
        lyricistTextID: "artist.1",
        arrangerTextID: "artist.1",
        bandIDs: [1],
        vocalCharacterIDs: [1],
        musicType: 1,
        startAt: "2026-01-01 12:00:00",
        easyID: 0,
        normalID: 0,
        hardID: 0,
        expertID: 0,
        musicSoundID: 0,
        jingleSoundID: 0,
        musicCategories: [],
        liveScoreRankGroup: 1,
        anotherVocalIDs: [],
      },
    ],
  },
  "MasterArenaSeason.json": {
    _allData: [
      { id: 1, nameTextId: "arena.season.1", startAt: "2026-10-01 12:00:00", endAt: "2026-11-30 20:59:59", rankingCountEndAt: "2026-11-30 20:59:59" },
    ],
  },
  "MasterArenaLeague.json": {
    _allData: [
      { id: 1, bandId: 1, startAt: "2026-10-01 12:00:00" },
    ],
  },
  "MasterArenaLeagueRegulation.json": {
    _allData: [
      { id: 1, leagueId: 1, liveMusicType: 1, gekisouMission1: 1, gekisouMission2: 2, gekisouMission3: 3, startAt: "2026-10-01 12:00:00", endAt: "2026-11-30 20:59:59" },
    ],
  },
  "MasterArenaRank.json": {
    _allData: [
      { id: 1, bandId: 1, nameTextId: "arena.rank.1", rank: 1, division: 1, lp: 100 },
    ],
  },
  "MasterItem.json": {
    _allData: [
      { id: 1, nameTextID: "item.1", descriptionTextID: "item.1", itemType: 1, imageAssetName: "item_001" },
    ],
  },
  "MasterLiveSkill.json": {
    _allData: [
      { id: 1, nameTextID: "skill.live.1", descriptionTextFormatID: "skill.live.1.desc", skillIconID: 1 },
    ],
  },
  "MasterLiveSkillEffect.json": {
    _allData: [
      { id: 1, liveSkillID: 1, level: 1, effectValue: 100, skillEffectType: 1 },
      { id: 2, liveSkillID: 1, level: 5, effectValue: 120, skillEffectType: 1 },
    ],
  },
  "MasterSkillIcon.json": {
    _allData: [
      { id: 1, normalIconAssetName: "skill_icon_01" },
    ],
  },
  "MasterSkillLevelResource.json": {
    _allData: [
      { group: 1, level: 2, itemID: 1, count: 10 },
    ],
  },
  "MasterPlayerRank.json": {
    _allData: [
      { rank: 1, exp: 0 },
      { rank: 2, exp: 100 },
      { rank: 3, exp: 300 },
    ],
  },
  "MasterCharacterRank.json": {
    _allData: [
      { rank: 1, exp: 0, bonus: 0 },
      { rank: 2, exp: 50, bonus: 10 },
    ],
  },
  "MasterCharacterFriendshipRank.json": {
    _allData: [
      { rank: 1, exp: 0 },
      { rank: 2, exp: 80 },
    ],
  },
  "MasterBandRank.json": {
    _allData: [
      { rank: 1, value: 100000 },
      { rank: 2, value: 250000 },
    ],
  },
  "MasterBandTypeRank.json": {
    _allData: [
      { rank: 1, value: 20000 },
      { rank: 2, value: 50000 },
    ],
  },
  "MasterLiveBandHighScoreRating.json": {
    _allData: [
      { bandId: 0, grade: 0, step: 1, rating: 500 },
      { bandId: 0, grade: 2, step: 5, rating: 5000 },
    ],
  },
  "MasterLiveTotalHighScoreRating.json": {
    _allData: [
      { grade: 0, step: 1, rating: 2500 },
      { grade: 2, step: 5, rating: 25000 },
    ],
  },
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Runs `fn` against an offline synthetic MasterData transport so SEO and Markdown rendering tests
 * never depend on external network access or download full MasterData tables during `bun test`.
 */
export async function withSyntheticMasterData<T>(fn: () => Promise<T>): Promise<T> {
  const prevDir = process.env.MOENOTES_MASTERDATA_DIR;
  const prevServers = process.env.MOENOTES_SERVERS;
  const prevCacheDir = process.env.MOENOTES_MASTERDATA_CACHE_DIR;

  delete process.env.MOENOTES_MASTERDATA_DIR;
  delete process.env.MOENOTES_MASTERDATA_CACHE_DIR;
  process.env.MOENOTES_SERVERS = "tw";

  setBuildFetchTransportForTests(async (input) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const parsed = new URL(rawUrl);
    if (parsed.pathname.endsWith("/current_version.json")) {
      return jsonResponse({
        regions: {
          "hk-tw-mo": { version: "synthetic-tw-v1" },
        },
      });
    }
    if (parsed.pathname.endsWith("/index.json")) {
      return jsonResponse({ regions: {} });
    }
    const file = parsed.pathname.split("/").pop() ?? "";
    return jsonResponse(TABLES[file] ?? { _allData: [] });
  });

  resetMasterDataSnapshotForTests();
  buildCoreState.tables.clear();
  buildCoreState.selectors.clear();

  try {
    return await fn();
  } finally {
    setBuildFetchTransportForTests(undefined);
    resetMasterDataSnapshotForTests();
    buildCoreState.tables.clear();
    buildCoreState.selectors.clear();
    if (prevDir === undefined) delete process.env.MOENOTES_MASTERDATA_DIR;
    else process.env.MOENOTES_MASTERDATA_DIR = prevDir;
    if (prevServers === undefined) delete process.env.MOENOTES_SERVERS;
    else process.env.MOENOTES_SERVERS = prevServers;
    if (prevCacheDir === undefined) delete process.env.MOENOTES_MASTERDATA_CACHE_DIR;
    else process.env.MOENOTES_MASTERDATA_CACHE_DIR = prevCacheDir;
  }
}
