import { describe, expect, test } from "bun:test";
import { deriveGameSaveBox, parseGameSave, type GameSaveTables } from "../src/lib/box/game-save";
import { answerField, createBox, parseBox, type BoxSaveLink } from "../src/lib/box/model";
import { boxAccountJson } from "../src/lib/deck/account-envelope";

const tables: GameSaveTables = {
  server: "tw", members: { "101": 1 }, snaps: { "201": 1 },
  memberLevels: { "1": [[1, 0], [2, 10]] }, snapLevels: { "1": [[1, 0], [2, 7]] },
  characterRanks: [[1, 0], [2, 3]], characters: ["1"], bandItems: {}, memoryMusicGroups: [], memoryMusics: {},
};
const target = { datasetId: "c".repeat(64), server: "intl" as const };
const link: BoxSaveLink = { server: "intl", accountId: "20000000001", sha256: "a".repeat(64), uploadedAt: 100 };

function snapshot() {
  const player = parseGameSave(JSON.stringify({
    _memberCards: [{ _masterId: 101, _exp: 19, _awakeCount: 1, _rank: 3, _liveSkillLevel: 2, _performanceSkillLevel: 4 }],
    _supportCards: [{ _masterId: 201, _exp: 9, _rank: 2 }], _characters: [{ _masterId: 1, _exp: 4 }],
  }));
  const view = deriveGameSaveBox(createBox("tw", "snapshot", 1), link, player, tables, null).box;
  return parseBox(JSON.stringify({ ...view, save: null }));
}

describe("independent snapshot account envelope", () => {
  test("preserves game-save origins while explicitly reconstructing threshold experience", () => {
    const envelope = JSON.parse(boxAccountJson(target, snapshot(), tables));
    expect(envelope.account._player._memberCards[0]).toMatchObject({ _masterId: 101, _exp: 10, _rank: 3 });
    expect(envelope.account._player._supportCards[0]).toEqual({ _masterId: 201, _exp: 7, _rank: 2 });
    expect(envelope.account._player._characters[0]).toEqual({ _masterId: 1, _exp: 3 });
    expect(envelope.assumptions).toEqual([
      { path: "_player._memberCards[0]._exp", reason: "Level 2 read from a game save; experience is that level's threshold" },
      { path: "_player._supportCards[0]._exp", reason: "Level 2 read from a game save; experience is that level's threshold" },
      { path: "_player._characters[0]._exp", reason: "Character rank 2 read from a game save; experience is that rank's threshold" },
    ]);
    expect(envelope.coverage["_player._memberCards"]).toBe("complete");
  });

  test("a manual correction keeps its origin even with matching historical save evidence", () => {
    const box = snapshot();
    const card = box.cards.find(item => item.kind === "member")!;
    card.fields.level = answerField(card.fields.level, { id: "manual-level", source: "manual", value: 2, at: 101 });
    const envelope = JSON.parse(boxAccountJson(target, box, tables));
    expect(envelope.assumptions[0].reason).toBe("Level 2 entered manually; experience is that level's threshold");
    expect(card.fields.level.history.some(item => item.source === "game-save")).toBe(true);
  });
});
