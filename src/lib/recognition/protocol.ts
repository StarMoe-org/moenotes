import type { GameServer } from "@/config/servers";
import { answerField, createBox, createCard, mergeBoxes, observeField, type BoxCard, type BoxField, type CardBox, type CardFieldName } from "@/lib/box/model";

export interface RecognitionBinding { jobId: string; inputRevision: string; datasetId: string; galleryId: string }
export interface RecognitionArtIdentity { kind: "member" | "snap"; id: string; assetId: string; characterIds: readonly string[]; rarity: number; cardType: number }
export interface RecognitionSourceStamp { server: GameServer; masterVersion: string; sourceId: string }
export interface RecognitionSource extends RecognitionSourceStamp { cards: readonly RecognitionArtIdentity[]; catalogueSignature: string;
  gallery?: { galleryId: string; catalog: readonly RecognitionCatalogEntry[]; compatibleCardKeys: readonly string[]; incompatibleCardReasons?: readonly { key: string; expected: string; actual: string }[] } }
/** A server's Master snapshot that contributed cards to the gallery. */
export interface RecognitionCatalogEntry { region: string; masterVersion: string }
/** One verified bundle: the gallery and models manifests, both content-addressed. */
export interface RecognitionConfiguration { workerUrl: string; galleryUrl: string; gallerySha256: string; modelsUrl: string; modelsSha256: string }
export type RecognitionBox = [number, number, number, number];
export interface RecognizedValue { value: number | null; confidence?: number; reason?: string; bbox?: RecognitionBox;
  method?: "boxLensClassifierOrtWasm"; modelSha256?: string; runtimeId?: string }
interface RecognizedTile {
  kind: "member" | "snap"; bbox: RecognitionBox; locatorScore: number; visibleFraction: number;
  /** Cosine similarity to the nearest reference of the selected catalogue, and its lead over the second nearest. */
  identitySimilarity: number; identityMargin: number;
  displayMode: "level" | "training" | "other" | "unknown"; review: true;
  level: RecognizedValue; card_rank: RecognizedValue; awake_count: RecognizedValue;
}
export interface RecognizedCard extends RecognizedTile { id: string; identityMethod: "boxLensEncoderOrtWasm" }
/** A located card tile whose identity was not accepted; `candidate` is only the nearest reference, for review. */
export interface UnidentifiedCard extends RecognizedTile { candidate: string | null }
export interface RecognitionResult {
  type: "result"; binding: RecognitionBinding; status: "complete" | "timeLimit" | "cancelled" | "stale" | "failed";
  cards: RecognizedCard[]; unidentified: UnidentifiedCard[]; sourceId: string; elapsedMs: number; error?: string;
  scope?: { galleryId: string; modelsSha256: string; catalog?: readonly RecognitionCatalogEntry[]; coverage: string; fullScanCertified: boolean };
}
export const sameRecognitionBinding = (a: RecognitionBinding | undefined, b: RecognitionBinding): boolean => !!a
  && (["jobId", "inputRevision", "datasetId", "galleryId"] as const).every(key => typeof a[key] === "string" && a[key] === b[key]);
const rect = (value: unknown): value is RecognitionBox => Array.isArray(value) && value.length === 4
  && value.every(item => typeof item === "number" && Number.isFinite(item)) && value[2] > 0 && value[3] > 0;
const unit = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const within = (value: unknown, low: number, high: number): boolean => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const cardKey = (kind: string, id: string) => `${kind}:${id}`;

function validTile(card: RecognizedTile): boolean {
  return ["member", "snap"].includes(card.kind) && rect(card.bbox) && unit(card.locatorScore) && unit(card.visibleFraction)
    && within(card.identitySimilarity, -1, 1) && within(card.identityMargin, 0, 2) && card.review === true
    && ["level", "training", "other", "unknown"].includes(card.displayMode)
    && [card.level, card.card_rank, card.awake_count].every(field => !!field && (field.value === null || Number.isSafeInteger(field.value) && field.value >= 1)
      && (field.bbox === undefined || rect(field.bbox)) && (field.confidence === undefined || unit(field.confidence))
      && (field.value === null || field.method === "boxLensClassifierOrtWasm" && /^[a-f0-9]{64}$/.test(field.modelSha256 ?? "") && !!field.runtimeId && rect(field.bbox)));
}

/** Worker replies are source-bound observations; they cannot declare a complete inventory. */
export function validateRecognitionResult(value: unknown, binding: RecognitionBinding, source: RecognitionSource, sourceId: string): RecognitionResult {
  const result = value as RecognitionResult;
  if (!result || result.type !== "result" || !sameRecognitionBinding(result.binding, binding) || result.sourceId !== sourceId
    || !["complete", "timeLimit", "cancelled", "stale", "failed"].includes(result.status) || !Array.isArray(result.cards) || !Array.isArray(result.unidentified)) throw new Error("Recognition reply binding differs");
  if (result.status !== "complete") return result;
  if (result.scope?.galleryId !== binding.galleryId || source.gallery && source.gallery.galleryId !== binding.galleryId
    || !/^[a-f0-9]{64}$/.test(result.scope.modelsSha256 ?? "") || result.scope.coverage !== "observed_only" || result.scope.fullScanCertified !== false) throw new Error("Recognition source differs");
  for (const card of result.cards) {
    if (typeof card.id !== "string" || !/^[1-9][0-9]*$/.test(card.id) || card.identityMethod !== "boxLensEncoderOrtWasm" || !validTile(card)) throw new Error("Invalid recognized card");
    if (!source.cards.some(actual => actual.kind === card.kind && actual.id === card.id)) throw new Error("Recognized card is absent from selected catalogue");
    if (source.gallery && !source.gallery.compatibleCardKeys.includes(cardKey(card.kind, card.id))) {
      const key = cardKey(card.kind, card.id), mismatch = source.gallery.incompatibleCardReasons?.find(item => item.key === key);
      throw new Error(`Recognized card art is not bound to the selected catalogue: ${key}${mismatch ? ` expected ${mismatch.expected}; actual ${mismatch.actual}` : " absent"}`);
    }
  }
  for (const card of result.unidentified) {
    if (card.candidate !== null && (typeof card.candidate !== "string" || !source.cards.some(actual => actual.kind === card.kind && actual.id === card.candidate))
      || !validTile(card)) throw new Error("Invalid unidentified card");
  }
  return result;
}

/** Key of the review card made from an unidentified tile of one job. */
export const unidentifiedCardKey = (jobId: string, index: number): string => `${jobId}:u${index}`;

/** Only actual non-null field reads enter history. Unseen levels and both skill levels remain unknown.
 * An unidentified tile becomes a card without identity, its nearest reference as the only candidate, for review. */
export function observedScreenshotBox(result: RecognitionResult, source: RecognitionSource, manifestSha256: string, at = Date.now(), imageSize?: readonly [number, number]): CardBox {
  validateRecognitionResult(result, result.binding, source, result.sourceId);
  if (result.status !== "complete") throw new Error("Recognition is incomplete");
  const box = createBox(source.server, `scan-${result.binding.jobId}`, at);
  const tiles: [RecognizedCard | UnidentifiedCard, string][] = [
    ...result.cards.map((item, index): [RecognizedCard, string] => [item, `${result.binding.jobId}:${index}`]),
    ...result.unidentified.map((item, index): [UnidentifiedCard, string] => [item, unidentifiedCardKey(result.binding.jobId, index)]),
  ];
  box.cards = tiles.map(([item, key]) => {
    const card = createCard(item.kind, key);
    const screenshot = { sourceId: result.sourceId, bbox: item.bbox, confidence: Math.max(0, item.identitySimilarity), regionAssignment: "player-selected" as const,
      recognition: { galleryId: result.binding.galleryId, manifestSha256, uiMasterSourceId: source.sourceId, method: "boxLensEncoderOrtWasm" as const } };
    if ("id" in item) card.identity = observeField(card.identity, { id: `${key}:identity`, value: item.id, source: "screenshot", at, screenshot });
    else if (item.candidate !== null) card.candidates = [item.candidate];
    for (const [field, value] of [["level", item.level], ["rank", item.card_rank], ["awake", item.awake_count]] as const) {
      if (value.value === null || item.kind === "snap" && field === "awake") continue;
      if (field !== "level" && value.value > 5 || !value.bbox) continue;
      if (imageSize && (value.bbox[0] < 0 || value.bbox[1] < 0 || value.bbox[0] + value.bbox[2] > imageSize[0] || value.bbox[1] + value.bbox[3] > imageSize[1])) continue;
      card.fields[field as CardFieldName] = observeField(card.fields[field as CardFieldName], { id: `${key}:${field}`, value: value.value,
        source: "screenshot", at, screenshot: { ...screenshot, bbox: value.bbox, ...(value.confidence !== undefined ? { confidence: value.confidence } : {}),
          parameterRecognition: { method: value.method!, modelSha256: value.modelSha256!, runtimeId: value.runtimeId! } } });
    }
    return card;
  });
  return box;
}

/** An identity correction is manual evidence; it retains the original image observation. */
export function correctRecognizedIdentity(card: BoxCard, id: string | null, at = Date.now()): BoxCard {
  if (id !== null && !/^[1-9][0-9]*$/.test(id)) throw new Error("Invalid card identity");
  return { ...card, identity: answerField(card.identity, { id: crypto.randomUUID(), value: id, source: "manual", at }) };
}

/** Choosing an identity already in this draft is one card with both pictures' evidence.
 * Keep the edited row's key so an open correction dialog still refers to that row. */
export function correctRecognizedBoxIdentity(draft: CardBox, key: string, id: string | null, at = Date.now()): CardBox {
  const edited = draft.cards.find(card => card.key === key);
  if (!edited) throw new Error("Unknown recognized card key");
  const corrected = correctRecognizedIdentity(edited, id, at);
  const merged = mergeBoxes({ ...draft, cards: [corrected] }, { ...draft, cards: draft.cards.filter(card => card.key !== key) }, at);
  const order = new Map(draft.cards.map((card, index) => [card.key, index]));
  merged.cards.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  return merged;
}

export function correctRecognizedValue(card: BoxCard, field: CardFieldName, value: number | null, at = Date.now()): BoxCard {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1 || field !== "level" && value > 5)) throw new Error("Invalid card value");
  return { ...card, fields: { ...card.fields, [field]: answerField(card.fields[field], { id: crypto.randomUUID(), value, source: "manual", at }) } };
}

/** A screenshot adds observations only. It does not reset global facts or ownership declarations. */
export function mergeRecognizedBox(current: CardBox, observation: CardBox, at = Date.now()): CardBox {
  const overlap = (a: RecognitionBox, b: RecognitionBox): number => {
    const area = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]))
      * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    return area / (a[2] * a[3] + b[2] * b[3] - area);
  };
  const keepManual = <T>(known: BoxField<T>, incoming: BoxField<T>): BoxField<T> => {
    if (known.status !== "manual" || incoming.status !== "conflict" || !incoming.history.length
      || !incoming.history.every(item => item.source === "screenshot" && item.value !== null)) return incoming;
    // Several pictures may disagree, but that does not withdraw an existing manual answer.
    return incoming.history.reduce((field, item) => observeField(field, item), structuredClone(known));
  };
  const cards = observation.cards.map(card => {
    const picture = card.identity.history.find(item => item.screenshot)?.screenshot;
    const samePicture = picture && current.cards.find(existing => existing.kind === card.kind && existing.identity.history.some(item =>
      item.screenshot?.sourceId === picture.sourceId && overlap(item.screenshot.bbox, picture.bbox) > 0.8));
    const previous = samePicture ?? current.cards.find(existing => existing.key === card.key
      || existing.kind === card.kind && card.identity.value !== null && existing.identity.value === card.identity.value);
    return previous ? { ...card, key: samePicture ? previous.key : card.key, identity: keepManual(previous.identity, card.identity),
      fields: Object.fromEntries(Object.entries(card.fields).map(([name, field]) => [name, keepManual(previous.fields[name as CardFieldName], field)])) as BoxCard["fields"] } : card;
  });
  return mergeBoxes(current, { ...observation, cards, coverage: current.coverage, player: current.player }, at);
}
