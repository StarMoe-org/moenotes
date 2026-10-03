import type { GameServer } from "@/config/servers";
import { answerField, createBox, createCard, mergeBoxes, observeField, type BoxCard, type BoxField, type CardBox, type CardFieldName } from "@/lib/box/model";

export interface RecognitionBinding { jobId: string; inputRevision: string; datasetId: string; galleryId: string }
export interface RecognitionArtIdentity { kind: "member" | "snap"; id: string; assetId: string; characterIds: readonly string[]; rarity: number; cardType: number }
export interface RecognitionSourceStamp { server: GameServer; masterVersion: string; sourceId: string }
export interface RecognitionSource extends RecognitionSourceStamp { cards: readonly RecognitionArtIdentity[]; catalogueSignature: string;
  gallery?: { galleryId: string; catalog: readonly RecognitionCatalogEntry[]; compatibleCardKeys: readonly string[]; incompatibleCardReasons?: readonly { key: string; expected: string; actual: string }[] } }
/** A server's Master snapshot that contributed cards to the gallery. */
export interface RecognitionCatalogEntry { region: string; masterVersion: string }
/** One verified bundle: the gallery manifest and the optional field manifest, both content-addressed. */
export interface RecognitionConfiguration { workerUrl: string; manifestUrl: string; manifestSha256: string; fieldManifestUrl?: string; fieldManifestSha256?: string }
export type RecognitionBox = [number, number, number, number];
export interface RecognizedValue { value: number | null; confidence?: number; reason?: string; bbox?: RecognitionBox;
  method?: "boxLensNumberReaderOrtWasm"; modelSha256?: string; runtimeId?: string }
export interface RecognizedCard {
  kind: "member" | "snap"; id: string; bbox: RecognitionBox; uiBBox: RecognitionBox;
  frameBBox?: RecognitionBox;
  identityConfidence: number; inliers: number; visibleFraction: number; identityMethod: "siftFlannWasm"; review: true;
  level: RecognizedValue; card_rank: RecognizedValue; awake_count: RecognizedValue;
}
export interface RecognitionResult {
  type: "result"; binding: RecognitionBinding; status: "complete" | "timeLimit" | "cancelled" | "stale" | "failed";
  cards: RecognizedCard[]; sourceId: string; elapsedMs: number; error?: string;
  scope?: { galleryId: string; catalog?: readonly RecognitionCatalogEntry[]; genuineOpenCvWasm: boolean; identityGeometryOnly: boolean; cultivationObserved: boolean; coverage: string; fullScanCertified: boolean };
}
export const sameRecognitionBinding = (a: RecognitionBinding | undefined, b: RecognitionBinding): boolean => !!a
  && (["jobId", "inputRevision", "datasetId", "galleryId"] as const).every(key => typeof a[key] === "string" && a[key] === b[key]);
const rect = (value: unknown): value is RecognitionBox => Array.isArray(value) && value.length === 4
  && value.every(item => typeof item === "number" && Number.isFinite(item)) && value[2] > 0 && value[3] > 0;

/** Worker replies are source-bound observations; they cannot declare a complete inventory. */
export function validateRecognitionResult(value: unknown, binding: RecognitionBinding, source: RecognitionSource, sourceId: string): RecognitionResult {
  const result = value as RecognitionResult;
  if (!result || result.type !== "result" || !sameRecognitionBinding(result.binding, binding) || result.sourceId !== sourceId
    || !["complete", "timeLimit", "cancelled", "stale", "failed"].includes(result.status) || !Array.isArray(result.cards)) throw new Error("Recognition reply binding differs");
  if (result.status !== "complete") return result;
  if (result.scope?.galleryId !== binding.galleryId || source.gallery && source.gallery.galleryId !== binding.galleryId
    || result.scope.genuineOpenCvWasm !== true || result.scope.coverage !== "observed_only" || result.scope.fullScanCertified !== false) throw new Error("Recognition source differs");
  for (const card of result.cards) {
    if (!source.cards.some(actual => actual.kind === card.kind && actual.id === card.id)) throw new Error("Recognized card is absent from selected catalogue");
    if (source.gallery && !source.gallery.compatibleCardKeys.includes(`${card.kind}:${card.id}`)) {
      const key = `${card.kind}:${card.id}`, mismatch = source.gallery.incompatibleCardReasons?.find(item => item.key === key);
      throw new Error(`Recognized card art is not bound to the selected catalogue: ${key}${mismatch ? ` expected ${mismatch.expected}; actual ${mismatch.actual}` : " absent"}`);
    }
    if (!["member", "snap"].includes(card.kind) || typeof card.id !== "string" || !/^[1-9][0-9]*$/.test(card.id)
      || !rect(card.bbox) || !rect(card.uiBBox) || card.frameBBox !== undefined && !rect(card.frameBBox) || !Number.isFinite(card.identityConfidence) || card.identityConfidence < 0 || card.identityConfidence > 1
      || !Number.isSafeInteger(card.inliers) || card.inliers < 0 || !Number.isFinite(card.visibleFraction) || card.visibleFraction < 0 || card.visibleFraction > 1
      || card.identityMethod !== "siftFlannWasm" || card.review !== true) throw new Error("Invalid recognized card");
    for (const field of [card.level, card.card_rank, card.awake_count]) if (!field || field.value !== null && (!Number.isSafeInteger(field.value) || field.value < 1)
      || field.bbox !== undefined && !rect(field.bbox) || field.confidence !== undefined && (!Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1)) throw new Error("Invalid recognized cultivation");
  }
  return result;
}

/** Only actual non-null field reads enter history. Unseen levels and both skill levels remain unknown. */
export function observedScreenshotBox(result: RecognitionResult, source: RecognitionSource, manifestSha256: string, at = Date.now(), imageSize?: readonly [number, number]): CardBox {
  validateRecognitionResult(result, result.binding, source, result.sourceId);
  if (result.status !== "complete" || result.scope?.genuineOpenCvWasm !== true) throw new Error("Recognition is incomplete");
  const box = createBox(source.server, `scan-${result.binding.jobId}`, at);
  box.cards = result.cards.map((item, index) => {
    const key = `${result.binding.jobId}:${index}`, card = createCard(item.kind, key);
    const screenshot = { sourceId: result.sourceId, bbox: item.bbox,
      confidence: item.identityConfidence, regionAssignment: "player-selected" as const,
      recognition: { galleryId: result.binding.galleryId, manifestSha256, uiMasterSourceId: source.sourceId, method: "siftFlannWasm" as const } };
    card.identity = observeField(card.identity, { id: `${key}:identity`, value: item.id, source: "screenshot", at, screenshot });
    if (result.scope?.cultivationObserved === true) for (const [field, value] of [["level", item.level], ["rank", item.card_rank], ["awake", item.awake_count]] as const) {
      if (value.value === null || item.kind === "snap" && field === "awake") continue;
      if (field !== "level" && value.value > 5 || !value.bbox) continue;
      if (value.method !== "boxLensNumberReaderOrtWasm" || !/^[a-f0-9]{64}$/.test(value.modelSha256 ?? "") || !value.runtimeId) continue;
      if (imageSize && (value.bbox[0] < 0 || value.bbox[1] < 0 || value.bbox[0] + value.bbox[2] > imageSize[0] || value.bbox[1] + value.bbox[3] > imageSize[1])) continue;
      card.fields[field as CardFieldName] = observeField(card.fields[field as CardFieldName], { id: `${key}:${field}`, value: value.value,
        source: "screenshot", at, screenshot: { ...screenshot, bbox: value.bbox, ...(value.confidence !== undefined ? { confidence: value.confidence } : {}),
          parameterRecognition: { method: value.method, modelSha256: value.modelSha256!, runtimeId: value.runtimeId } } });
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
