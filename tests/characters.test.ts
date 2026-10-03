import { describe, expect, test } from "bun:test";
import {
  characterFriendshipIds,
  getVoiceTypeName,
  normalizeFriendshipRankRewards,
  normalizeRankRewards,
} from "../src/lib/characters/data";
import { buildMemberCardMaterials, buildSupportCardMaterials } from "../src/lib/cards/materials";

const resolve = (row: { resourceType: number; resourceId: number; resourceCount: number }) => ({ kind: "item", id: row.resourceId, count: row.resourceCount, name: `#${row.resourceId}`, imageUrl: "" });

describe("character rank and bond rewards", () => {
  test("rank rewards: a character's own rows plus the shared characterId 0 rows", () => {
    const groups = normalizeRankRewards([
      { characterId: 0, rank: 2, resourceType: 1, resourceId: 3, resourceCount: 500 },
      { characterId: 1, rank: 3, resourceType: 1, resourceId: 10000001, resourceCount: 150 },
      { characterId: 2, rank: 3, resourceType: 1, resourceId: 10000002, resourceCount: 150 },
    ], 1, resolve);
    expect(groups.map((group) => [group.rank, group.rewards.map((reward) => reward.id)])).toEqual([[2, [3]], [3, [10000001]]]);
  });

  test("bond rewards are keyed by the pair's MasterCharacterFriendship id, not by a character id", () => {
    const friendships = [
      { id: 102, masterCharacterIdA: 1, masterCharacterIdB: 2 },
      { id: 103, masterCharacterIdA: 1, masterCharacterIdB: 3 },
      { id: 203, masterCharacterIdA: 2, masterCharacterIdB: 3 },
    ];
    expect(characterFriendshipIds(friendships, 1)).toEqual([102, 103]);
    const rows = [
      { characterFriendshipId: 0, rank: 2, resourceType: 1, resourceId: 3, resourceCount: 15000 },
      { characterFriendshipId: 102, rank: 9, resourceType: 1, resourceId: 28, resourceCount: 30 },
      { characterFriendshipId: 203, rank: 9, resourceType: 1, resourceId: 29, resourceCount: 30 },
    ];
    const groups = normalizeFriendshipRankRewards(rows, characterFriendshipIds(friendships, 1), resolve);
    // The old lookup compared a characterId field the table does not have, so it always came back empty.
    expect(groups.map((group) => [group.rank, group.rewards.map((reward) => reward.id)])).toEqual([[2, [3]], [9, [28]]]);
  });
});

describe("character voice types", () => {
  test("MasterCharacterVoice type 0–10 names follow the cue names", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(getVoiceTypeName)).toEqual([
      "levelUp", "training", "skillUp", "awaken", "clear", "fullCombo", "allPerfect", "result", "battleFirst", "battleHigh", "battleLow",
    ]);
    expect(getVoiceTypeName(42)).toBe("other");
  });
});

describe("card upgrade materials", () => {
  const item = (itemId: number, count: number) => ({ id: String(itemId), name: `#${itemId}`, imageUrl: "", count });

  test("member cards: training, awakening (own piece, band piece as alternative) and skill steps", () => {
    const groups = buildMemberCardMaterials(
      { awakeResourceGroup: 5, rankGroup: 1, liveSkillResourceGroup: 1, gekisouSkillResourceGroup: 0, rankUpItemId: 10000001, bandRankUpItemId: 20000001 },
      {
        awakeResources: [{ group: 5, awakeCount: 2, itemId: 3, count: 10000 }, { group: 5, awakeCount: 2, itemId: 19, count: 150 }, { group: 6, awakeCount: 2, itemId: 3, count: 1 }],
        ranks: [{ group: 1, rank: 1, requiredRankUpItemCount: 0 }, { group: 1, rank: 2, requiredRankUpItemCount: 60 }],
        skillResources: [{ group: 1, level: 2, itemID: 24, count: 10 }, { group: 1, level: 3, itemID: 24, count: 20 }],
      },
      item,
    );
    expect(groups.map((group) => group.kind)).toEqual(["training", "awaken", "liveSkill"]);
    expect(groups[0]!.steps).toEqual([{ from: 1, to: 2, costs: [item(3, 10000), item(19, 150)] }]);
    expect(groups[1]!.steps).toEqual([{ from: 1, to: 2, costs: [item(10000001, 60)] }]);
    expect(groups[1]!.alternative?.id).toBe("20000001");
    expect(groups[2]!.steps.map((step) => [step.from, step.to])).toEqual([[1, 2], [2, 3]]);
  });

  test("support cards: each limit break costs copies of the same card", () => {
    const groups = buildSupportCardMaterials(1, [{ group: 1, rank: 1, requiredRankUpItemCount: 0 }, { group: 1, rank: 2, requiredRankUpItemCount: 1 }, { group: 2, rank: 2, requiredRankUpItemCount: 9 }], (count) => ({ id: "card:1", name: "Snap", imageUrl: "", count }));
    expect(groups).toEqual([{ kind: "limitBreak", steps: [{ from: 1, to: 2, costs: [{ id: "card:1", name: "Snap", imageUrl: "", count: 1 }] }] }]);
  });
});
