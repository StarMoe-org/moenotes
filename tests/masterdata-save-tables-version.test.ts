import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetMasterDataSnapshotForTests } from "../src/lib/masterdata/build-snapshot";
import { getBuildPlayerCatalogue } from "../src/lib/masterdata/player-fields";
import { getBuildGameSaveTables } from "../src/lib/masterdata/save-tables";

/**
 * A card or Snap released after a server process started must reach the save tables: the level group of the new card
 * has to be there, or a known level cannot be encoded as experience (the reported “_supportCards[n]._exp missing”
 * dead end). Both caches are therefore scoped to the MasterData epoch rather than to the process.
 */

const SAVE_TABLES = [
  "MasterMemberCard", "MasterSupportCard", "MasterMemberCardLevel", "MasterSupportCardLevel",
  "MasterCharacterRank", "MasterCharacter", "MasterBandItem", "MasterBandItemLevel",
  "MasterMemoryMusicGroup", "MasterMemoryMusic",
] as const;
const PLAYER_TABLES = [
  "MasterBandItem", "MasterBandItemLevel", "MasterCharacter", "MasterCharacterRank", "MasterVip", "MasterText",
  "MasterBand", "MasterBandRank", "MasterBandTypeRank", "MasterPlayerRank", "MasterBandItemSkillEffect",
  "MasterSkillTarget", "MasterMemberCard", "MasterMemoryMusic", "MasterMemoryMusicGroup", "MasterMemoryMusicBonus",
  "MasterMemoryMemberLevel", "MasterMemorySupportLevel", "MasterEvent", "MasterEventEffect",
] as const;

type Rows = Record<string, unknown>[];

const text = (id: string) => ({ _id: id, _japanese: id, _english: id, _simplifiedChinese: id, _traditionalChinese: id, _korean: id });

/** The tables a released Snap needs; Snap 85 (level group 5) is part of them. */
function tables(): Record<string, Rows> {
  return {
    MasterMemberCard: [{ _id: 51, _memberCardLevelGroup: 3, _cardType: 1 }],
    MasterSupportCard: [{ _id: 76, _supportCardLevelGroup: 3 }, { _id: 85, _supportCardLevelGroup: 5 }],
    MasterMemberCardLevel: [{ _id: 1, _group: 3, _level: 1, _exp: 0 }],
    MasterSupportCardLevel: [
      { _id: 1, _group: 3, _level: 1, _exp: 0 },
      { _id: 2, _group: 5, _level: 1, _exp: 0 },
      { _id: 3, _group: 5, _level: 2, _exp: 40 },
    ],
    MasterCharacterRank: [{ _id: 1, _rank: 1, _exp: 0 }],
    MasterCharacter: [{ _id: 1, _bandID: 1, _isNonPlayable: false, _nameTextID: "character.1", _mainColorCode: "#112233" }],
    MasterBandItem: [{ _id: 501, _bandId: 1, _nameTextId: "bandItem.501" }],
    MasterBandItemLevel: [{ _id: 1, _bandItemId: 501, _level: 1 }],
    MasterMemoryMusicGroup: [],
    MasterMemoryMusic: [],
    MasterVip: [{ _id: 1, _vipRank: 1 }],
    MasterText: [text("bandItem.501"), text("character.1")],
    MasterBand: [{ _id: 1, _nameTextID: "character.1" }],
    MasterBandRank: [],
    MasterBandTypeRank: [],
    MasterPlayerRank: [],
    MasterBandItemSkillEffect: [],
    MasterSkillTarget: [],
    MasterMemoryMusicBonus: [],
    MasterMemoryMemberLevel: [],
    MasterMemorySupportLevel: [],
    MasterEvent: [],
    MasterEventEffect: [],
  };
}

function writeMaster(dir: string, version: string, rows: Record<string, Rows>, skip: readonly string[] = []): void {
  const region = join(dir, "jp");
  mkdirSync(region, { recursive: true });
  writeFileSync(join(dir, "current_version.json"), JSON.stringify({ schema_version: 1, regions: { jp: { version } } }));
  for (const name of [...SAVE_TABLES, ...PLAYER_TABLES]) {
    if (skip.includes(name)) continue;
    writeFileSync(join(region, `${name}.json`), JSON.stringify({ _allData: rows[name] ?? [] }));
  }
}

describe("save tables follow the MasterData version", () => {
  const saved: Partial<Record<string, string | undefined>> = {};
  let dir = "";

  beforeEach(() => {
    for (const key of ["MOENOTES_MASTERDATA_DIR", "MOENOTES_MASTERDATA_VERSION_TTL_MS", "MOENOTES_MASTERDATA_CACHE_DIR"]) saved[key] = process.env[key];
    delete process.env.MOENOTES_MASTERDATA_CACHE_DIR;
    // Read current_version.json on every call, so a rotation is seen inside one test.
    process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS = "0";
    dir = mkdtempSync(join(tmpdir(), "moenotes-save-tables-"));
    process.env.MOENOTES_MASTERDATA_DIR = dir;
    resetMasterDataSnapshotForTests();
  });

  afterEach(() => {
    resetMasterDataSnapshotForTests();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test("a Snap released after the first read has its level group, and its level encodes as experience", async () => {
    // The first version of the server does not know Snap 85 yet.
    writeMaster(dir, "1.0.0", {
      ...tables(),
      MasterSupportCard: [{ _id: 76, _supportCardLevelGroup: 3 }],
      MasterSupportCardLevel: [{ _id: 1, _group: 3, _level: 1, _exp: 0 }],
    });

    const first = await getBuildGameSaveTables("jp");
    expect(first?.snaps).toEqual({ "76": 3 });
    expect(first?.snapLevels["5"]).toBeUndefined();

    // MasterData moves on: Snap 85 with level group 5 arrives.
    writeMaster(dir, "1.0.1", tables());

    const second = await getBuildGameSaveTables("jp");
    expect(second).not.toBe(first);
    expect(second?.snaps).toEqual({ "76": 3, "85": 5 });
    expect(second?.snapLevels["5"]).toEqual([[1, 0], [2, 40]]);
  });

  test("a failed build is not cached, so the next call reads the tables again", async () => {
    writeMaster(dir, "1.0.0", tables(), ["MasterSupportCardLevel"]);

    expect(await getBuildGameSaveTables("jp")).toBeNull();

    writeMaster(dir, "1.0.0", tables());
    const tablesNow = await getBuildGameSaveTables("jp");
    expect(tablesNow?.snapLevels["5"]).toEqual([[1, 0], [2, 40]]);
  });

  test("the player field catalogue follows the same rotation", async () => {
    writeMaster(dir, "1.0.0", tables());
    const first = await getBuildPlayerCatalogue("jp");
    expect(first?.fields.some(field => field.key === "bandItem.501")).toBe(true);

    const extended = tables();
    extended.MasterBandItem = [...extended.MasterBandItem, { _id: 502, _bandId: 1, _nameTextId: "bandItem.502" }];
    extended.MasterBandItemLevel = [...extended.MasterBandItemLevel, { _id: 2, _bandItemId: 502, _level: 1 }];
    extended.MasterText = [...extended.MasterText, text("bandItem.502")];
    writeMaster(dir, "1.0.1", extended);

    const second = await getBuildPlayerCatalogue("jp");
    expect(second?.fields.some(field => field.key === "bandItem.502")).toBe(true);
    expect(second?.sha256).not.toBe(first?.sha256);
  });
});
