import { isGameServer } from "@/config/servers";
import type { LocalizableMasterText } from "@/lib/masterdata/localize-text";
import { answerField, unknownField, type BandItemState, type BoxField, type BoxMemory, type CardBox, type PlayerCatalogIdentity } from "./model";

export type PlayerFieldKind = "band-item" | "band-item-state" | "character-rank" | "character-total-rank" | "vip-rank" | "other";
export interface PlayerCatalogueField {
  key: string;
  kind: PlayerFieldKind;
  id?: string;
  label: LocalizableMasterText;
  /** Legal rows from the matching master table, not an effect-table maximum. */
  levels?: readonly number[];
  options?: readonly { value: number | string; label: LocalizableMasterText }[];
  min?: number;
  max?: number;
  equipmentGroup?: string;
  sourceEvidence: string;
  targets?: { bandIds?: readonly string[]; characterIds?: readonly string[]; attributes?: readonly number[] };
}
export interface PlayerFieldCatalogue extends PlayerCatalogIdentity {
  fields: readonly PlayerCatalogueField[];
  equipmentLimits?: readonly { group: string; maxActive: number }[];
  /** Visual metadata and optional profile progress do not change the power-input identity. */
  profile?: PlayerProfileCatalogue;
}
export interface PlayerProfileCatalogue {
  characters: readonly { id: string; bandId: string; label: LocalizableMasterText; color: string; subColor: string }[];
  bands: readonly { id: string; label: LocalizableMasterText; color: string; subColor: string }[];
  /** Observed profile ratings; never added to deck power a second time. */
  fields: readonly PlayerCatalogueField[];
  memory?: { sourceEvidence: string; musicIds: readonly string[]; hasEffects: boolean };
  events?: { sourceEvidence: string; choices: readonly { id: string; label: LocalizableMasterText; type: number; startAt: string; endAt: string }[] };
  bandItems: readonly { id: string; targetIds: readonly string[]; bandIds: readonly string[]; characterIds: readonly string[]; attributes: readonly number[] }[];
}
export function allPlayerFields(catalogue: PlayerFieldCatalogue): readonly PlayerCatalogueField[] {
  return [...catalogue.fields, ...(catalogue.profile?.fields ?? [])];
}
const numericKind = (kind: PlayerFieldKind) => !["band-item-state", "other"].includes(kind);
const states: readonly BandItemState[] = ["owned", "active", "inactive", "not-owned", "no-bonus"];
export function validatePlayerCatalogue(catalogue: PlayerFieldCatalogue): void {
  if (catalogue.format !== "moenotes.player-fields/1" || !isGameServer(catalogue.server) || !catalogue.masterVersion || !/^[a-f0-9]{64}$/.test(catalogue.sha256) || !Array.isArray(catalogue.fields)) throw new Error("Invalid player field catalogue");
  const keys = new Set<string>();
  for (const field of allPlayerFields(catalogue)) {
    if (!field.key || keys.has(field.key) || !/^[A-Za-z0-9._:-]+$/.test(field.key) || !["band-item", "band-item-state", "character-rank", "character-total-rank", "vip-rank", "other"].includes(field.kind) || !field.sourceEvidence) throw new Error("Invalid player catalogue field");
    keys.add(field.key);
    if (["band-item", "band-item-state", "character-rank"].includes(field.kind) && !/^[1-9][0-9]*$/.test(field.id ?? "")) throw new Error("Missing player field identity");
    if (field.levels && (!field.levels.length || new Set(field.levels).size !== field.levels.length || field.levels.some(value => !Number.isSafeInteger(value) || value < 0))) throw new Error("Invalid legal levels");
    if (field.options && (!field.options.length || new Set(field.options.map(option => option.value)).size !== field.options.length || field.options.some(option => typeof option.value !== "string" && (!Number.isSafeInteger(option.value) || option.value < 0)))) throw new Error("Invalid player field options");
    if (!field.levels && !field.options && (!Number.isSafeInteger(field.min) || !Number.isSafeInteger(field.max) || field.min! < 0 || field.max! < field.min!)) throw new Error("Player field has no legal value contract");
    if (field.kind === "band-item-state" && (!field.options || field.options.some(option => !states.includes(option.value as BandItemState)))) throw new Error("Invalid band item states");
    if (numericKind(field.kind) && field.options?.some(option => typeof option.value !== "number")) throw new Error("Numeric player field has text values");
  }
  for (const limit of catalogue.equipmentLimits ?? []) if (!limit.group || !Number.isSafeInteger(limit.maxActive) || limit.maxActive < 0) throw new Error("Invalid equipment limit");
}
export function playerField(box: CardBox, field: PlayerCatalogueField): BoxField<number | string> {
  switch (field.kind) {
    case "band-item": return box.player.bandItems[field.id!] ?? unknownField();
    case "band-item-state": return box.player.bandItemStates[field.id!] ?? unknownField();
    case "character-rank": return box.player.characterRanks[field.id!] ?? unknownField();
    case "character-total-rank": return box.player.characterTotalRank;
    case "vip-rank": return box.player.vipRank;
    case "other": return box.player.catalogFields[field.key] ?? unknownField();
  }
}
export function isLegalPlayerValue(field: PlayerCatalogueField, value: number | string): boolean {
  if (field.options) return field.options.some(option => option.value === value);
  if (field.levels) return typeof value === "number" && field.levels.includes(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= field.min! && value <= field.max!;
}

/** Every submitted fact binds its field and evidence to one catalogue; unknown is never zero. */
export function answerPlayerField(box: CardBox, catalogue: PlayerFieldCatalogue, key: string, value: number | string | null, at = Date.now()): CardBox {
  validatePlayerCatalogue(catalogue);
  if (box.server !== catalogue.server) throw new Error("Player catalogue belongs to another server");
  const field = allPlayerFields(catalogue).find(entry => entry.key === key);
  if (!field || value !== null && !isLegalPlayerValue(field, value)) throw new Error("Illegal player field value");
  if (field.kind === "band-item-state" && value === "active" && field.equipmentGroup) {
    const limit = catalogue.equipmentLimits?.find(entry => entry.group === field.equipmentGroup);
    const active = catalogue.fields.filter(entry => entry.kind === "band-item-state" && entry.equipmentGroup === field.equipmentGroup && entry.key !== key && playerField(box, entry).value === "active").length;
    if (limit && active >= limit.maxActive) throw new Error("Equipment limit exceeded");
  }
  const { format, server, masterVersion, sha256 } = catalogue;
  const identity: PlayerCatalogIdentity = { format, server, masterVersion, sha256 };
  const answer = answerField(playerField(box, field), { id: crypto.randomUUID(), value, source: "manual", at,
    catalog: { ...identity, fieldKey: key, sourceEvidence: field.sourceEvidence } });
  const next = structuredClone(box);
  next.player.catalogIdentity = identity;
  switch (field.kind) {
    case "band-item": next.player.bandItems[field.id!] = answer as BoxField<number>; break;
    case "band-item-state": next.player.bandItemStates[field.id!] = answer as BoxField<BandItemState>; break;
    case "character-rank": next.player.characterRanks[field.id!] = answer as BoxField<number>; break;
    case "character-total-rank": next.player.characterTotalRank = answer as BoxField<number>; break;
    case "vip-rank": next.player.vipRank = answer as BoxField<number>; break;
    case "other": next.player.catalogFields[key] = answer; break;
  }
  return next;
}

/** Shared evaluators can require version-bound facts without inventing missing player bonuses. */
export function playerCatalogueIssues(box: CardBox, catalogue: PlayerFieldCatalogue): { key: string; reason: "unknown" | "conflict" | "illegal" | "version" }[] {
  validatePlayerCatalogue(catalogue);
  if (box.server !== catalogue.server) throw new Error("Player catalogue belongs to another server");
  return catalogue.fields.flatMap<{ key: string; reason: "unknown" | "conflict" | "illegal" | "version" }>(entry => {
    const field = playerField(box, entry);
    if (entry.kind === "band-item" && box.player.bandItemStates[entry.id!]?.value === "not-owned") {
      const presence = box.player.bandItemStates[entry.id!]!;
      return presence.history.some(item => item.value === "not-owned" && item.catalog?.sha256 === catalogue.sha256 && item.catalog.fieldKey === `${entry.key}.ownership`) ? [] : [{ key: entry.key, reason: "version" }];
    }
    if (field.status === "conflict") return [{ key: entry.key, reason: "conflict" as const }];
    if (field.value === null) return [{ key: entry.key, reason: "unknown" as const }];
    if (!isLegalPlayerValue(entry, field.value)) return [{ key: entry.key, reason: "illegal" as const }];
    if (!field.history.some(item => item.value === field.value && item.catalog?.sha256 === catalogue.sha256 && item.catalog.fieldKey === entry.key && item.catalog.masterVersion === catalogue.masterVersion)) return [{ key: entry.key, reason: "version" as const }];
    return [];
  });
}

/** JP ownership is distinct from an equipment switch. Legal level means held; absent has no level. */
export function answerFurnitureLevel(box: CardBox, catalogue: PlayerFieldCatalogue, key: string, value: number | "not-owned" | null, at = Date.now()): CardBox {
  const entry = catalogue.fields.find(field => field.key === key && field.kind === "band-item");
  if (!entry) throw new Error("Missing furniture field");
  const next = answerPlayerField(box, catalogue, key, typeof value === "number" ? value : null, at);
  // Clearing an already-owned item's level does not revoke its independent ownership fact.
  if (value === null && box.player.bandItemStates[entry.id!]?.value === "owned") return next;
  const state = value === null ? null : value === "not-owned" ? "not-owned" : "owned";
  next.player.bandItemStates[entry.id!] = answerField(box.player.bandItemStates[entry.id!] ?? unknownField<BandItemState>(), { id: crypto.randomUUID(), value: state, source: "manual", at,
    catalog: { ...next.player.catalogIdentity!, fieldKey: `${entry.key}.ownership`, sourceEvidence: entry.sourceEvidence } });
  return next;
}

/** A player may know that an item is held while its level remains unknown. */
export function answerFurnitureOwnership(box: CardBox, catalogue: PlayerFieldCatalogue, key: string, value: "owned" | "not-owned" | null, at = Date.now()): CardBox {
  const entry = catalogue.fields.find(field => field.key === key && field.kind === "band-item");
  if (!entry || !["owned", "not-owned", null].includes(value)) throw new Error("Invalid furniture ownership");
  if (value === "not-owned") return answerFurnitureLevel(box, catalogue, key, value, at);
  validatePlayerCatalogue(catalogue);
  if (catalogue.server !== box.server) throw new Error("Player catalogue belongs to another server");
  const next = structuredClone(box);
  const { format, server, masterVersion, sha256 } = catalogue;
  next.player.catalogIdentity = { format, server, masterVersion, sha256 };
  next.player.bandItemStates[entry.id!] = answerField(box.player.bandItemStates[entry.id!] ?? unknownField<BandItemState>(), {
    id: crypto.randomUUID(), value, source: "manual", at,
    catalog: { format, server, masterVersion, sha256, fieldKey: `${entry.key}.ownership`, sourceEvidence: entry.sourceEvidence },
  });
  return next;
}

function contextAnswer<T>(box: CardBox, catalogue: PlayerFieldCatalogue, field: BoxField<T>, key: string, sourceEvidence: string, value: T | null, at: number): BoxField<T> {
  validatePlayerCatalogue(catalogue);
  if (catalogue.server !== box.server) throw new Error("Player catalogue belongs to another server");
  const { format, server, masterVersion, sha256 } = catalogue;
  return answerField(field, { id: crypto.randomUUID(), value, source: "manual", at, catalog: { format, server, masterVersion, sha256, fieldKey: key, sourceEvidence } });
}

export function answerPlayerMemory(box: CardBox, catalogue: PlayerFieldCatalogue, value: BoxMemory | null, at = Date.now()): CardBox {
  const context = catalogue.profile?.memory;
  if (!context) throw new Error("Missing matching memory catalogue");
  if (value) {
    if (Object.keys(value.musicRanks).some(id => !context.musicIds.includes(id)) || Object.values(value.musicRanks).some(rank => !Number.isSafeInteger(rank) || rank < 0)) throw new Error("Invalid memory progress");
    if (!context.hasEffects && (Object.keys(value.musicRanks).length || value.unlockedMembers.length || value.unlockedSnaps.length)) throw new Error("Memory tables have no progress domain");
    const owned = (kind: "member" | "snap") => new Set(box.cards.filter(card => card.kind === kind).flatMap(card => card.identity.value ? [card.identity.value] : []));
    if (value.unlockedMembers.some(id => !owned("member").has(id)) || value.unlockedSnaps.some(id => !owned("snap").has(id))) throw new Error("Memory unlock is outside owned cards");
  }
  const next = structuredClone(box);
  next.player.memory = contextAnswer(box, catalogue, box.player.memory, "memory", context.sourceEvidence, value, at);
  const { format, server, masterVersion, sha256 } = catalogue; next.player.catalogIdentity = { format, server, masterVersion, sha256 };
  return next;
}

export function answerPlayerEvents(box: CardBox, catalogue: PlayerFieldCatalogue, value: readonly string[] | null, at = Date.now()): CardBox {
  const context = catalogue.profile?.events;
  if (!context) throw new Error("Missing matching event catalogue");
  if (value && (new Set(value).size !== value.length || value.some(id => !context.choices.some(choice => choice.id === id)))) throw new Error("Event is outside matching catalogue");
  const next = structuredClone(box);
  next.player.eventIds = contextAnswer(box, catalogue, box.player.eventIds, "eventIds", context.sourceEvidence, value ? [...value] : null, at);
  const { format, server, masterVersion, sha256 } = catalogue; next.player.catalogIdentity = { format, server, masterVersion, sha256 };
  return next;
}

function boundContext<T>(box: CardBox, catalogue: PlayerFieldCatalogue, field: BoxField<T>, key: string, sourceEvidence: string | undefined): T | null {
  if (box.server !== catalogue.server || field.status === "conflict" || field.value === null || !sourceEvidence) return null;
  return field.history.some(item => JSON.stringify(item.value) === JSON.stringify(field.value) && item.catalog?.server === catalogue.server && item.catalog.masterVersion === catalogue.masterVersion
    && item.catalog.sha256 === catalogue.sha256 && item.catalog.fieldKey === key && item.catalog.sourceEvidence === sourceEvidence) ? field.value : null;
}
export function exportPlayerContexts(box: CardBox, catalogue: PlayerFieldCatalogue): { memory: BoxMemory | null; eventIds: string[] | null } {
  validatePlayerCatalogue(catalogue);
  if (box.server !== catalogue.server) throw new Error("Player catalogue belongs to another server");
  return { memory: boundContext(box, catalogue, box.player.memory, "memory", catalogue.profile?.memory?.sourceEvidence), eventIds: boundContext(box, catalogue, box.player.eventIds, "eventIds", catalogue.profile?.events?.sourceEvidence) };
}

export interface BandItemFacts { coverage: "partial" | "complete"; values: { id: string; owned: boolean | null; level: number | null }[] }
/** Core adapter: explicit absence has no level; every unknown remains nullable. */
export function exportBandItemFacts(box: CardBox, catalogue: PlayerFieldCatalogue): BandItemFacts {
  validatePlayerCatalogue(catalogue);
  if (catalogue.server !== box.server) throw new Error("Player catalogue belongs to another server");
  const values = catalogue.fields.filter(field => field.kind === "band-item").map(entry => {
    const presence = box.player.bandItemStates[entry.id!] ?? unknownField<BandItemState>();
    const level = playerField(box, entry);
    const bound = presence.history.some(item => item.value === presence.value && item.catalog?.sha256 === catalogue.sha256 && item.catalog.masterVersion === catalogue.masterVersion && item.catalog.fieldKey === `${entry.key}.ownership`);
    if (bound && presence.value === "not-owned") return { id: entry.id!, owned: false, level: null };
    const levelBound = level.history.some(item => item.value === level.value && item.catalog?.sha256 === catalogue.sha256 && item.catalog.masterVersion === catalogue.masterVersion && item.catalog.fieldKey === entry.key);
    if (bound && presence.value === "owned") return { id: entry.id!, owned: true, level: levelBound && typeof level.value === "number" && isLegalPlayerValue(entry, level.value) ? level.value : null };
    return { id: entry.id!, owned: null, level: null };
  });
  return { coverage: box.player.bandItemsComplete ? "complete" : "partial", values };
}

/** Rust serde expects unquoted i64 tokens. Keep this exact UTF-8 text through the Worker boundary. */
export function serializeBandItemFacts(facts: BandItemFacts): string {
  if (!["partial", "complete"].includes(facts.coverage) || !Array.isArray(facts.values)) throw new Error("Invalid furniture coverage");
  const ids = new Set<string>();
  const rows = facts.values.map(value => {
    if (typeof value.id !== "string" || !/^[1-9][0-9]*$/.test(value.id) || BigInt(value.id) > 9223372036854775807n || ids.has(value.id)) throw new Error("Invalid furniture i64 identity");
    ids.add(value.id);
    if (![true, false, null].includes(value.owned) || value.level !== null && (!Number.isSafeInteger(value.level) || value.level < 1) || value.owned !== true && value.level !== null) throw new Error("Invalid furniture fact");
    return `{"id":${value.id},"owned":${JSON.stringify(value.owned)},"level":${JSON.stringify(value.level)}}`;
  });
  return `{"coverage":${JSON.stringify(facts.coverage)},"values":[${rows.join(",")}]}`;
}

export interface CharacterRankFacts { coverage: "partial" | "complete"; values: { id: string; value: number }[] }
export interface PlayerRankFacts { characterRanks: CharacterRankFacts; characterTotalRank: number | null; vipRank: number | null }
function boundNumericValue(box: CardBox, catalogue: PlayerFieldCatalogue, entry: PlayerCatalogueField): number | null {
  const field = playerField(box, entry);
  if (field.status === "conflict" || typeof field.value !== "number" || field.value < 1 || !isLegalPlayerValue(entry, field.value)) return null;
  return field.history.some(item => item.value === field.value && item.catalog?.sha256 === catalogue.sha256
    && item.catalog.masterVersion === catalogue.masterVersion && item.catalog.fieldKey === entry.key) ? field.value : null;
}

/** Missing ranks are omitted, never converted to Lv1 or a derived manual observation. */
export function exportPlayerRankFacts(box: CardBox, catalogue: PlayerFieldCatalogue): PlayerRankFacts {
  validatePlayerCatalogue(catalogue);
  if (catalogue.server !== box.server) throw new Error("Player catalogue belongs to another server");
  const entries = catalogue.fields.filter(field => field.kind === "character-rank");
  const values = entries.flatMap(entry => {
    const value = boundNumericValue(box, catalogue, entry);
    return value === null ? [] : [{ id: entry.id!, value }];
  });
  const total = catalogue.fields.find(field => field.kind === "character-total-rank");
  const vip = catalogue.fields.find(field => field.kind === "vip-rank");
  return { characterRanks: { coverage: box.player.characterCoverage === "complete" && entries.length > 0 && values.length === entries.length ? "complete" : "partial", values },
    characterTotalRank: total ? boundNumericValue(box, catalogue, total) : null,
    vipRank: vip ? boundNumericValue(box, catalogue, vip) : null };
}

/** Exact i64 character tokens; catalog metadata belongs to the Box, not the strict core payload. */
export function serializePlayerRankFacts(facts: PlayerRankFacts): string {
  const { characterRanks, characterTotalRank, vipRank } = facts;
  if (!["partial", "complete"].includes(characterRanks.coverage) || !Array.isArray(characterRanks.values)) throw new Error("Invalid character rank coverage");
  const ids = new Set<string>();
  const rows = characterRanks.values.map(row => {
    if (typeof row.id !== "string" || !/^[1-9][0-9]*$/.test(row.id) || BigInt(row.id) > 9223372036854775807n || ids.has(row.id)) throw new Error("Invalid character i64 identity");
    ids.add(row.id);
    if (!Number.isSafeInteger(row.value) || row.value < 1) throw new Error("Invalid character rank value");
    return `{"id":${row.id},"value":${row.value}}`;
  });
  for (const value of [characterTotalRank, vipRank]) if (value !== null && (!Number.isSafeInteger(value) || value < 1)) throw new Error("Invalid player rank value");
  return `{"characterRanks":{"coverage":${JSON.stringify(characterRanks.coverage)},"values":[${rows.join(",")}]},"characterTotalRank":${JSON.stringify(characterTotalRank)},"vipRank":${JSON.stringify(vipRank)}}`;
}

/** Player fragment for score and Snap Worker requests. */
export function serializePlayerBonusFacts(box: CardBox, catalogue: PlayerFieldCatalogue): string {
  const ranks = serializePlayerRankFacts(exportPlayerRankFacts(box, catalogue));
  const context = exportPlayerContexts(box, catalogue);
  const token = (id: string): string => { if (!/^[1-9][0-9]*$/.test(id) || BigInt(id) > 9223372036854775807n) throw new Error("Invalid context i64 identity"); return id; };
  const ids = (values: readonly string[]): string => `[${values.map(token).join(",")}]`;
  const memory = context.memory ? `{"musicRanks":[${Object.entries(context.memory.musicRanks).map(([id,value]) => `{"id":${token(id)},"value":${value}}`).join(",")}],"unlockedMembers":${ids(context.memory.unlockedMembers)},"unlockedSnaps":${ids(context.memory.unlockedSnaps)}}` : "null";
  return `{"bandItemFacts":${serializeBandItemFacts(exportBandItemFacts(box, catalogue))},${ranks.slice(1, -1)},"memory":${memory},"eventIds":${context.eventIds ? ids(context.eventIds) : "null"}}`;
}
