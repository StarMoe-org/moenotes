import { accountMemory } from "./memory";
import type { RecommendationRequest } from "./request";
import { integer, table, type DeckData, type Row } from "./data";
export interface Issue { path: string; code: string; message: string }
export interface AccountInput {
  format: string; datasetId: string; server: string; revision: string;
  coverage: Record<string, string>; declared: { _vip?: { _rank?: number } } | null;
  account: { _player: Record<string, unknown> };
}
const list = (value: unknown): Row[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("haneoka-account-list");
  return value as Row[];
};
const safeBandItemId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^(0|-?[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
};
export function adaptAccount(data: DeckData, account: AccountInput, request: RecommendationRequest, datasetId: string) {
  if (account.format !== "ournotes.account/1" || account.datasetId !== datasetId
    || account.server !== (data.provenance.region === "jp" ? "jp" : "intl")) throw new Error("haneoka-account-identity");
  const missing: Issue[] = [], errors: Issue[] = [];
  const issue = (path: string, code: string, message = code) => {
    const card = /^_player\._(memberCards|supportCards)\[(\d+)\]/.exec(path);
    const values = card ? account.account._player["_" + card[1]] : null;
    const id = card && Array.isArray(values) ? (values[Number(card[2])] as Row)?._masterId : null;
    (code === "missing" ? missing : errors).push({ path, code, message: id == null ? message : "_masterId " + id + ": " + message });
  };
  const known = (value: unknown, path: string): number | null => {
    if (value === null || value === undefined) { issue(path, "missing"); return null; }
    try { return integer(value, path); } catch { issue(path, "invalid_value"); return null; }
  };
  const rowCache = new Map<string, Row[]>();
  const rows = (name: string) => {
    if (!rowCache.has(name)) rowCache.set(name, table(data, name));
    return rowCache.get(name)!;
  };
  const level = (exp: unknown, group: unknown, name: string, path: string): number | null => {
    const value = known(exp, path);
    if (value === null) return null;
    const candidates = rows(name).filter(row => group === undefined || row.group === group)
      .sort((a, b) => Number(a.exp) - Number(b.exp));
    const row = candidates.filter(row => Number(row.exp) <= value).at(-1);
    if (!row) { issue(path, "no_level_row"); return null; }
    return Number(row.level ?? row.rank);
  };
  const p = account.account._player;
  const power = request.goal.kind === "power" || request.goal.kind === "skip";
  const gekiso = ["battleLive", "missionLive", "arenaLive"].includes(request.goal.kind);
  const excludeMembers = new Set((request.constraints?.excludeMembers ?? []).map(String));
  const excludeSnaps = new Set((request.constraints?.excludeSnaps ?? []).map(String));
  const arenaBandId = request.goal.kind === "arenaLive" && Number.isInteger(request.goal.arena?.bandId) ? request.goal.arena!.bandId! : null;
  const characterBand = arenaBandId === null ? null : new Map(rows("MasterCharacter").map(row => [row.id, row.bandID]));
  const memberMaster = new Map(rows("MasterMemberCard").map(row => [row.id, row]));
  const snapMaster = new Map(rows("MasterSupportCard").map(row => [row.id, row]));
  const seen = new Set<string>();
  let skippedUnknownCards = false;
  const cards = (name: string, snap: boolean) => list(p[name]).flatMap((card, index) => {
    const path = "_player." + name + "[" + index + "]";
    const id = known(card._masterId, path + "._masterId");
    if (id === null) return [];
    if ((snap ? excludeSnaps : excludeMembers).has(String(id))) return [];
    const identity = (snap ? "s" : "m") + id;
    if (seen.has(identity)) { issue(path + "._masterId", "duplicate_id"); return []; }
    seen.add(identity);
    const master = (snap ? snapMaster : memberMaster).get(id);
    if (!master) { skippedUnknownCards = true; return []; }
    if (!snap && characterBand && characterBand.get(master.characterID) !== arenaBandId) return [];
    const growth = {
      key: identity, cardId: id,
      level: level(card._exp, master[snap ? "supportCardLevelGroup" : "memberCardLevelGroup"], snap ? "MasterSupportCardLevel" : "MasterMemberCardLevel", path + "._exp"),
      rank: known(card._rank, path + "._rank"),
    };
    const rankTable = rows(snap ? "MasterSupportCardRank" : "MasterMemberCardRank");
    if (growth.rank !== null && !rankTable.some(row => row.group === master[snap ? "supportCardRankGroup" : "memberCardRankGroup"] && row.rank === growth.rank))
      issue(path + "._rank", "invalid_value");
    if (snap) {
      const limit = rankTable.find(row => row.group === master.supportCardRankGroup && row.rank === growth.rank);
      if (growth.level !== null && limit && growth.level > Number(limit.limitLevel)) issue(path + "._exp", "invalid_value");
      return [growth];
    }
    const awake = known(card._awakeCount, path + "._awakeCount");
    const liveSkillLevel = power || gekiso ? null : known(card._liveSkillLevel, path + "._liveSkillLevel");
    const gekisoSkillLevel = power || !gekiso ? null : known(card._performanceSkillLevel, path + "._performanceSkillLevel");
    if (awake !== null && !rows("MasterMemberCardAwake").some(row => row.group === master.memberCardAwakeGroup && row.awakeCount === awake))
      issue(path + "._awakeCount", "invalid_value");
    if (awake !== null && growth.level !== null) {
      const limit = rows("MasterMemberCardLevelLimit").find(row => row.rarity === master.rarity && row.awakeCount === awake);
      if (!limit || growth.level > Number(limit.limitLevel)) issue(path + "._exp", "invalid_value");
    }
    if (!power) {
      const value = gekiso ? gekisoSkillLevel : liveSkillLevel;
      const effects = rows(gekiso ? "MasterGekisouSkillEffect" : "MasterLiveSkillEffect");
      const key = gekiso ? "gekisouSkillID" : "liveSkillID";
      if (value !== null && !effects.some(row => row[key] === master[key] && row.level === value))
        issue(path + (gekiso ? "._performanceSkillLevel" : "._liveSkillLevel"), "invalid_value");
    }
    return [{ ...growth, awake, liveSkillLevel, gekisoSkillLevel }];
  });
  const members = cards("_memberCards", false);
  const snaps = request.constraints?.noSnaps ? [] : cards("_supportCards", true);
  const unique = (name: string, master: string) => {
    const entries = new Map<unknown, { row: Row; i: number }>();
    const ids = new Set(rows(master).map(row => row.id));
    for (const [i, row] of list(p[name]).entries()) {
      const path = "_player." + name + "[" + i + "]._masterId";
      if (entries.has(row._masterId)) { issue(path, "duplicate_id"); continue; }
      if (!ids.has(row._masterId)) continue;
      entries.set(row._masterId, { row, i });
    }
    return entries;
  };
  const characterRows = unique("_characters", "MasterCharacter");
  const characterRanks: Record<string, number> = {};
  for (const c of rows("MasterCharacter").filter(row => row.isNonPlayable === false)) {
    const entry = characterRows.get(c.id);
    if (!entry && account.coverage["_player._characters"] === "complete") { characterRanks[String(c.id)] = 1; continue; }
    const rank = level(entry?.row._exp, undefined, "MasterCharacterRank", entry ? "_player._characters[" + entry.i + "]._exp" : "_player._characters");
    if (rank !== null) characterRanks[String(c.id)] = rank;
  }
  const bandItems: Record<string, number> = {};
  for (const item of rows("MasterBandItem")) bandItems[String(item.id)] = 0;
  const bandItemLevels = new Map<number, number[]>();
  for (const row of rows("MasterBandItemLevel")) {
    const itemId = Number(row.bandItemId), lvl = Number(row.level);
    if (!Number.isSafeInteger(itemId) || !Number.isSafeInteger(lvl)) continue;
    const listForItem = bandItemLevels.get(itemId) ?? [];
    listForItem.push(lvl);
    bandItemLevels.set(itemId, listForItem);
  }
  for (const levelsForItem of bandItemLevels.values()) levelsForItem.sort((a, b) => a - b);
  if (Array.isArray(p._bandItems)) {
    for (const rawRow of p._bandItems) {
      if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) continue;
      const row = rawRow as Row;
      const id = safeBandItemId(row._masterId);
      if (id === null || !Object.prototype.hasOwnProperty.call(bandItems, String(id))) continue;
      const rawLevel = row._level;
      if (rawLevel === null || rawLevel === undefined) {
        bandItems[String(id)] = 0;
        continue;
      }
      if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
        const truncated = Math.trunc(rawLevel);
        if (truncated <= 0) {
          bandItems[String(id)] = 0;
        } else {
          const allowed = bandItemLevels.get(id) ?? [];
          if (allowed.includes(truncated)) {
            bandItems[String(id)] = truncated;
          } else {
            const clamped = allowed.filter(lvl => lvl <= truncated).at(-1) ?? 0;
            bandItems[String(id)] = clamped;
          }
        }
      } else {
        bandItems[String(id)] = 0;
      }
    }
  }
  const vipRank = known(account.declared?._vip?._rank, "declared._vip._rank");
  if (vipRank !== null && !rows("MasterVip").some(row => row.vipRank === vipRank)) issue("declared._vip._rank", "invalid_value");
  const memory = accountMemory(data, account, missing, errors);
  if (members.length < 5) issue("_player._memberCards", "not_enough_members");
  return {
    members, snaps, player: { characterRanks, characterTotalRank: Object.values(characterRanks).reduce((a, b) => a + b, 0),
      bandItems, vipRank, characterMemory: {}, musicMemory: {}, memory },
    missing, errors,
    coversAllOwnedCards: !skippedUnknownCards
      && account.coverage["_player._memberCards"] === "complete"
      && account.coverage["_player._supportCards"] === "complete",
  };
}
