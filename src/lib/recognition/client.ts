import type { RecognitionArtIdentity, RecognitionConfiguration, RecognitionSource } from "./protocol";
import { RecognitionError } from "./errors";

/** A gallery card's Master art reference, as recorded when the gallery was built. */
export type RecognitionGalleryIdentity = Pick<RecognitionArtIdentity, "assetId" | "characterIds" | "rarity" | "cardType">;
export interface RecognitionManifest {
  format: "ournotes.browser-feature-gallery/3"; galleryId: string;
  catalog: readonly { region: string; masterVersion: string }[];
  cards: readonly { kind: "member" | "snap"; id: string; identity: RecognitionGalleryIdentity; regions: readonly string[]; art: { file: string; sha256: string } }[];
}
/** Where the page finds the recognition runtime: the same-origin Worker and the recognition site's bundle pointer. */
export interface RecognitionSiteConfig { site: string; pointerUrl: string; workerUrl: string }
export interface RecognitionFileRecord { path: string; sha256: string; bytes: number; contentType: string }
export interface RecognitionBundle {
  format: "moenotes.recognition-bundle/1"; entries: { gallery: string; fields?: string };
  files: Readonly<Record<string, RecognitionFileRecord>>;
}
export interface LoadedRecognitionBundle { bundleSha256: string; manifest: RecognitionManifest; configuration: RecognitionConfiguration }

const HEX64 = /^[a-f0-9]{64}$/;
const OBJECT_PATH = /^assets\/([a-f0-9]{64})\.[a-z0-9]+$/;
export const recognitionDigest = async (bytes: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const decimal = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]*$/.test(value);

async function download(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<ArrayBuffer> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: "omit", signal }); }
  catch (error) { if (signal.aborted) throw error; throw new RecognitionError("manifestFetch"); }
  if (!response.ok) throw new RecognitionError("manifestFetch", `HTTP ${response.status}`);
  try { return await response.arrayBuffer(); }
  catch (error) { if (signal.aborted) throw error; throw new RecognitionError("manifestFetch"); }
}
async function verified(url: string, expected: { sha256: string; bytes?: number }, signal: AbortSignal): Promise<ArrayBuffer> {
  const bytes = await download(url, signal);
  if (expected.bytes !== undefined && bytes.byteLength !== expected.bytes || await recognitionDigest(bytes) !== expected.sha256) throw new RecognitionError("manifestHash");
  return bytes;
}
function json(bytes: ArrayBuffer): unknown {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RecognitionError("manifestFormat"); }
}

/** The pointer names the current bundle manifest by SHA-256 and size; it is the only mutable file. */
export function parseRecognitionPointer(value: unknown): { sha256: string; bytes: number } {
  const bundle = record(value) ? value.bundle : undefined;
  if (!record(value) || value.format !== "moenotes.recognition-pointer/1" || !record(bundle) || typeof bundle.sha256 !== "string" || !HEX64.test(bundle.sha256)
    || !Number.isSafeInteger(bundle.bytes) || (bundle.bytes as number) < 1) throw new RecognitionError("manifestFormat");
  return { sha256: bundle.sha256, bytes: bundle.bytes as number };
}

/** Every bundle file is content-addressed: `assets/<sha256>.<ext>` below the recognition site. */
export function parseRecognitionBundle(value: unknown): RecognitionBundle {
  if (!record(value) || value.format !== "moenotes.recognition-bundle/1" || !record(value.entries) || !record(value.files)) throw new RecognitionError("manifestFormat");
  const files = value.files as Record<string, unknown>, entries = value.entries;
  for (const file of Object.values(files)) {
    const path = record(file) && typeof file.path === "string" ? OBJECT_PATH.exec(file.path) : null;
    if (!record(file) || !path || path[1] !== file.sha256 || !Number.isSafeInteger(file.bytes) || (file.bytes as number) < 0 || typeof file.contentType !== "string") throw new RecognitionError("manifestFormat");
  }
  if (typeof entries.gallery !== "string" || !files[entries.gallery] || entries.fields !== undefined && (typeof entries.fields !== "string" || !files[entries.fields])) throw new RecognitionError("manifestFormat");
  return value as unknown as RecognitionBundle;
}

function galleryCard(value: unknown): boolean {
  if (!record(value) || typeof value.kind !== "string" || !["member", "snap"].includes(value.kind) || !decimal(value.id)) return false;
  const identity = value.identity, art = value.art;
  return record(identity) && decimal(identity.assetId) && Array.isArray(identity.characterIds) && identity.characterIds.every(decimal)
    && Number.isSafeInteger(identity.rarity) && Number.isSafeInteger(identity.cardType)
    && Array.isArray(value.regions) && value.regions.every(region => typeof region === "string")
    && record(art) && typeof art.file === "string" && typeof art.sha256 === "string" && HEX64.test(art.sha256);
}

export function parseRecognitionManifest(value: unknown): RecognitionManifest {
  if (!record(value) || value.format !== "ournotes.browser-feature-gallery/3" || typeof value.galleryId !== "string" || !HEX64.test(value.galleryId)
    || !Array.isArray(value.catalog) || value.catalog.some(entry => !record(entry) || typeof entry.region !== "string" || typeof entry.masterVersion !== "string")
    || !Array.isArray(value.cards) || !value.cards.every(galleryCard)) throw new RecognitionError("manifestFormat");
  const manifest = value as unknown as RecognitionManifest;
  if (new Set(manifest.cards.map(card => `${card.kind}:${card.id}`)).size !== manifest.cards.length) throw new RecognitionError("manifestFormat");
  return manifest;
}

/**
 * Pointer (revalidated on every load) -> bundle manifest -> gallery manifest, each checked against the SHA-256 and size
 * the previous one names. Only public runtime files travel over the network; screenshot pixels never enter fetch().
 */
export async function loadRecognitionBundle(config: RecognitionSiteConfig, signal: AbortSignal): Promise<LoadedRecognitionBundle> {
  if (!config.workerUrl || !config.pointerUrl || !config.site) throw new RecognitionError("configuration");
  const base = typeof location === "undefined" ? undefined : location.href;
  const site = new URL(`${config.site.replace(/\/+$/, "")}/`, base);
  const pointer = parseRecognitionPointer(json(await download(new URL(config.pointerUrl, base).href, signal, { cache: "no-cache" })));
  const bundle = parseRecognitionBundle(json(await verified(new URL(`assets/${pointer.sha256}.json`, site).href, pointer, signal)));
  const gallery = bundle.files[bundle.entries.gallery]!, fields = bundle.entries.fields ? bundle.files[bundle.entries.fields] : undefined;
  const manifestUrl = new URL(gallery.path, site).href;
  const manifest = parseRecognitionManifest(json(await verified(manifestUrl, gallery, signal)));
  return { bundleSha256: pointer.sha256, manifest, configuration: { workerUrl: new URL(config.workerUrl, base).href, manifestUrl, manifestSha256: gallery.sha256,
    ...(fields ? { fieldManifestUrl: new URL(fields.path, site).href, fieldManifestSha256: fields.sha256 } : {}) } };
}

/** A gallery entry applies to the selected server when its Master art reference (asset, characters, rarity, type) matches. */
export function bindRecognitionSource(manifest: RecognitionManifest, source: RecognitionSource): RecognitionSource {
  if (!source.cards.length) throw new RecognitionError("catalogBinding", `${source.server}: card catalogue is empty`);
  const current = new Map(source.cards.map(card => [`${card.kind}:${card.id}`, card]));
  const compatibleCardKeys: string[] = [];
  const incompatibleCardReasons: { key: string; expected: string; actual: string }[] = [];
  const signature = (card: RecognitionGalleryIdentity) => JSON.stringify([card.assetId, card.characterIds, card.rarity, card.cardType]);
  for (const card of manifest.cards) {
    const key = `${card.kind}:${card.id}`, actual = current.get(key);
    if (actual && signature(card.identity) === signature(actual)) compatibleCardKeys.push(key);
    else incompatibleCardReasons.push({ key, expected: signature(card.identity), actual: actual ? signature(actual) : "absent" });
  }
  if (!compatibleCardKeys.length) throw new RecognitionError("catalogBinding", JSON.stringify(incompatibleCardReasons[0] ?? { key: "gallery", expected: "cards", actual: "absent" }));
  return { ...source, gallery: { galleryId: manifest.galleryId, catalog: manifest.catalog.map(({ region, masterVersion }) => ({ region, masterVersion })), compatibleCardKeys, incompatibleCardReasons } };
}

/** Browser-native decoding, with original orientation; recognition itself runs in the WASM Worker. */
export async function decodeScreenshot(file: File): Promise<{ width: number; height: number; rgba: ArrayBuffer; sourceId: string }> {
  if (file.size > 25_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new RecognitionError("imageType");
  const sourceId = await recognitionDigest(await file.arrayBuffer());
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new RecognitionError("imageDecode"); }
  try {
    const { width, height } = bitmap;
    if (!width || !height || width * height > 24_000_000) throw new RecognitionError("imageType");
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new RecognitionError("imageDecode");
    context.drawImage(bitmap, 0, 0);
    return { width, height, rgba: context.getImageData(0, 0, width, height).data.buffer as ArrayBuffer, sourceId };
  } finally { bitmap.close(); }
}
