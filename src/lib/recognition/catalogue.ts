import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import type { RecognitionArtIdentity, RecognitionSource, RecognitionSourceStamp } from "./protocol";
import { RecognitionError } from "./errors";

export interface RecognitionCatalogue { members: readonly CardViewModel[]; snaps: readonly SupportCardViewModel[] }
export interface RecognitionContext { source: RecognitionSource; catalogue: RecognitionCatalogue }

/** One actual selected-server catalogue supplies both recognition identities and review artwork. */
export function createRecognitionContext(stamp: RecognitionSourceStamp, catalogue: RecognitionCatalogue): RecognitionContext {
  const prefix = `ui-master-observation:${stamp.server}:${stamp.masterVersion}:`;
  if (!stamp.masterVersion || !stamp.sourceId.startsWith(prefix) || !/^sha256:[a-f0-9]{64}:sha256:[a-f0-9]{64}$/.test(stamp.sourceId.slice(prefix.length))) throw new RecognitionError("catalogBinding", "Master source stamp is not bound to its table identities");
  const decimal = (value: number, field: string): string => {
    if (!Number.isSafeInteger(value) || value < 1) throw new RecognitionError("catalogBinding", `${field}: missing or unsafe decimal ID`);
    return String(value);
  };
  const cards: RecognitionArtIdentity[] = [
    ...catalogue.members.map(card => ({ kind: "member" as const, id: decimal(card.id, "member ID"), assetId: decimal(card.assetId, `member ${card.id} asset`), characterIds: [decimal(card.characterId, `member ${card.id} character`)], rarity: card.rarity, cardType: card.cardType })),
    ...catalogue.snaps.map(card => {
      if (!Array.isArray(card.characterIds)) throw new RecognitionError("catalogBinding", `snap ${card.id}: character IDs are missing`);
      return { kind: "snap" as const, id: decimal(card.id, "snap ID"), assetId: decimal(card.assetId, `snap ${card.id} asset`), characterIds: card.characterIds.map(id => decimal(id, `snap ${card.id} character`)), rarity: card.rarity, cardType: card.cardType };
    }),
  ];
  const keys = new Set<string>();
  for (const card of cards) {
    const key = `${card.kind}:${card.id}`;
    if (keys.has(key) || !Number.isSafeInteger(card.rarity) || !Number.isSafeInteger(card.cardType)) throw new RecognitionError("catalogBinding", `${key}: duplicate or invalid card identity`);
    keys.add(key); Object.freeze(card.characterIds); Object.freeze(card);
  }
  const catalogueSignature = JSON.stringify(cards);
  return Object.freeze({ source: Object.freeze({ server: stamp.server, masterVersion: stamp.masterVersion, sourceId: stamp.sourceId, cards: Object.freeze(cards), catalogueSignature }), catalogue });
}
