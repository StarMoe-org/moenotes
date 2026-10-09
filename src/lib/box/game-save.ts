import type { GameServer } from "@/config/servers";
import { unknownField, type BandItemState, type BoxCard, type BoxField, type BoxMemory, type BoxSaveLink, type CardBox, type CardFieldName, type Observation, type PlayerCatalogIdentity } from "./model";
import type { PlayerFieldCatalogue } from "./player-catalog";

/**
 * The parts of one server's Master a game save is read with. Levels are `[level, exp]` pairs, `exp` being the
 * cumulative experience the level needs; character ranks are `[rank, exp]` pairs of the same kind.
 */
export interface GameSaveTables {
  server: GameServer;
  /** Member card ID → `memberCardLevelGroup`. */
  members: Readonly<Record<string, number>>;
  /** Snap (support card) ID → `supportCardLevelGroup`. */
  snaps: Readonly<Record<string, number>>;
  memberLevels: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  snapLevels: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  characterRanks: readonly (readonly [number, number])[];
  characters: readonly string[];
  /** Band item ID → its levels. */
  bandItems: Readonly<Record<string, readonly number[]>>;
  memoryMusicGroups: readonly string[];
  /** Memory music ID → its music group ID. */
  memoryMusics: Readonly<Record<string, string>>;
}

/** A number as written in the save: absent or `null` is unknown; `invalid` is any other non-conforming value. */
type Read<T> = T | null | "invalid";
export interface GameSaveMemberCard { masterId: Read<string>; exp: Read<number>; awakeCount: Read<number>; rank: Read<number>; liveSkillLevel: Read<number>; performanceSkillLevel: Read<number> }
export interface GameSaveSupportCard { masterId: Read<string>; exp: Read<number>; rank: Read<number> }
export interface GameSaveCharacter { masterId: Read<string>; exp: Read<number> }
export interface GameSaveBandItem { masterId: Read<string>; level: Read<number> }
export interface GameSaveMemoryCard { id: Read<string>; unlocked: Read<boolean> }
export interface GameSaveMusicGroup { id: Read<string>; musics: { id: Read<string>; unlockedScoreRank: Read<number> }[] }
/** The fields of a save's `_player` object the Box reads; everything else in the save is ignored. */
export interface GameSavePlayer {
  memberCards: GameSaveMemberCard[];
  supportCards: GameSaveSupportCard[];
  characters: GameSaveCharacter[];
  bandItems: GameSaveBandItem[];
  memory: { musicGroups: GameSaveMusicGroup[]; members: GameSaveMemoryCard[]; supports: GameSaveMemoryCard[] };
  issues?: GameSaveIssue[];
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const I64_MAX = 9223372036854775807n;
/** A `long` field: an integer or its decimal text, read as decimal text. */
function long(value: unknown): Read<string> {
  if (value === undefined || value === null) return null;
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value : null;
  return text !== null && /^(0|-?[1-9][0-9]*)$/.test(text) && BigInt(text) <= I64_MAX && BigInt(text) >= -I64_MAX - 1n ? text : "invalid";
}
/** An `int` field: an integer in the 32-bit range. */
function int(value: unknown): Read<number> {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? value : "invalid";
}
function flag(value: unknown): Read<boolean> {
  if (value === undefined || value === null) return null;
  return typeof value === "boolean" ? value : "invalid";
}

/**
 * Reads the Box's fields from the text of a save's `_player` object. The text must be one JSON object; parsing it
 * here is for display only, and exact values (int64 IDs above 2^53) are taken from the text itself where needed.
 */
export function parseGameSave(text: string): GameSavePlayer {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("A game save is not JSON"); }
  if (!object(value)) throw new Error("A game save is not a JSON object");
  const memory = object(value._memory) ? value._memory : {};
  const issues: GameSaveIssue[] = [];
  if (value._memory !== undefined && value._memory !== null && !object(value._memory)) issues.push({ path: "_player._memory", code: "invalid_value" });
  const memoryEntries = (items: unknown, path: string): Record<string, unknown>[] => {
    if (items === undefined || items === null) return [];
    if (!Array.isArray(items)) { issues.push({ path, code: "invalid_value" }); return []; }
    return items.flatMap((item, index) => {
      if (object(item)) return [item];
      issues.push({ path: `${path}[${index}]`, code: "invalid_value" }); return [];
    });
  };
  const entries = (items: unknown) => list(items).filter(object);
  return {
    memberCards: entries(value._memberCards).map(card => ({ masterId: long(card._masterId), exp: int(card._exp), awakeCount: int(card._awakeCount), rank: int(card._rank),
      liveSkillLevel: int(card._liveSkillLevel), performanceSkillLevel: int(card._performanceSkillLevel) })),
    supportCards: entries(value._supportCards).map(card => ({ masterId: long(card._masterId), exp: int(card._exp), rank: int(card._rank) })),
    characters: entries(value._characters).map(character => ({ masterId: long(character._masterId), exp: int(character._exp) })),
    bandItems: entries(value._bandItems).map(item => ({ masterId: long(item._masterId), level: int(item._level) })),
    memory: {
      musicGroups: memoryEntries(memory._musicGroups, "_player._memory._musicGroups").map((group, index) => ({ id: long(group._id),
        musics: memoryEntries(group._musics, `_player._memory._musicGroups[${index}]._musics`).map(music => ({ id: long(music._id), unlockedScoreRank: int(music._unlockedScoreRank) })) })),
      members: memoryEntries(memory._members, "_player._memory._members").map(card => ({ id: long(card._id), unlocked: flag(card._unlocked) })),
      supports: memoryEntries(memory._supports, "_player._memory._supports").map(card => ({ id: long(card._id), unlocked: flag(card._unlocked) })),
    },
    ...(issues.length ? { issues } : {}),
  };
}

/** Numbers shown before a save is linked. */
export interface GameSaveCounts { members: number; snaps: number }
export function gameSaveCounts(save: GameSavePlayer): GameSaveCounts {
  return { members: save.memberCards.length, snaps: save.supportCards.length };
}

/**
 * The row reached with `exp`: rows taken in experience order (stable), the last whose `exp` does not exceed it.
 * Null when no row is reached.
 */
export function levelByExp(rows: readonly (readonly [number, number])[] | undefined, exp: number): number | null {
  let reached: number | null = null;
  for (const [level, threshold] of [...rows ?? []].sort((a, b) => a[1] - b[1])) {
    if (threshold > exp) break;
    reached = level;
  }
  return reached;
}
/** The cumulative experience a level needs: the first row of that level. */
export function expForLevel(rows: readonly (readonly [number, number])[] | undefined, level: number): number | null {
  return rows?.find(row => row[0] === level)?.[1] ?? null;
}

export type GameSaveIssueCode = "unknown_id" | "duplicate_id" | "invalid_value" | "missing_value" | "no_level_row";
export interface GameSaveIssue { path: string; code: GameSaveIssueCode }
export interface GameSaveSummary {
  members: number; snaps: number; characters: number;
  /** Band items above level 0. */
  builtBandItems: number;
  /** Memory entries listed in the save, and how many of them are unlocked. */
  musicGroups: number; memoryMembers: number; memorySnaps: number; unlockedMembers: number; unlockedSnaps: number;
}
export interface GameSaveDerivation { box: CardBox; summary: GameSaveSummary; issues: GameSaveIssue[] }

/**
 * The Box as the linked save describes it, built in memory. Cards, character ranks, furniture and memory come from
 * the save, read as complete lists: a card the save does not list is not owned, an unlisted character has
 * experience 0, an unlisted band item is not built. VIP, events and other player answers stay the Box's own.
 * Values the save leaves out or gives out of range stay unknown and are reported as issues.
 */
export function deriveGameSaveBox(box: CardBox, link: BoxSaveLink, save: GameSavePlayer, tables: GameSaveTables | null, catalogue: PlayerFieldCatalogue | null): GameSaveDerivation {
  if (tables && tables.server !== box.server) throw new Error("Save tables belong to another server");
  const bound = catalogue && catalogue.server === box.server ? catalogue : null;
  const identity: PlayerCatalogIdentity | null = bound ? { format: bound.format, server: bound.server, masterVersion: bound.masterVersion, sha256: bound.sha256 } : null;
  const issues: GameSaveIssue[] = [...(save.issues ?? [])];
  const issue = (path: string, code: GameSaveIssueCode) => { issues.push({ path, code }); };
  const evidence = <T>(key: string, value: T, catalog?: { fieldKey: string; sourceEvidence: string }): Observation<T> => ({
    id: `game-save:${link.sha256}:${key}`, value, source: "game-save", at: link.uploadedAt,
    ...(catalog && identity ? { catalog: { ...identity, ...catalog } } : {}) });
  const known = <T>(key: string, value: T | null, catalog?: { fieldKey: string; sourceEvidence: string }): BoxField<T> =>
    value === null ? unknownField<T>() : { status: "observed", value, history: [evidence(key, value, catalog)], needsReview: false };
  const catalogField = (key: string) => bound?.fields.find(field => field.key === key);
  const bindTo = (key: string, fieldKey = key) => { const field = catalogField(key); return field ? { fieldKey, sourceEvidence: field.sourceEvidence } : undefined; };
  /** A count that starts at 1, with an optional upper bound. */
  const count = (path: string, value: Read<number>, max?: number): number | null => {
    if (value === null) return null;
    if (value === "invalid" || value < 1 || max !== undefined && value > max) { issue(path, "invalid_value"); return null; }
    return value;
  };
  const experience = (path: string, value: Read<number>): number | null => {
    if (value === null) return null;
    if (value === "invalid" || value < 0) { issue(path, "invalid_value"); return null; }
    return value;
  };
  /** Valid, known and unique identities, in save order. */
  function identities<T>(path: string, items: readonly T[], id: (item: T) => Read<string>, key: string, isKnown: (id: string) => boolean): { item: T; id: string; path: string }[] {
    const seen = new Set<string>();
    return items.flatMap((item, index) => {
      const at = `${path}[${index}]`, value = id(item);
      if (value === null || value === "invalid" || !/^[1-9][0-9]*$/.test(value)) { issue(`${at}.${key}`, "invalid_value"); return []; }
      if (!isKnown(value)) { issue(`${at}.${key}`, "unknown_id"); return []; }
      if (seen.has(value)) { issue(`${at}.${key}`, "duplicate_id"); return []; }
      seen.add(value);
      return [{ item, id: value, path: at }];
    });
  }
  const level = (path: string, rows: readonly (readonly [number, number])[] | undefined, exp: number | null): number | null => {
    if (exp === null || !tables) return null;
    const value = levelByExp(rows, exp);
    if (value === null || value < 1) { issue(`${path}._exp`, "no_level_row"); return null; }
    return value;
  };

  const cards: BoxCard[] = [];
  const card = (kind: BoxCard["kind"], id: string, fields: Partial<Record<CardFieldName, number | null>>): BoxCard => {
    const key = `game-save:${kind}:${id}`;
    return { key, kind, identity: known(`${key}:identity`, id), candidates: [],
      fields: { level: known(`${key}:level`, fields.level ?? null), awake: known(`${key}:awake`, fields.awake ?? null), rank: known(`${key}:rank`, fields.rank ?? null),
        liveSkillLevel: known(`${key}:liveSkillLevel`, fields.liveSkillLevel ?? null), gekisouSkillLevel: known(`${key}:gekisouSkillLevel`, fields.gekisouSkillLevel ?? null) } };
  };
  const isMember = (id: string) => !tables || id in tables.members;
  const isSnap = (id: string) => !tables || id in tables.snaps;
  const members = identities("_player._memberCards", save.memberCards, item => item.masterId, "_masterId", isMember);
  for (const { item, id, path } of members) {
    const exp = experience(`${path}._exp`, item.exp);
    cards.push(card("member", id, { level: level(path, tables?.memberLevels[String(tables.members[id])], exp), awake: count(`${path}._awakeCount`, item.awakeCount, 5),
      rank: count(`${path}._rank`, item.rank, 5), liveSkillLevel: count(`${path}._liveSkillLevel`, item.liveSkillLevel, 5),
      gekisouSkillLevel: count(`${path}._performanceSkillLevel`, item.performanceSkillLevel, 5) }));
  }
  const snaps = identities("_player._supportCards", save.supportCards, item => item.masterId, "_masterId", isSnap);
  for (const { item, id, path } of snaps) {
    const exp = experience(`${path}._exp`, item.exp);
    cards.push(card("snap", id, { level: level(path, tables?.snapLevels[String(tables.snaps[id])], exp), rank: count(`${path}._rank`, item.rank, 5) }));
  }

  const characterRanks: Record<string, BoxField<number>> = {};
  const listedCharacters = identities("_player._characters", save.characters, item => item.masterId, "_masterId", id => !tables || tables.characters.includes(id));
  if (tables) {
    const exps = new Map(listedCharacters.map(({ item, id, path }) => [id, experience(`${path}._exp`, item.exp)] as const));
    for (const id of tables.characters) {
      // An unlisted character has experience 0.
      const exp = exps.has(id) ? exps.get(id)! : 0;
      const rank = exp === null ? null : levelByExp(tables.characterRanks, exp);
      if (exp !== null && rank === null) issue(`_player._characters`, "no_level_row");
      characterRanks[id] = known(`character:${id}`, rank, bindTo(`characterRank.${id}`));
    }
  }

  const bandItems: Record<string, BoxField<number>> = {};
  const bandItemStates: Record<string, BoxField<BandItemState>> = {};
  const listedItems = identities("_player._bandItems", save.bandItems, item => item.masterId, "_masterId", id => !tables || id in tables.bandItems);
  const builtLevels = new Map<string, number | null>();
  for (const { item, id, path } of listedItems) {
    const value = item.level;
    if (value === null) { builtLevels.set(id, null); continue; }
    if (value === "invalid" || value < 0 || value > 0 && tables && !tables.bandItems[id]!.includes(value)) { issue(`${path}._level`, "invalid_value"); builtLevels.set(id, null); continue; }
    builtLevels.set(id, value);
  }
  for (const id of tables ? Object.keys(tables.bandItems) : [...builtLevels.keys()]) {
    // Level 0 and an unlisted item are not built.
    const value = builtLevels.has(id) ? builtLevels.get(id)! : 0;
    const ownership = bindTo(`bandItem.${id}`, `bandItem.${id}.ownership`);
    bandItemStates[id] = known(`bandItem:${id}:ownership`, value === null ? null : value > 0 ? "owned" : "not-owned", ownership);
    bandItems[id] = known(`bandItem:${id}`, value !== null && value > 0 ? value : null, bindTo(`bandItem.${id}`));
  }

  const musicRanks: Record<string, number> = {};
  const groups = identities("_player._memory._musicGroups", save.memory.musicGroups, group => group.id, "_id", id => !tables || tables.memoryMusicGroups.includes(id));
  for (const { item, id: groupId, path } of groups) {
    if (!item.musics.length) issue(`${path}._musics`, "invalid_value");
    for (const { item: music, id } of identities(`${path}._musics`, item.musics, music => music.id, "_id", id => !tables || tables.memoryMusics[id] === groupId)) {
      const rank = music.unlockedScoreRank;
      if (rank === null) { issue(`${path}._musics`, "missing_value"); continue; }
      if (rank === "invalid" || rank < 0 || rank > 7) { issue(`${path}._musics`, "invalid_value"); continue; }
      musicRanks[id] = rank;
    }
  }
  const unlocked = (path: string, items: readonly GameSaveMemoryCard[], isKnown: (id: string) => boolean) => identities(path, items, card => card.id, "_id", isKnown).flatMap(({ item, id, path: at }) => {
    if (item.unlocked === "invalid") issue(`${at}._unlocked`, "invalid_value");
    if (item.unlocked === null) issue(`${at}._unlocked`, "missing_value");
    return item.unlocked === true ? [id] : [];
  });
  const memoryMembers = unlocked("_player._memory._members", save.memory.members, isMember);
  const memorySnaps = unlocked("_player._memory._supports", save.memory.supports, isSnap);
  const memory: BoxMemory = { musicRanks, unlockedMembers: memoryMembers, unlockedSnaps: memorySnaps };
  const memoryValid = !issues.some(issue => issue.path.startsWith("_player._memory"));
  const memoryContext = bound?.profile?.memory;

  const declaredAt = link.uploadedAt;
  const view: CardBox = { ...structuredClone(box), cards,
    coverage: { member: { complete: true, declaredAt }, snap: { complete: true, declaredAt } },
    player: { ...structuredClone(box.player), characterRanks, characterCoverage: "complete", characterTotalRank: unknownField(),
      bandItems, bandItemStates, bandItemsComplete: true, catalogIdentity: identity ?? box.player.catalogIdentity,
      memory: known("memory", memoryValid ? memory : null, memoryContext ? { fieldKey: "memory", sourceEvidence: memoryContext.sourceEvidence } : undefined) } };
  return { box: view, issues, summary: { members: members.length, snaps: snaps.length, characters: listedCharacters.length,
    builtBandItems: [...builtLevels.values()].filter(value => value !== null && value > 0).length,
    musicGroups: groups.length, memoryMembers: save.memory.members.length, memorySnaps: save.memory.supports.length,
    unlockedMembers: memoryMembers.length, unlockedSnaps: memorySnaps.length } };
}

/**
 * A linked Box while its save is not available: no cards and no save-derived player growth. The Box's own facts
 * stay unused, as they do while the save is shown.
 */
export function unavailableGameSaveBox(box: CardBox): CardBox {
  return { ...structuredClone(box), cards: [], coverage: { member: { complete: false, declaredAt: null }, snap: { complete: false, declaredAt: null } },
    player: { ...structuredClone(box.player), characterRanks: {}, characterCoverage: "partial", characterTotalRank: unknownField(),
      bandItems: {}, bandItemStates: {}, bandItemsComplete: false, memory: unknownField() } };
}

/**
 * The Box a page reads: the stored Box, or while a save is linked, the Box `save` describes, with no cards until the
 * save is read. Writes still start from the stored Box.
 */
export function gameSaveBoxView(stored: CardBox | null, save: GameSavePlayer | null, tables: GameSaveTables | null, catalogue: PlayerFieldCatalogue | null): { box: CardBox | null; derivation: GameSaveDerivation | null } {
  if (!stored?.save) return { box: stored, derivation: null };
  const derivation = save ? deriveGameSaveBox(stored, stored.save, save, tables, catalogue) : null;
  return { box: derivation?.box ?? unavailableGameSaveBox(stored), derivation };
}
