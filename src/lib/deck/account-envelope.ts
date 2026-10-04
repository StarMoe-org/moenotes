import { gameSaveServer, type GameSaveServer } from "@/config/account";
import type { BoxCard, BoxField, CardBox, Observation } from "@/lib/box/model";
import { expForLevel, type GameSaveTables } from "@/lib/box/game-save";

/**
 * The account input of the deck core (`ournotes.account/1`): `{format, datasetId, server, revision, coverage,
 * assumptions, declared, account}` with `account` = `{"_player": …}` in the game's own field names. The text is
 * assembled from tokens, never through JSON.stringify of a parsed save, so int64 values keep every digit.
 */
export const ACCOUNT_FORMAT = "ournotes.account/1";
/** The answer format of a recommendation read from this input. */
export const ACCOUNT_RECOMMENDATION_FORMAT = "ournotes-deck.account-recommendation/1";
export const ACCOUNT_COVERAGE_PATHS = ["_player._memberCards", "_player._supportCards", "_player._characters", "_player._bandItems",
  "_player._memory._musicGroups", "_player._memory._members", "_player._memory._supports"] as const;
export type AccountCoveragePath = typeof ACCOUNT_COVERAGE_PATHS[number];
export type AccountCoverage = Record<AccountCoveragePath, "complete" | "partial">;
export interface AccountAssumption { path: string; reason: string }
/** Chosen by the caller: the deck data the input is read with (lowercase hex SHA-256 of its text) and its save server. */
export interface AccountTarget { datasetId: string; server: GameSaveServer }

const I64_MAX = 9223372036854775807n;
function long(id: string): string {
  if (!/^[1-9][0-9]*$/.test(id) || BigInt(id) > I64_MAX) throw new Error("Invalid long identity");
  return id;
}
function int(value: number | null): string {
  if (value === null) return "null";
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new Error("Invalid int value");
  return String(value);
}
/** A value the Box knows: answered or observed, not in conflict. */
function known<T>(field: BoxField<T> | undefined): T | null {
  return field && (field.status === "manual" || field.status === "observed") ? field.value : null;
}
function origin<T>(field: BoxField<T>): string {
  const evidence = [...field.history].reverse().find((item: Observation<T>) => item.value === field.value);
  return evidence?.source === "screenshot" ? "read from a screenshot" : "entered manually";
}
function checkTarget(target: AccountTarget, box: CardBox): void {
  if (!/^[a-f0-9]{64}$/.test(target.datasetId)) throw new Error("datasetId must be a lowercase hex SHA-256");
  if (target.server !== gameSaveServer(box.server)) throw new Error("The account server does not hold this Box's server");
}
/** VIP is not part of a save: the Box's own answer, or null (the core then reports it missing). */
function declared(box: CardBox): string {
  const vip = known(box.player.vipRank);
  return vip === null || vip < 1 ? "null" : `{"_vip":{"_rank":${int(vip)}}}`;
}
function document(target: AccountTarget, revision: string, coverage: AccountCoverage, assumptions: readonly AccountAssumption[], box: CardBox, player: string): string {
  const coverageText = ACCOUNT_COVERAGE_PATHS.map(path => `${JSON.stringify(path)}:${JSON.stringify(coverage[path])}`).join(",");
  const assumptionText = assumptions.map(item => `{"path":${JSON.stringify(item.path)},"reason":${JSON.stringify(item.reason)}}`).join(",");
  return `{"format":${JSON.stringify(ACCOUNT_FORMAT)},"datasetId":${JSON.stringify(target.datasetId)},"server":${JSON.stringify(target.server)},"revision":${JSON.stringify(revision)},`
    + `"coverage":{${coverageText}},"assumptions":[${assumptionText}],"declared":${declared(box)},"account":{"_player":${player}}}`;
}

/**
 * A linked Box: the save text exactly as downloaded becomes `_player`, every list is complete and the revision is
 * the save's SHA-256. `save.text` must be the text of the bytes whose SHA-256 the link records.
 */
export function gameSaveAccountJson(target: AccountTarget, box: CardBox, save: { text: string; sha256: string }): string {
  checkTarget(target, box);
  if (!box.save || box.save.sha256 !== save.sha256 || box.save.server !== target.server) throw new Error("The save is not the one this Box links");
  let value: unknown;
  try { value = JSON.parse(save.text); } catch { throw new Error("The save is not JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The save is not a JSON object");
  const coverage = Object.fromEntries(ACCOUNT_COVERAGE_PATHS.map(path => [path, "complete"])) as AccountCoverage;
  return document(target, save.sha256, coverage, [], box, save.text);
}

/**
 * A Box built from screenshots and manual answers: `_player` is assembled from its facts. Unknown values are null;
 * a known card level or character rank becomes the cumulative experience that level needs, recorded as an
 * assumption. Coverage follows the Box's completeness declarations.
 */
export function boxAccountJson(target: AccountTarget, box: CardBox, tables: GameSaveTables): string {
  checkTarget(target, box);
  if (box.save) throw new Error("A linked Box reads its save");
  if (tables.server !== box.server) throw new Error("Save tables belong to another server");
  const assumptions: AccountAssumption[] = [];
  const cards = (kind: BoxCard["kind"]) => box.cards.filter(card => card.kind === kind && card.identity.value !== null && card.identity.status !== "conflict");
  function experience(path: string, card: BoxCard, rows: readonly (readonly [number, number])[] | undefined): string {
    const level = known(card.fields.level);
    const exp = level === null ? null : expForLevel(rows, level);
    if (level !== null && exp !== null) assumptions.push({ path, reason: `Level ${level} ${origin(card.fields.level)}; experience is that level's threshold` });
    return int(exp);
  }
  const members = cards("member").map((card, index) => {
    const path = `_player._memberCards[${index}]`, id = long(card.identity.value!);
    return `{"_masterId":${id},"_exp":${experience(`${path}._exp`, card, tables.memberLevels[String(tables.members[id])])},"_awakeCount":${int(known(card.fields.awake))},`
      + `"_rank":${int(known(card.fields.rank))},"_liveSkillLevel":${int(known(card.fields.liveSkillLevel))},"_performanceSkillLevel":${int(known(card.fields.gekisouSkillLevel))}}`;
  });
  const snaps = cards("snap").map((card, index) => {
    const path = `_player._supportCards[${index}]`, id = long(card.identity.value!);
    return `{"_masterId":${id},"_exp":${experience(`${path}._exp`, card, tables.snapLevels[String(tables.snaps[id])])},"_rank":${int(known(card.fields.rank))}}`;
  });

  const characterCoverage = box.player.characterCoverage;
  // Under a complete declaration every character is listed, so an unanswered one stays unknown rather than reading as experience 0.
  const characterIds = [...new Set([...tables.characters.filter(id => characterCoverage === "complete" || id in box.player.characterRanks), ...Object.keys(box.player.characterRanks)])];
  const characters = characterIds.map((id, index) => {
    const rank = known(box.player.characterRanks[id]);
    const exp = rank === null ? null : tables.characterRanks.find(row => row[0] === rank)?.[1] ?? null;
    if (rank !== null && exp !== null) assumptions.push({ path: `_player._characters[${index}]._exp`, reason: `Character rank ${rank} ${origin(box.player.characterRanks[id]!)}; experience is that rank's threshold` });
    return `{"_masterId":${long(id)},"_exp":${int(exp)}}`;
  });

  const itemIds = [...new Set([...Object.keys(box.player.bandItemStates), ...Object.keys(box.player.bandItems)])];
  const bandItems = itemIds.map(id => {
    const state = known(box.player.bandItemStates[id]);
    const level = state === "not-owned" || state === "no-bonus" ? 0 : known(box.player.bandItems[id]);
    return `{"_masterId":${long(id)},"_level":${int(level)}}`;
  });

  const memory = known(box.player.memory);
  const groups = new Map<string, string[]>();
  for (const [music, rank] of Object.entries(memory?.musicRanks ?? {})) {
    const group = tables.memoryMusics[music];
    if (group) groups.set(group, [...groups.get(group) ?? [], `{"_id":${long(music)},"_unlockedScoreRank":${int(rank)}}`]);
  }
  const unlocked = (ids: readonly string[]) => ids.map(id => `{"_id":${long(id)},"_unlocked":true}`).join(",");
  const memoryText = `{"_musicGroups":[${[...groups].map(([group, musics]) => `{"_id":${long(group)},"_musics":[${musics.join(",")}]}`).join(",")}],`
    + `"_members":[${unlocked(memory?.unlockedMembers ?? [])}],"_supports":[${unlocked(memory?.unlockedSnaps ?? [])}]}`;
  const memoryCoverage = memory ? "complete" : "partial";

  const player = `{"_memberCards":[${members.join(",")}],"_supportCards":[${snaps.join(",")}],"_characters":[${characters.join(",")}],"_bandItems":[${bandItems.join(",")}],"_memory":${memoryText}}`;
  const coverage: AccountCoverage = {
    "_player._memberCards": box.coverage.member.complete ? "complete" : "partial",
    "_player._supportCards": box.coverage.snap.complete ? "complete" : "partial",
    "_player._characters": characterCoverage,
    "_player._bandItems": box.player.bandItemsComplete ? "complete" : "partial",
    "_player._memory._musicGroups": memoryCoverage, "_player._memory._members": memoryCoverage, "_player._memory._supports": memoryCoverage,
  };
  return document(target, `box:${box.id}:${box.revision}`, coverage, assumptions, box, player);
}
