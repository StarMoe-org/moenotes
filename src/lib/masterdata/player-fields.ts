import type { GameServer } from "@/config/servers";
import { validateMasterTable } from "@/lib/cards/data";
import type { MasterTextRow } from "./localize-text";
import { getBuildMasterData, getBuildMasterVersion } from "./build-snapshot";
import { validatePlayerCatalogue, type PlayerCatalogueField, type PlayerFieldCatalogue, type PlayerProfileCatalogue } from "@/lib/box/player-catalog";

type Row = Record<string, unknown>;
export interface PlayerMasterTables {
  bandItems: readonly Row[]; bandItemLevels: readonly Row[]; characters: readonly Row[];
  characterRanks: readonly Row[]; vip: readonly Row[]; texts: readonly MasterTextRow[];
  bands?: readonly Row[]; bandRanks?: readonly Row[]; bandTypeRanks?: readonly Row[]; playerRanks?: readonly Row[];
  bandItemEffects?: readonly Row[]; skillTargets?: readonly Row[]; members?: readonly Row[];
  memoryMusics?: readonly Row[]; memoryMusicGroups?: readonly Row[]; memoryMusicBonuses?: readonly Row[];
  memoryMemberLevels?: readonly Row[]; memorySupportLevels?: readonly Row[];
  events?: readonly Row[]; eventEffects?: readonly Row[];
}
function decimal(value: unknown): string {
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  throw new Error("Player catalogue identity is not a safe decimal ID");
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Player level is not a positive integer");
  return value;
}
function ordered(rows: readonly Row[]): Row[] {
  const band = (row: Row): bigint => row.bandId === undefined && row.bandID === undefined ? 0n : BigInt(decimal(row.bandId ?? row.bandID));
  return [...rows].sort((a, b) => {
    const first = band(a), second = band(b);
    return (first < second ? -1 : first > second ? 1 : 0) || Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0) || decimal(a.id).localeCompare(decimal(b.id));
  });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Each server's catalogue is built from that server's Master tables and defines the accepted input values. */
export async function buildPlayerCatalogue(server: GameServer, masterVersion: string, tables: PlayerMasterTables): Promise<PlayerFieldCatalogue | null> {
  // Character ranks cover playable characters only; a table with non-playable rows has no catalogue.
  if (tables.characters.some(row => row.isNonPlayable === true)) return null;
  if (!masterVersion) throw new Error("Player catalogue needs its actual master version");
  const texts = new Map(tables.texts.map(row => [row.id, row]));
  const [itemLevelsSha, ranksSha, vipSha] = await Promise.all([hash(tables.bandItemLevels), hash(tables.characterRanks), hash(tables.vip)]);
  const fields: PlayerCatalogueField[] = ordered(tables.bandItems).map(item => {
    const id = decimal(item.id);
    const levels = [...new Set(tables.bandItemLevels.filter(row => decimal(row.bandItemId) === id).map(row => positive(row.level)))].sort((a, b) => a - b);
    if (!levels.length) throw new Error("Furniture has no actual level rows");
    const label = texts.get(String(item.nameTextId));
    if (!label) throw new Error("Furniture label is missing from its nameTextId");
    return { key: `bandItem.${id}`, kind: "band-item", id, label, levels, targets: { bandIds: [decimal(item.bandId)] },
      sourceEvidence: `${server}/${masterVersion}; owned furniture and level; MasterBandItemLevel sha256:${itemLevelsSha}` };
  });
  const ranks = [...new Set(tables.characterRanks.map(row => positive(row.rank)))].sort((a, b) => a - b);
  if (!ranks.length) throw new Error("Character rank has no legal rows");
  for (const character of ordered(tables.characters)) {
    const id = decimal(character.id), label = texts.get(String(character.nameTextID));
    if (!label) throw new Error("Character rank label is missing from MasterText");
    fields.push({ key: `characterRank.${id}`, kind: "character-rank", id, label, levels: ranks,
      sourceEvidence: `${server}/${masterVersion}; character rank; MasterCharacterRank sha256:${ranksSha}` });
  }
  const characterCount = fields.filter(field => field.kind === "character-rank").length;
  if (!characterCount) throw new Error("Character rank catalogue has no actual character rows");
  fields.push({ key: "characterTotalRank", kind: "character-total-rank", label: {}, min: characterCount * ranks[0]!, max: characterCount * ranks.at(-1)!,
    sourceEvidence: `${server}/${masterVersion}; total character rank, range from the character count; MasterCharacterRank sha256:${ranksSha}` });
  const vip = [...new Set(tables.vip.map(row => positive(row.vipRank)))].sort((a, b) => a - b);
  if (!vip.length) throw new Error("VIP rank has no legal rows");
  fields.push({ key: "vipRank", kind: "vip-rank", label: {}, levels: vip,
    sourceEvidence: `${server}/${masterVersion}; VIP rank; MasterVip sha256:${vipSha}` });
  const payload = { format: "moenotes.player-fields/1" as const, server, masterVersion, fields };
  // A new layout, portrait or optional profile rating must not invalidate unchanged power observations.
  const catalogue: PlayerFieldCatalogue = { ...payload, sha256: await hash(payload), profile: await profileCatalogue(server, masterVersion, tables, texts) };
  validatePlayerCatalogue(catalogue);
  return catalogue;
}

async function profileCatalogue(server: GameServer, masterVersion: string, tables: PlayerMasterTables, texts: ReadonlyMap<string, MasterTextRow>): Promise<PlayerProfileCatalogue> {
  const color = (value: unknown): string => typeof value === "string" && /^#?[a-f0-9]{6}$/i.test(value) ? `#${value.replace(/^#/, "")}` : "";
  const characters = ordered(tables.characters).map(row => ({ id: decimal(row.id), bandId: decimal(row.bandID), label: texts.get(String(row.nameTextID))!, color: color(row.mainColorCode), subColor: color(row.subColorCode) }));
  const bands = ordered(tables.bands ?? []).map(row => ({ id: decimal(row.id), label: texts.get(String(row.nameTextID)) ?? {}, color: color(row.mainColorCode), subColor: color(row.subColorCode) }));
  const fields: PlayerCatalogueField[] = [];
  const rows = async (data: readonly Row[] | undefined, role: string, key: string, targets?: PlayerCatalogueField["targets"]): Promise<void> => {
    if (!data?.length) return;
    const levels = [...new Set(data.map(row => positive(row.rank)))].sort((a,b) => a-b);
    fields.push({ key, kind: "other", label: {}, levels, ...(targets ? { targets } : {}),
      sourceEvidence: `${server}/${masterVersion}; optional ${role}; rank rows sha256:${await hash(data)}` });
  };
  await rows(tables.playerRanks, "player rank", "profile.playerRank");
  const attributes = [...new Set((tables.members ?? []).map(row => positive(row.cardType)))].sort((a,b) => a-b);
  for (const band of bands) {
    await rows(tables.bandRanks, "band rank", `profile.bandRank.${band.id}`, { bandIds: [band.id] });
    for (const attribute of attributes) await rows(tables.bandTypeRanks, "band attribute rank", `profile.bandTypeRank.${band.id}.${attribute}`, { bandIds: [band.id], attributes: [attribute] });
  }
  const targetMap = new Map((tables.skillTargets ?? []).map(row => [decimal(row.id), row]));
  const bandItems = ordered(tables.bandItems).map(item => {
    const id = decimal(item.id);
    const targetIds = [...new Set((tables.bandItemEffects ?? []).filter(row => decimal(row.bandItemId) === id).flatMap(row => Array.isArray(row.skillTargetIDs) ? row.skillTargetIDs.map(decimal) : []))];
    const actual = targetIds.map(target => { const row = targetMap.get(target); if (!row) throw new Error("Furniture skill target is missing from matching MasterSkillTarget"); return row; });
    const ids = (key: string) => [...new Set(actual.filter(row => typeof row[key] === "number" && (row[key] as number) > 0).map(row => decimal(row[key])))];
    return { id, targetIds, bandIds: ids("bandID"), characterIds: ids("characterID"), attributes: [...new Set(actual.flatMap(row => typeof row.cardType === "number" && row.cardType > 0 ? [row.cardType] : []))] };
  });
  const profile: PlayerProfileCatalogue = { characters, bands, fields, bandItems };
  const memoryTables = [tables.memoryMusics, tables.memoryMusicGroups, tables.memoryMusicBonuses, tables.memoryMemberLevels, tables.memorySupportLevels];
  if (memoryTables.every(table => table !== undefined)) profile.memory = {
    musicIds: tables.memoryMusics!.map(row => decimal(row.id)),
    hasEffects: memoryTables.some(table => table!.length > 0),
    sourceEvidence: `${server}/${masterVersion}; memory progress; memory tables sha256:${await hash(memoryTables)}`,
  };
  if (tables.events && tables.eventEffects) profile.events = {
    choices: tables.events.map(row => ({ id: decimal(row.id), label: texts.get(String(row.nameTextId)) ?? {}, type: Number(row.eventType), startAt: String(row.startAt), endAt: String(row.endAt) })),
    sourceEvidence: `${server}/${masterVersion}; event selection; MasterEvent/MasterEventEffect sha256:${await hash([tables.events, tables.eventEffects])}`,
  };
  return profile;
}

const pending = new Map<GameServer, Promise<PlayerFieldCatalogue | null>>();
export function getBuildPlayerCatalogue(server: GameServer): Promise<PlayerFieldCatalogue | null> {
  let request = pending.get(server);
  if (!request) {
    request = (async () => {
      const names = ["MasterBandItem", "MasterBandItemLevel", "MasterCharacter", "MasterCharacterRank", "MasterVip", "MasterText", "MasterBand", "MasterBandRank", "MasterBandTypeRank", "MasterPlayerRank", "MasterBandItemSkillEffect", "MasterSkillTarget", "MasterMemberCard", "MasterMemoryMusic", "MasterMemoryMusicGroup", "MasterMemoryMusicBonus", "MasterMemoryMemberLevel", "MasterMemorySupportLevel", "MasterEvent", "MasterEventEffect"];
      const data = await Promise.all(names.map(name => getBuildMasterData(`${name}.json`, raw => validateMasterTable<Row>(raw)._allData, server)));
      const version = await getBuildMasterVersion(server);
      if (!version) throw new Error("Player master version unavailable");
      return buildPlayerCatalogue(server, version, { bandItems: data[0]!, bandItemLevels: data[1]!, characters: data[2]!, characterRanks: data[3]!, vip: data[4]!, texts: data[5]! as unknown as MasterTextRow[],
        bands: data[6]!, bandRanks: data[7]!, bandTypeRanks: data[8]!, playerRanks: data[9]!, bandItemEffects: data[10]!, skillTargets: data[11]!, members: data[12]!,
        memoryMusics: data[13]!, memoryMusicGroups: data[14]!, memoryMusicBonuses: data[15]!, memoryMemberLevels: data[16]!, memorySupportLevels: data[17]!, events: data[18]!, eventEffects: data[19]! });
    })().catch(error => { console.warn(`[player-fields] ${server} catalogue unavailable: ${error instanceof Error ? error.message : String(error)}`); return null; });
    pending.set(server, request);
  }
  return request;
}
