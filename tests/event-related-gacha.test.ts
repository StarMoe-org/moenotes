import { describe, expect, test } from "bun:test";
import { relatedGachas, type EventGachaSources } from "../src/lib/events/data";

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
