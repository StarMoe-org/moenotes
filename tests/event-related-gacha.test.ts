import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import EventDetail from "../src/components/events/EventDetail";
import { normalizeEvents, relatedGachas, type EventGachaSources, type EventMasterData } from "../src/lib/events/data";

const sources: EventGachaSources = {
  gachas: [
    { id: 10, name: "Event pickup", bannerPath: "Gacha/Banner/10", startAt: "", endAt: "", lotGroupId: 10 },
    { id: 1, name: "Standard", bannerPath: "Gacha/Banner/1", startAt: "", endAt: "", lotGroupId: 1 },
    { id: 12, name: "Rerun", bannerPath: "Gacha/Banner/12", startAt: "", endAt: "", lotGroupId: 12 },
  ],
  lots: [
    { lotGroupId: 10, prizeGroupId: 100 },
    { lotGroupId: 10, prizeGroupId: 101 },
    { lotGroupId: 1, prizeGroupId: 1 },
    { lotGroupId: 12, prizeGroupId: 120 },
  ],
  prizes: [
    { groupId: 100, resourceType: 2, resourceId: 61, pickUpType: 2 },
    { groupId: 101, resourceType: 3, resourceId: 62, pickUpType: 2 },
    // The standard pool holds the card too, but not as a rate-up prize.
    { groupId: 1, resourceType: 2, resourceId: 61, pickUpType: 1 },
    // A member card and a support card can share an id; the resource type keeps them apart.
    { groupId: 120, resourceType: 3, resourceId: 61, pickUpType: 2 },
    { groupId: 120, resourceType: 2, resourceId: 63, pickUpType: 2 },
  ],
};

describe("event related gachas", () => {
  test("match the event's own and bonus cards among rate-up prizes, newest gacha first", () => {
    const related = relatedGachas({
      pickUpCards: [{ resourceType: 2, resourceId: 63 }],
      effects: [{ memberCardId: 61, supportCardId: 0 }, { memberCardId: 0, supportCardId: 62 }],
    }, sources);
    expect(related.map((gacha) => [gacha.id, gacha.cards])).toEqual([[12, ["2:63"]], [10, ["2:61", "3:62"]]]);
    expect(related[1]!.name).toBe("Event pickup");
  });

  test("an event without cards, or whose cards no gacha features, has none", () => {
    expect(relatedGachas({ pickUpCards: [], effects: [{ memberCardId: 0, supportCardId: 0 }] }, sources)).toEqual([]);
    expect(relatedGachas({ pickUpCards: [{ resourceType: 2, resourceId: 99 }], effects: [] }, sources)).toEqual([]);
  });
});

describe("event banner resolution and detail layout", () => {
  const emptyData: Omit<EventMasterData, "events" | "texts" | "homeBanners"> = {
    effects: [],
    pickUpCards: [],
    achievementRewards: [],
    loopRewards: [],
    livePoints: [],
    liveRewards: [],
    challengePoints: [],
    challengeRewards: [],
    eventMissions: [],
    missionLookups: { exchanges: [], chapters: [], episodes: [], advs: [] },
    boxGachas: [],
    boxGachaRewards: [],
    rankingRewards: [],
    challengeMusic: [],
    challengeBoostBonuses: [],
    challengeMusicRankingRewards: [],
    rewards: [],
    characters: [],
    bands: [],
  };

  const resolveDummy = () => ({ key: "item:1", resourceType: 1, resourceId: 1, count: 1, name: "Item", imageUrl: "" });

  test("resolves standalone event bannerAsset for banner-only events (#4) and chapter banners for past events (#1-#3)", () => {
    const events = normalizeEvents(
      {
        ...emptyData,
        events: [
          {
            id: 1,
            nameTextId: "Event_Name_0001",
            startAt: "2026/09/30 18:00:00",
            endAt: "2026/10/08 20:59:59",
            displayEndAt: "2026/10/10 14:59:59",
            eventType: 1,
            storyChapterId: 6,
            eventItemId: 0,
            isRankingDisabled: false,
            isMusicRankingDisabled: true,
            isTotalMusicRankingDisabled: true,
            liveEventRewardGroup: 1,
            liveEventPointGroup: 1,
            challengeLiveEventRewardGroup: 0,
            challengeLiveEventPointGroup: 0,
            musicId: 0,
            logoAsset: "01/Logo/event_logo_01_0001",
            backgroundAsset: "01/Top/event_top_01_0001",
            bannerAsset: "01/Banner/event_banner_00001",
          },
          {
            id: 4,
            nameTextId: "Event_Name_0004",
            startAt: "2026/10/28 12:00:00",
            endAt: "2026/11/07 14:59:59",
            displayEndAt: "2026/11/09 14:59:59",
            eventType: 1,
            storyChapterId: 0,
            eventItemId: 0,
            isRankingDisabled: true,
            isMusicRankingDisabled: true,
            isTotalMusicRankingDisabled: true,
            liveEventRewardGroup: 1,
            liveEventPointGroup: 1,
            challengeLiveEventRewardGroup: 0,
            challengeLiveEventPointGroup: 0,
            musicId: 0,
            logoAsset: "04/Logo/event_logo_01_0004",
            backgroundAsset: "",
            bannerAsset: "04/Banner/event_banner_00004",
          },
        ],
        texts: [
          { id: "Event_Name_0001", japanese: "Event 1", traditionalChinese: "活動 1", simplifiedChinese: "活动 1", english: "Event 1", korean: "이벤트 1" },
          { id: "Event_Name_0004", japanese: "A day〜#HalloweenSnap〜", traditionalChinese: "A day〜#HalloweenSnap〜", simplifiedChinese: "A day〜#HalloweenSnap〜", english: "A day ~#HalloweenSnap~", korean: "A day〜#HalloweenSnap〜" },
        ],
        homeBanners: [
          { id: 8, imageAsset: "Story/Banner/Chapter/ui_banner_chapter_6", displayType: 1, contentId: 1, displayOrder: 2 },
          { id: 23, imageAsset: "Image/Event/04/Banner/event_banner_00004", displayType: 1, contentId: 4, displayOrder: 10 },
        ],
      },
      {
        cards: [],
        supportCards: [],
        music: [],
        stories: [],
      },
      resolveDummy,
      "zh-CN",
    );

    const event4 = events.find((entry) => entry.id === 4)!;
    const event1 = events.find((entry) => entry.id === 1)!;

    expect(event4.bannerUrl).toContain("/zh-Hans/Image/Event/04/Banner/event_banner_00004/event_banner_00004.webp");
    expect(event4.backgroundUrl).toBe("");
    expect(event4.logoUrl).toContain("/zh-Hans/Image/Event/04/Logo/event_logo_01_0004/event_logo_01_0004.webp");

    expect(event1.bannerUrl).toContain("/zh-Hans/Story/Banner/Chapter/ui_banner_chapter_6/ui_banner_chapter_6.webp");
    expect(event1.backgroundUrl).toContain("/zh-Hans/Image/Event/01/Top/event_top_01_0001/event_top_01_0001.webp");
    expect(event1.logoUrl).toContain("/zh-Hans/Image/Event/01/Logo/event_logo_01_0001/event_logo_01_0001.webp");

    // Banner-only Event #4 omits the Top + Logo hero scene and displays the standalone 7:3 banner + logo switcher in the sidebar.
    const event4Html = renderToStaticMarkup(
      createElement(EventDetail, {
        locale: "zh-CN",
        event: { value: event4, servers: ["tw"] },
        servers: ["tw"],
      }),
    );
    expect(event4Html).toContain("event_banner_00004.webp");
    expect(event4Html).not.toContain("object-[30%_35%]");
    expect(event4Html).toContain("活动横幅");
    expect(event4Html).toContain("活动标志");

    // Past Event #1 renders BOTH the Top + Logo hero scene AND the 7:3 event banner in the sidebar gallery.
    const event1Html = renderToStaticMarkup(
      createElement(EventDetail, {
        locale: "zh-CN",
        event: { value: event1, servers: ["tw"] },
        servers: ["tw"],
      }),
    );
    expect(event1Html).toContain("object-[30%_35%]");
    expect(event1Html).toContain("event_top_01_0001.webp");
    expect(event1Html).toContain("ui_banner_chapter_6.webp");
    expect(event1Html).toContain("活动横幅");
    expect(event1Html).toContain("背景插画");
    expect(event1Html).toContain("活动标志");
  });

  test("falls back directly to MasterEvent.bannerAsset when MasterHomeBanner has no matching row", () => {
    const [event4] = normalizeEvents(
      {
        ...emptyData,
        events: [
          {
            id: 4,
            nameTextId: "Event_Name_0004",
            startAt: "2026/10/28 12:00:00",
            endAt: "2026/11/07 14:59:59",
            displayEndAt: "2026/11/09 14:59:59",
            eventType: 1,
            storyChapterId: 0,
            eventItemId: 0,
            isRankingDisabled: true,
            isMusicRankingDisabled: true,
            isTotalMusicRankingDisabled: true,
            liveEventRewardGroup: 1,
            liveEventPointGroup: 1,
            challengeLiveEventRewardGroup: 0,
            challengeLiveEventPointGroup: 0,
            musicId: 0,
            logoAsset: "04/Logo/event_logo_01_0004",
            backgroundAsset: "",
            bannerAsset: "04/Banner/event_banner_00004",
          },
        ],
        texts: [],
      },
      { cards: [], supportCards: [], music: [], stories: [] },
      resolveDummy,
      "zh-CN",
    );
    expect(event4!.bannerUrl).toContain("/zh-Hans/Image/Event/04/Banner/event_banner_00004/event_banner_00004.webp");
  });
});
