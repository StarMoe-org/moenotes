import { isGameServer, type GameServer } from "@/config/servers";
import { gameSaveServer, type GameSaveServer } from "@/config/account";

export const BOX_FORMAT = "moenotes.card-box/1" as const;
export type CardKind = "member" | "snap";
export type FieldStatus = "unknown" | "observed" | "manual" | "conflict";
/** `game-save` evidence is derived in memory from a linked save and never stored in a Box. */
export type FieldSource = "screenshot" | "manual" | "deck-answer" | "game-save";
export type CardFieldName = "level" | "awake" | "rank" | "liveSkillLevel" | "gekisouSkillLevel";
export const CARD_FIELDS: readonly CardFieldName[] = ["level", "awake", "rank", "liveSkillLevel", "gekisouSkillLevel"];
export interface PlayerCatalogIdentity { format: "moenotes.player-fields/1"; server: GameServer; masterVersion: string; sha256: string }
export type BandItemState = "owned" | "active" | "inactive" | "not-owned" | "no-bonus";

export interface Observation<T> {
  id: string;
  value: T | null;
  source: FieldSource;
  at: number;
  screenshot?: { sourceId: string; bbox: [number, number, number, number]; confidence?: number; regionAssignment?: "player-selected";
    recognition?: { galleryId: string; manifestSha256: string; uiMasterSourceId: string; method: "siftFlannWasm" | "boxLensEncoderOrtWasm" };
    parameterRecognition?: { method: "boxLensNumberReaderOrtWasm" | "boxLensClassifierOrtWasm"; modelSha256: string; runtimeId: string } };
  catalog?: PlayerCatalogIdentity & { fieldKey: string; sourceEvidence: string };
}
export interface BoxField<T> {
  status: FieldStatus;
  value: T | null;
  history: Observation<T>[];
  /** A later screenshot disagrees with a manual value; the manual value stays authoritative. */
  needsReview: boolean;
}
export interface BoxCard {
  key: string;
  kind: CardKind;
  identity: BoxField<string>;
  candidates: string[];
  fields: Record<CardFieldName, BoxField<number>>;
}
export interface BoxMemory {
  musicRanks: Record<string, number>;
  unlockedMembers: string[];
  unlockedSnaps: string[];
}
export interface BoxPlayer {
  characterRanks: Record<string, BoxField<number>>;
  characterCoverage: "partial" | "complete";
  characterTotalRank: BoxField<number>;
  vipRank: BoxField<number>;
  bandItems: Record<string, BoxField<number>>;
  bandItemStates: Record<string, BoxField<BandItemState>>;
  catalogFields: Record<string, BoxField<number | string>>;
  catalogIdentity: PlayerCatalogIdentity | null;
  bandItemsComplete: boolean;
  memory: BoxField<BoxMemory>;
  eventIds: BoxField<string[]>;
}
/** The uploaded game save a Box reads its cards and player growth from. */
export interface BoxSaveLink {
  server: GameSaveServer;
  /** The player ID shown in game, as decimal text; it names the save in the account. */
  accountId: string;
  /** SHA-256 of the save bytes this Box reads. */
  sha256: string;
  /** Unix milliseconds. */
  uploadedAt: number;
}
export interface CardBox {
  format: typeof BOX_FORMAT;
  id: string;
  server: GameServer;
  revision: number;
  updatedAt: number;
  coverage: Record<CardKind, { complete: boolean; declaredAt: number | null }>;
  cards: BoxCard[];
  player: BoxPlayer;
  baseline: { members: string[]; snaps: (string | null)[] } | null;
  /** While linked, cards and player growth come from this save; the Box's own facts stay stored but unused. */
  save: BoxSaveLink | null;
}

export const unknownField = <T>(): BoxField<T> => ({ status: "unknown", value: null, history: [], needsReview: false });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
const latestTime = <T>(field: BoxField<T>): number => field.history.reduce((latest, item) => Math.max(latest, item.at), -1);
const containsHistory = <T>(a: BoxField<T>, b: BoxField<T>): boolean => b.history.every(item => a.history.some(other => other.id === item.id));
const hasClear = <T>(field: BoxField<T>): boolean => field.status === "unknown" && field.history.some(item => item.source !== "screenshot" && item.value === null);

function combineHistory<T>(a: Observation<T>[], b: Observation<T>[]): Observation<T>[] {
  const entries = new Map<string, Observation<T>>();
  for (const observation of [...a, ...b]) {
    const previous = entries.get(observation.id);
    if (previous && !same(previous, observation)) throw new Error("Observation identity collision");
    entries.set(observation.id, structuredClone(observation));
  }
  return [...entries.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id));
}

/** Account/local merge: conflicting manual answers always need an explicit decision. */
export function mergeField<T>(a: BoxField<T>, b: BoxField<T>): BoxField<T> {
  const history = combineHistory(a.history, b.history);
  const screenshotExtension = (newer: BoxField<T>, older: BoxField<T>): boolean => older.status === "manual" && newer.history.length > older.history.length && containsHistory(newer, older)
    && newer.history.filter(item => !older.history.some(previous => previous.id === item.id)).every(item => item.source === "screenshot");
  // Retaining old evidence in an imported observation does not authorize a screenshot to demote manual truth.
  if (screenshotExtension(a, b) || screenshotExtension(b, a)) {
    const manual = screenshotExtension(a, b) ? b : a;
    return { ...structuredClone(manual), history, needsReview: manual.needsReview || history.some(item => item.source === "screenshot" && item.value !== null && !same(item.value, manual.value)) };
  }
  // A resolved/cleared descendant must not become a conflict with its own older snapshot.
  // Independent manual branches still reach the explicit-conflict case below.
  if (a.history.length > b.history.length && containsHistory(a, b)) return { ...structuredClone(a), history };
  if (b.history.length > a.history.length && containsHistory(b, a)) return { ...structuredClone(b), history };
  if (hasClear(a) || hasClear(b)) {
    if (a.status === "manual" || b.status === "manual" || a.status === "conflict" || b.status === "conflict") {
      return { status: "conflict", value: null, history, needsReview: true };
    }
    const clear = hasClear(a) && (!hasClear(b) || latestTime(a) >= latestTime(b)) ? a : b;
    const other = clear === a ? b : a;
    return { ...structuredClone(other.status === "observed" && latestTime(other) > latestTime(clear) ? other : clear), history };
  }
  if (a.status === "unknown") return { ...structuredClone(b), history };
  if (b.status === "unknown") return { ...structuredClone(a), history };
  if (same(a.value, b.value) && a.status !== "conflict" && b.status !== "conflict") {
    return { status: a.status === "manual" || b.status === "manual" ? "manual" : "observed", value: structuredClone(a.value), history, needsReview: a.needsReview || b.needsReview };
  }
  if (a.status === "manual" && b.status === "observed") return { ...structuredClone(a), history, needsReview: true };
  if (b.status === "manual" && a.status === "observed") return { ...structuredClone(b), history, needsReview: true };
  if (a.status === "observed" && b.status === "observed" && latestTime(a) !== latestTime(b)) {
    return { ...structuredClone(latestTime(a) > latestTime(b) ? a : b), history };
  }
  return { status: "conflict", value: null, history, needsReview: true };
}

export function observeField<T>(field: BoxField<T>, observation: Observation<T>): BoxField<T> {
  if (observation.source !== "screenshot" || observation.value === null) throw new Error("Expected a known screenshot observation");
  return mergeField(field, { status: "observed", value: observation.value, history: [observation], needsReview: false });
}

/** This explicit answer resolves conflicts; clearing stays unknown instead of reviving old observations. */
export function answerField<T>(field: BoxField<T>, observation: Observation<T>): BoxField<T> {
  if (observation.source === "screenshot") throw new Error("Expected a manual answer");
  return { status: observation.value === null ? "unknown" : "manual", value: structuredClone(observation.value),
    history: combineHistory(field.history, [observation]), needsReview: false };
}

export function createCard(kind: CardKind, key: string, masterId: string | null = null, at = Date.now()): BoxCard {
  return { key, kind, identity: masterId === null ? unknownField() : answerField(unknownField<string>(), { id: `${key}:identity:${at}`, value: masterId, source: "manual", at }),
    candidates: [], fields: Object.fromEntries(CARD_FIELDS.map(name => [name, unknownField<number>()])) as BoxCard["fields"] };
}

export function createBox(server: GameServer, id: string, at = Date.now()): CardBox {
  return { format: BOX_FORMAT, id, server, revision: 0, updatedAt: at,
    coverage: { member: { complete: false, declaredAt: null }, snap: { complete: false, declaredAt: null } }, cards: [], baseline: null, save: null,
    player: { characterRanks: {}, characterCoverage: "partial", characterTotalRank: unknownField(), vipRank: unknownField(),
      bandItems: {}, bandItemStates: {}, catalogFields: {}, catalogIdentity: null, bandItemsComplete: false, memory: unknownField(), eventIds: unknownField() } };
}

function mergeRecord<T>(a: Record<string, BoxField<T>>, b: Record<string, BoxField<T>>): Record<string, BoxField<T>> {
  return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(key => [key, mergeField(a[key] ?? unknownField(), b[key] ?? unknownField())]));
}
const cardIdentity = (card: BoxCard) => card.identity.value !== null ? `${card.kind}:${card.identity.value}` : `unknown:${card.key}`;

/** Pure merge: importing another region never silently changes the selected account or box. */
export function mergeBoxes(current: CardBox, incoming: CardBox, at = Date.now()): CardBox {
  if (current.server !== incoming.server) throw new Error("Card boxes belong to different servers");
  const result = structuredClone(current);
  const cards = new Map(result.cards.map(card => [cardIdentity(card), card]));
  const byKey = new Map(result.cards.map(card => [card.key, card]));
  for (const card of incoming.cards) {
    const key = cardIdentity(card), existing = byKey.get(card.key) ?? cards.get(key);
    if (!existing) { const copy = structuredClone(card); cards.set(key, copy); byKey.set(copy.key, copy); continue; }
    if (existing.kind !== card.kind) throw new Error("Conflicting card kinds need explicit correction");
    const previousIdentity = cardIdentity(existing);
    const identityCandidates = [existing.identity.value, card.identity.value].filter((id): id is string => id !== null);
    existing.identity = mergeField(existing.identity, card.identity);
    existing.candidates = [...new Set([...existing.candidates, ...card.candidates, ...identityCandidates])];
    for (const field of CARD_FIELDS) existing.fields[field] = mergeField(existing.fields[field], card.fields[field]);
    const nextIdentity = cardIdentity(existing);
    if (cards.has(nextIdentity) && cards.get(nextIdentity) !== existing) throw new Error("Identity correction collides with another card");
    cards.delete(previousIdentity);
    cards.set(nextIdentity, existing);
  }
  result.cards = [...cards.values()];
  for (const kind of ["member", "snap"] as const) {
    const a = current.coverage[kind], b = incoming.coverage[kind];
    if (b.declaredAt !== null && (a.declaredAt === null || b.declaredAt > a.declaredAt)) result.coverage[kind] = structuredClone(b);
    else if (a.declaredAt === b.declaredAt && a.complete !== b.complete) result.coverage[kind].complete = false;
  }
  result.player = { characterRanks: mergeRecord(current.player.characterRanks, incoming.player.characterRanks),
    characterCoverage: current.player.characterCoverage === "complete" || incoming.player.characterCoverage === "complete" ? "complete" : "partial",
    characterTotalRank: mergeField(current.player.characterTotalRank, incoming.player.characterTotalRank), vipRank: mergeField(current.player.vipRank, incoming.player.vipRank),
    bandItems: mergeRecord(current.player.bandItems, incoming.player.bandItems), bandItemsComplete: current.player.bandItemsComplete && incoming.player.bandItemsComplete,
    bandItemStates: mergeRecord(current.player.bandItemStates, incoming.player.bandItemStates), catalogFields: mergeRecord(current.player.catalogFields, incoming.player.catalogFields),
    catalogIdentity: current.player.catalogIdentity ?? incoming.player.catalogIdentity,
    memory: mergeField(current.player.memory, incoming.player.memory), eventIds: mergeField(current.player.eventIds, incoming.player.eventIds) };
  result.updatedAt = at;
  // Storage assigns the next revision atomically; the pure draft keeps its base revision.
  result.revision = current.revision;
  return result;
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error("Unknown card box field");
}
function checkField(value: unknown, accepts: (item: unknown) => boolean): void {
  if (!record(value) || !["unknown", "observed", "manual", "conflict"].includes(String(value.status)) || !Array.isArray(value.history) || typeof value.needsReview !== "boolean") throw new Error("Invalid card field");
  onlyKeys(value, ["status", "value", "history", "needsReview"]);
  if (["unknown", "conflict"].includes(String(value.status)) ? value.value !== null : !accepts(value.value)) throw new Error("Invalid field value");
  const ids = new Set<string>();
  for (const item of value.history) {
    if (!record(item) || typeof item.id !== "string" || !item.id || ids.has(item.id) || !["screenshot", "manual", "deck-answer"].includes(String(item.source)) || !Number.isSafeInteger(item.at) || Number(item.at) < 0 || (item.value !== null && !accepts(item.value))) throw new Error("Invalid field evidence");
    onlyKeys(item, ["id", "value", "source", "at", "screenshot", "catalog"]);
    ids.add(item.id);
    if (item.screenshot !== undefined && (!record(item.screenshot) || typeof item.screenshot.sourceId !== "string" || !Array.isArray(item.screenshot.bbox) || item.screenshot.bbox.length !== 4 || !item.screenshot.bbox.every(n => typeof n === "number" && Number.isFinite(n)))) throw new Error("Invalid screenshot reference");
    if (record(item.screenshot)) {
      onlyKeys(item.screenshot, ["sourceId", "bbox", "confidence", "regionAssignment", "recognition", "parameterRecognition"]);
      if (item.screenshot.confidence !== undefined && (typeof item.screenshot.confidence !== "number" || !Number.isFinite(item.screenshot.confidence) || item.screenshot.confidence < 0 || item.screenshot.confidence > 1)) throw new Error("Invalid screenshot confidence");
      if (item.screenshot.regionAssignment !== undefined && item.screenshot.regionAssignment !== "player-selected") throw new Error("Invalid screenshot region assignment");
      const recognition = item.screenshot.recognition;
      if (recognition !== undefined) {
        if (!record(recognition) || !/^[a-f0-9]{64}$/.test(String(recognition.galleryId)) || !/^[a-f0-9]{64}$/.test(String(recognition.manifestSha256))
          || typeof recognition.uiMasterSourceId !== "string" || !recognition.uiMasterSourceId || !["siftFlannWasm", "boxLensEncoderOrtWasm"].includes(String(recognition.method))) throw new Error("Invalid recognition source");
        onlyKeys(recognition, ["galleryId", "manifestSha256", "uiMasterSourceId", "method"]);
      }
      const parameters = item.screenshot.parameterRecognition;
      if (parameters !== undefined) {
        if (!record(parameters) || !["boxLensNumberReaderOrtWasm", "boxLensClassifierOrtWasm"].includes(String(parameters.method)) || !/^[a-f0-9]{64}$/.test(String(parameters.modelSha256))
          || typeof parameters.runtimeId !== "string" || !parameters.runtimeId) throw new Error("Invalid parameter recognition source");
        onlyKeys(parameters, ["method", "modelSha256", "runtimeId"]);
      }
    }
    if (item.catalog !== undefined) {
      if (!record(item.catalog) || typeof item.catalog.fieldKey !== "string" || !item.catalog.fieldKey || typeof item.catalog.sourceEvidence !== "string" || !item.catalog.sourceEvidence) throw new Error("Invalid player field source");
      checkCatalogIdentity(item.catalog, ["fieldKey", "sourceEvidence"]);
    }
  }
  if (["manual", "observed"].includes(String(value.status)) && !value.history.some(item => record(item) && same(item.value, value.value) && (value.status === "observed" ? item.source === "screenshot" : item.source !== "screenshot"))) throw new Error("Known field is missing its source evidence");
}
const idValue = (value: unknown) => typeof value === "string" && /^[1-9][0-9]*$/.test(value);
const i64Value = (value: unknown) => idValue(value) && BigInt(value as string) <= 9223372036854775807n;
function checkSaveLink(value: unknown, server: GameServer): void {
  if (!record(value) || value.server !== gameSaveServer(server) || !i64Value(value.accountId)
    || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || !numberValue(value.uploadedAt)) throw new Error("Invalid game save link");
  onlyKeys(value, ["server", "accountId", "sha256", "uploadedAt"]);
}
const numberValue = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function checkCatalogIdentity(value: unknown, extra: string[] = []): void {
  if (!record(value) || value.format !== "moenotes.player-fields/1" || !isGameServer(value.server) || typeof value.masterVersion !== "string" || !value.masterVersion || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error("Invalid player field catalog identity");
  onlyKeys(value, ["format", "server", "masterVersion", "sha256", ...extra]);
}

/** Imported files contain observations, never raw images or credentials. IDs remain decimal strings. */
export function parseBox(text: string): CardBox {
  if (text.length > 20_000_000) throw new Error("Card box import is too large");
  const value: unknown = JSON.parse(text);
  if (!record(value) || value.format !== BOX_FORMAT || !isGameServer(value.server) || typeof value.id !== "string" || !value.id || !numberValue(value.revision) || !numberValue(value.updatedAt) || !Array.isArray(value.cards) || value.cards.length > 10000 || !record(value.coverage) || !record(value.player)) throw new Error("Invalid card box");
  onlyKeys(value, ["format", "id", "server", "revision", "updatedAt", "coverage", "cards", "player", "baseline", "save"]);
  // A Box without a save field reads as unlinked.
  if (!("save" in value)) value.save = null;
  if (value.save !== null) checkSaveLink(value.save, value.server);
  onlyKeys(value.coverage, ["member", "snap"]);
  for (const kind of ["member", "snap"]) {
    const coverage = value.coverage[kind];
    if (!record(coverage) || typeof coverage.complete !== "boolean" || (coverage.declaredAt !== null && !numberValue(coverage.declaredAt))) throw new Error("Invalid completeness declaration");
    if (coverage.complete && coverage.declaredAt === null) throw new Error("Complete coverage needs an explicit declaration");
    onlyKeys(coverage, ["complete", "declaredAt"]);
  }
  const keys = new Set<string>(), identities = new Set<string>();
  for (const card of value.cards) {
    if (!record(card) || !["member", "snap"].includes(String(card.kind)) || typeof card.key !== "string" || !card.key || keys.has(card.key) || !Array.isArray(card.candidates) || !card.candidates.every(idValue) || !record(card.fields)) throw new Error("Invalid box card");
    onlyKeys(card, ["key", "kind", "identity", "candidates", "fields"]);
    onlyKeys(card.fields, CARD_FIELDS);
    keys.add(card.key);
    checkField(card.identity, idValue);
    const identity = cardIdentity(card as unknown as BoxCard);
    if (identities.has(identity)) throw new Error("Repeated card identity");
    identities.add(identity);
    for (const name of CARD_FIELDS) {
      checkField(card.fields[name], item => numberValue(item) && Number(item) >= 1 && (name === "level" || Number(item) <= 5));
      if (card.kind === "snap" && !["level", "rank"].includes(name) && (card.fields[name] as BoxField<number>).status !== "unknown") throw new Error("Snap skills are derived from rank");
    }
  }
  const player = value.player;
  onlyKeys(player, ["characterRanks", "characterCoverage", "characterTotalRank", "vipRank", "bandItems", "bandItemStates", "catalogFields", "catalogIdentity", "bandItemsComplete", "memory", "eventIds"]);
  // v1 exports without the player catalogue fields read them as empty.
  player.bandItemStates ??= {}; player.catalogFields ??= {}; player.catalogIdentity ??= null;
  if (!record(player.bandItemStates) || !record(player.catalogFields)) throw new Error("Invalid player catalog fields");
  for (const [id, field] of Object.entries(player.bandItemStates)) { if (!idValue(id)) throw new Error("Invalid band item identity"); checkField(field, item => ["owned", "active", "inactive", "not-owned", "no-bonus"].includes(String(item))); }
  for (const [key, field] of Object.entries(player.catalogFields)) { if (!/^[A-Za-z0-9._:-]+$/.test(key)) throw new Error("Invalid player field key"); checkField(field, item => numberValue(item) || typeof item === "string" && !!item && item.length <= 256); }
  if (player.catalogIdentity !== null) { checkCatalogIdentity(player.catalogIdentity); if ((player.catalogIdentity as unknown as PlayerCatalogIdentity).server !== value.server) throw new Error("Player catalog belongs to another server"); }
  if (!record(player.characterRanks) || !record(player.bandItems) || !["partial", "complete"].includes(String(player.characterCoverage)) || typeof player.bandItemsComplete !== "boolean") throw new Error("Invalid player fields");
  for (const entries of [player.characterRanks, player.bandItems]) for (const [id, field] of Object.entries(entries)) { if (!idValue(id)) throw new Error("Invalid player field identity"); checkField(field, numberValue); }
  checkField(player.characterTotalRank, numberValue); checkField(player.vipRank, numberValue);
  checkField(player.eventIds, item => Array.isArray(item) && item.every(idValue));
  checkField(player.memory, item => {
    if (!record(item)) return false;
    onlyKeys(item, ["musicRanks", "unlockedMembers", "unlockedSnaps"]);
    return record(item.musicRanks) && Object.entries(item.musicRanks).every(([id, rank]) => idValue(id) && numberValue(rank)) && Array.isArray(item.unlockedMembers) && item.unlockedMembers.every(idValue) && Array.isArray(item.unlockedSnaps) && item.unlockedSnaps.every(idValue);
  });
  const memory = (player.memory as BoxField<BoxMemory>).value;
  if (memory) onlyKeys(memory as unknown as Record<string, unknown>, ["musicRanks", "unlockedMembers", "unlockedSnaps"]);
  if (value.baseline !== null && (!record(value.baseline) || !Array.isArray(value.baseline.members) || value.baseline.members.length !== 5 || !value.baseline.members.every(idValue) || !Array.isArray(value.baseline.snaps) || value.baseline.snaps.length !== 5 || !value.baseline.snaps.every(id => id === null || idValue(id)))) throw new Error("Invalid baseline deck");
  if (record(value.baseline)) onlyKeys(value.baseline, ["members", "snaps"]);
  const fields = [...(value.cards as unknown as BoxCard[]).flatMap(card => [card.identity, ...Object.values(card.fields)]),
    ...Object.values(player.characterRanks as Record<string, BoxField<unknown>>), ...Object.values(player.bandItems as Record<string, BoxField<unknown>>),
    ...Object.values(player.bandItemStates as Record<string, BoxField<unknown>>), ...Object.values(player.catalogFields as Record<string, BoxField<unknown>>),
    player.characterTotalRank, player.vipRank, player.memory, player.eventIds] as BoxField<unknown>[];
  if (fields.some(field => field.history.some(item => item.catalog && item.catalog.server !== value.server))) throw new Error("Player answer belongs to another server");
  return value as unknown as CardBox;
}
