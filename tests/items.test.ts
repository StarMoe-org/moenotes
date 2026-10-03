import { describe, expect, test } from "bun:test";
import {
  addCharacterRankSources,
  addEventSources,
  addExchangeSources,
  addFriendshipRankSources,
  addStorySources,
  collectItemUsages,
  createItemSourceCollector,
  type EventSourceView,
} from "../src/lib/items/sources";
import { bandRankUpItemId } from "../src/lib/masterdata/build-item-sources";

const item = (id: number, count: number) => ({ kind: "item" as const, id, count });

describe("item sources", () => {
  test("only items count, and one source sums its rows and lists each part once", () => {
    const collector = createItemSourceCollector();
    const event: EventSourceView = {
      id: 1, name: "Event A",
      pointRewards: [{ rewards: [item(43, 10), { kind: "member", id: 43, count: 1 }] }, { rewards: [item(43, 5)] }],
      loopReward: null, live: [{ rewards: [item(43, 2)] }], challengeLive: [], missions: [],
      boxGacha: null, rankingRewards: [], challengeMusic: null,
    };
    addEventSources(collector, [event]);
    const [source] = collector.result().get(43)!;
    expect(source).toEqual({ kind: "event", key: "1", name: "Event A", details: ["pointReward", "liveReward"], total: 17, times: 3, link: { routeId: "events", detailId: 1 } });
  });

  test("resource rows: only resourceType 1 is an item", () => {
    const collector = createItemSourceCollector();
    addCharacterRankSources(collector, [
      { characterId: 0, resourceType: 1, resourceId: 3, resourceCount: 500 },
      { characterId: 1, resourceType: 17, resourceId: 3, resourceCount: 1 },
      { characterId: 2, resourceType: 1, resourceId: 3, resourceCount: 100 },
    ], (id) => `Character ${id}`);
    const sources = collector.result().get(3)!;
    expect(sources.map((source) => [source.key, source.name, source.total])).toEqual([["0", "", 500], ["2", "Character 2", 100]]);
    expect(sources[1]!.link).toEqual({ routeId: "characters", detailId: 2 });
  });

  test("sources are ordered by kind, whatever order they were added in", () => {
    const collector = createItemSourceCollector();
    addFriendshipRankSources(collector, [{ characterFriendshipId: 102, resourceType: 1, resourceId: 28, resourceCount: 30 }], () => "A × B");
    addExchangeSources(collector, [{ id: 12, name: "Shop", products: [{ reward: item(28, 1) }] }]);
    expect(collector.result().get(28)!.map((source) => source.kind)).toEqual(["exchange", "friendshipRank"]);
  });

  test("story rewards are paid per episode naming the group, one source per story category", () => {
    const collector = createItemSourceCollector();
    addStorySources(collector, [
      { group: 2, resourceType: 1, resourceId: 36, resourceCount: 1 },
      { group: 3, resourceType: 1, resourceId: 1, resourceCount: 25 },
    ], [
      { category: "main", rewardGroupId: 2, eventRewardGroupId: 0 },
      { category: "main", rewardGroupId: 2, eventRewardGroupId: 0 },
      { category: "friendship", rewardGroupId: 3, eventRewardGroupId: 0 },
    ]);
    const result = collector.result();
    expect(result.get(36)).toEqual([{ kind: "story", key: "main", name: "", details: ["episodeReward"], total: 2, times: 2, link: { routeId: "main-story" } }]);
    expect(result.get(1)![0]!.link).toEqual({ routeId: "friendship-story" });
  });
});

describe("item usages (material reverse lookup)", () => {
  const sources = {
    cards: [
      { id: 1, name: "Tomori · A", awakeResourceGroup: 5, rankGroup: 1, liveSkillResourceGroup: 1, gekisouSkillResourceGroup: 5, rankUpItemId: 10000001, bandRankUpItemId: 20000001 },
      { id: 2, name: "Anon · B", awakeResourceGroup: 5, rankGroup: 1, liveSkillResourceGroup: 1, gekisouSkillResourceGroup: 5, rankUpItemId: 10000002, bandRankUpItemId: 20000001 },
    ],
    awakeResources: [
      { group: 5, awakeCount: 2, itemId: 3, count: 10000 },
      { group: 5, awakeCount: 3, itemId: 3, count: 20000 },
      { group: 5, awakeCount: 2, itemId: 19, count: 150 },
    ],
    skillResources: [
      { group: 1, level: 2, itemID: 24, count: 10 },
      { group: 1, level: 3, itemID: 24, count: 20 },
      { group: 1000, level: 2, itemID: 3, count: 500 },
    ],
    memberRanks: [
      { group: 1, rank: 1, requiredRankUpItemCount: 0 },
      { group: 1, rank: 2, requiredRankUpItemCount: 60 },
      { group: 1, rank: 3, requiredRankUpItemCount: 120 },
    ],
    bandItems: [{ id: 101, name: "Guitar", resourceGroupId: 1000 }],
  };

  test("training materials sum every step per card, and cards sharing a cost share an entry", () => {
    const usages = collectItemUsages(sources);
    const coins = usages.get(3)!;
    expect(coins.map((usage) => [usage.kind, usage.perTarget, usage.targets.map((target) => target.id)])).toEqual([
      ["memberTraining", 30000, [1, 2]],
      ["bandItem", 500, [101]],
    ]);
    expect(coins[1]!.targets[0]!.link).toEqual({ routeId: "band-items", query: { item: "101" } });
    expect(usages.get(24)!.map((usage) => [usage.kind, usage.perTarget])).toEqual([["memberLiveSkill", 30]]);
  });

  test("awakening spends the card's own piece, or the band's piece of its rarity instead", () => {
    const usages = collectItemUsages(sources);
    expect(usages.get(10000001)).toEqual([{ kind: "memberAwaken", perTarget: 180, targets: [{ id: 1, name: "Tomori · A", link: { routeId: "cards", detailId: 1 } }] }]);
    const bandPiece = usages.get(20000001)!;
    expect(bandPiece).toHaveLength(1);
    expect(bandPiece[0]!.alternative).toBe(true);
    expect(bandPiece[0]!.targets.map((target) => target.id)).toEqual([1, 2]);
  });

  test("the band's piece follows the card's rarity", () => {
    const band = { id: 1, rankUpItemIdForRarityR: 20000001, rankUpItemIdForRaritySR: 20000002, rankUpItemIdForRaritySSR: 20000003, rankUpItemIdForRarityBD: 20000004 };
    expect([2, 3, 4, 20, 10].map((rarity) => bandRankUpItemId(band, rarity))).toEqual([20000001, 20000002, 20000003, 20000004, 0]);
    expect(bandRankUpItemId(undefined, 2)).toBe(0);
  });
});
