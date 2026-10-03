import type { RecognitionConfiguration, RecognitionSource } from "./protocol";
import galleryArtIdentity from "./gallery-art-identity.json";
import { RecognitionError } from "./errors";

export interface RecognitionManifest {
  format: "ournotes.browser-feature-gallery/2"; region: string; masterVersion: string; galleryId: string;
  cards: readonly { kind: "member" | "snap"; id: string; art: { file: string; sha256: string }; masterTableSha256: string }[];
}
export const recognitionDigest = async (bytes: ArrayBuffer): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");


/** A gallery entry applies to the selected server when its Master art reference (asset, characters, rarity, type) matches. */
export function bindRecognitionSource(manifest: RecognitionManifest, source: RecognitionSource, manifestSha256: string): RecognitionSource {
  const directory = galleryArtIdentity;
  if (!source.cards.length) throw new RecognitionError("catalogBinding", `${source.server}: card catalogue is empty`);
  if (directory.format !== "ournotes.browser-gallery-art-identity/1" || directory.galleryId !== manifest.galleryId || directory.galleryManifestSha256 !== manifestSha256
    || directory.sourceRegion !== manifest.region || directory.sourceMasterVersion !== manifest.masterVersion) throw new RecognitionError("catalogBinding", "gallery provenance differs");
  const frozen = new Map(directory.cards.map(card => [`${card.kind}:${card.id}`, card]));
  const current = new Map(source.cards.map(card => [`${card.kind}:${card.id}`, card]));
  const compatibleCardKeys: string[] = [];
  const incompatibleCardReasons: { key: string; expected: string; actual: string }[] = [];
  const signature = (card: { assetId: string; characterIds: readonly string[]; rarity: number; cardType: number }) => JSON.stringify([card.assetId, card.characterIds, card.rarity, card.cardType]);
  for (const card of manifest.cards) {
    const key = `${card.kind}:${card.id}`, old = frozen.get(key), actual = current.get(key);
    if (!old || old.artSha256 !== card.art.sha256 || card.masterTableSha256 !== directory.sourceTables[card.kind].sha256) throw new RecognitionError("catalogBinding", key);
    if (actual && old.assetId === actual.assetId && old.rarity === actual.rarity && old.cardType === actual.cardType
      && JSON.stringify(old.characterIds) === JSON.stringify(actual.characterIds)) compatibleCardKeys.push(key);
    else incompatibleCardReasons.push({ key, expected: signature(old), actual: actual ? signature(actual) : "absent" });
  }
  if (!compatibleCardKeys.length) throw new RecognitionError("catalogBinding", JSON.stringify(incompatibleCardReasons[0]));
  return { ...source, gallery: { region: manifest.region, masterVersion: manifest.masterVersion, galleryId: manifest.galleryId, compatibleCardKeys, incompatibleCardReasons } };
}

/** Only public runtime assets travel over the network. Screenshot pixels never enter fetch(). */
export async function loadRecognitionManifest(config: RecognitionConfiguration, signal: AbortSignal): Promise<RecognitionManifest> {
  if (!config.workerUrl || !config.manifestUrl || !/^[a-f0-9]{64}$/.test(config.manifestSha256)) throw new RecognitionError("configuration");
  let response: Response;
  try { response = await fetch(new URL(config.manifestUrl, location.href), { credentials: "omit", signal }); }
  catch (error) { if (signal.aborted) throw error; throw new RecognitionError("manifestFetch"); }
  if (!response.ok) throw new RecognitionError("manifestFetch", `HTTP ${response.status}`);
  let bytes: ArrayBuffer;
  try { bytes = await response.arrayBuffer(); }
  catch (error) { if (signal.aborted) throw error; throw new RecognitionError("manifestFetch"); }
  if (await recognitionDigest(bytes) !== config.manifestSha256) throw new RecognitionError("manifestHash");
  let manifest: RecognitionManifest;
  try { manifest = JSON.parse(new TextDecoder().decode(bytes)) as RecognitionManifest; }
  catch { throw new RecognitionError("manifestFormat"); }
  if (manifest.format !== "ournotes.browser-feature-gallery/2" || typeof manifest.region !== "string" || typeof manifest.masterVersion !== "string"
    || !/^[a-f0-9]{64}$/.test(manifest.galleryId) || !Array.isArray(manifest.cards)
    || manifest.cards.some(card => !card || !["member", "snap"].includes(card.kind) || typeof card.id !== "string" || !/^[1-9][0-9]*$/.test(card.id)
      || typeof card.art?.file !== "string" || !/^[a-f0-9]{64}$/.test(card.art.sha256) || !/^[a-f0-9]{64}$/.test(card.masterTableSha256))
    || new Set(manifest.cards.map(card => `${card.kind}:${card.id}`)).size !== manifest.cards.length) throw new RecognitionError("manifestFormat");
  return manifest;
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
