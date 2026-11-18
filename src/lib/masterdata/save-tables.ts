import type { GameServer } from "@/config/servers";
import { validateMasterTable } from "@/lib/cards/data";
import type { GameSaveTables } from "@/lib/box/game-save";
import { getBuildManifest, getBuildMasterData, currentMasterDataEpochSync, isMasterDataManifestFresh } from "./build-snapshot";

type Row = Record<string, unknown>;
export interface GameSaveMasterRows {
  memberCards: readonly Row[]; supportCards: readonly Row[];
  memberCardLevels: readonly Row[]; supportCardLevels: readonly Row[];
  characterRanks: readonly Row[]; characters: readonly Row[];
  bandItems: readonly Row[]; bandItemLevels: readonly Row[];
  memoryMusicGroups: readonly Row[]; memoryMusics: readonly Row[];
}

function id(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) return value;
  throw new Error("Master ID is not a positive integer");
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Master value is not an integer");
  return value;
}
function levels(rows: readonly Row[]): Record<string, [number, number][]> {
  const groups: Record<string, [number, number][]> = {};
  for (const row of rows) (groups[String(integer(row.group))] ??= []).push([integer(row.level), integer(row.exp)]);
  // Experience order decides the level reached; equal experience keeps table order.
  for (const group of Object.values(groups)) group.sort((a, b) => a[1] - b[1]);
  return groups;
}

/** The compact Master subset a save of `server` is read with (field names already without their `_` prefix). */
export function buildGameSaveTables(server: GameServer, rows: GameSaveMasterRows): GameSaveTables {
  if (rows.characterRanks.some(row => typeof row.exp !== "number")) throw new Error("MasterCharacterRank needs its exp column");
  const bandItems: Record<string, number[]> = Object.fromEntries(rows.bandItems.map(row => [id(row.id), []]));
  for (const row of rows.bandItemLevels) bandItems[id(row.bandItemId)]?.push(integer(row.level));
  for (const values of Object.values(bandItems)) values.sort((a, b) => a - b);
  return {
    server,
    members: Object.fromEntries(rows.memberCards.map(row => [id(row.id), integer(row.memberCardLevelGroup)])),
    snaps: Object.fromEntries(rows.supportCards.map(row => [id(row.id), integer(row.supportCardLevelGroup)])),
    memberLevels: levels(rows.memberCardLevels),
    snapLevels: levels(rows.supportCardLevels),
    characterRanks: rows.characterRanks.map(row => [integer(row.rank), integer(row.exp)] as [number, number]).sort((a, b) => a[0] - b[0]),
    characters: rows.characters.filter(row => row.isNonPlayable !== true).map(row => id(row.id)),
    bandItems,
    memoryMusicGroups: rows.memoryMusicGroups.map(row => id(row.id)),
    memoryMusics: Object.fromEntries(rows.memoryMusics.map(row => [id(row.id), id(row.groupId)])),
  };
}

interface SaveTablesState {
  /** MasterData epoch the cached tables belong to; a rotation drops every entry. */
  epoch: number;
  byServer: Map<GameServer, Promise<GameSaveTables | null>>;
}

const stateKey = Symbol.for("moenotes.masterdata.save-tables");
const globalState = globalThis as typeof globalThis & { [stateKey]?: SaveTablesState };
const state = globalState[stateKey] ??= { epoch: -1, byServer: new Map() };

async function loadGameSaveTables(server: GameServer): Promise<GameSaveTables> {
  const names = ["MasterMemberCard", "MasterSupportCard", "MasterMemberCardLevel", "MasterSupportCardLevel", "MasterCharacterRank", "MasterCharacter", "MasterBandItem", "MasterBandItemLevel", "MasterMemoryMusicGroup", "MasterMemoryMusic"];
  const data = await Promise.all(names.map(name => getBuildMasterData(`${name}.json`, raw => validateMasterTable<Row>(raw)._allData, server)));
  return buildGameSaveTables(server, { memberCards: data[0]!, supportCards: data[1]!, memberCardLevels: data[2]!, supportCardLevels: data[3]!, characterRanks: data[4]!,
    characters: data[5]!, bandItems: data[6]!, bandItemLevels: data[7]!, memoryMusicGroups: data[8]!, memoryMusics: data[9]! });
}

/**
 * The save tables of `server` at its current MasterData version. They are rebuilt whenever the MasterData epoch
 * rotates, so a card or Snap released after the server started has its level group here; a cached older subset would
 * leave that card's level unencodable. Null when the tables are unavailable; a failure is not kept, so the next call
 * retries.
 */
export async function getBuildGameSaveTables(server: GameServer): Promise<GameSaveTables | null> {
  if (!isMasterDataManifestFresh()) {
    await getBuildManifest();
  }
  const epoch = currentMasterDataEpochSync();
  if (state.epoch !== epoch) {
    state.epoch = epoch;
    state.byServer.clear();
  }
  let request = state.byServer.get(server);
  if (!request) {
    request = loadGameSaveTables(server).catch(error => {
      console.warn(`[save-tables] ${server} tables unavailable: ${error instanceof Error ? error.message : String(error)}`);
      state.byServer.delete(server);
      return null;
    });
    state.byServer.set(server, request);
  }
  return request;
}
