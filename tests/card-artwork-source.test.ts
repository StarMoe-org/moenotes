import { expect, test } from "bun:test";
import { normalizeCards, type RawBand, type RawCharacter, type RawMemberCard } from "../src/lib/cards/data";
import { listForServer, mergeServerLists } from "../src/lib/servers/facets";

const member = (id: number, rarity: number): RawMemberCard => ({ id, assetID: 1000 + id, characterID: 1, rarity, cardType: 1,
  nameTextID: "character", subtitleTextID: "card", gachaVoiceTextId: "", startAt: "2026-01-01",
  liveSkillID: 1, leaderSkillID: 1, gekisouSkillID: 1, performancePowerMax: 1, technicPowerMax: 1, visualPowerMax: 1,
  memberCardLevelGroup: 1, memberCardAwakeGroup: 1, memberCardRankGroup: 1 });
const characters: RawCharacter[] = [{ id: 1, bandID: 9, displayOrder: 1, nameTextID: "character", enDisplayNameTextId: "character", mainColorCode: "#000000" }];
const bands: RawBand[] = [{ id: 9, nameTextID: "band", mainColorCode: "#000000", memberRarityRBackgroundAssetPath: "Band/9/actual_shared_background[decoded_source_name]" }];

test("ordinary and Snap catalogue cards retain their exact separate formation background source", () => {
  const cards = normalizeCards([member(1, 2), member(2, 3), member(3, 4)], characters, bands, [], "en-US");
  expect(cards.find(card => card.id === 1)?.formationBackgroundKey).toBe("Band/9/actual_shared_background[decoded_source_name]");
  expect(cards.find(card => card.id === 2)?.formationBackgroundKey).toBe("MemberCard/1002/member_background[formation]");
  expect(cards.find(card => card.id === 3)?.formationBackgroundKey).toBe("MemberCard/1003/member_background[formation]");
  const missingBackground = { ...bands[0]! }; delete missingBackground.memberRarityRBackgroundAssetPath;
  const absent = normalizeCards([member(1, 2)], characters, [missingBackground], [], "en-US");
  expect(absent[0]?.formationBackgroundKey).toBeNull();
  const merged = mergeServerLists([["tw", cards], ["jp", absent]], card => card.id);
  expect(listForServer(merged, "jp")[0]?.formationBackgroundKey).toBeNull();
});
