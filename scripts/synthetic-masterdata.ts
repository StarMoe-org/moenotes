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
