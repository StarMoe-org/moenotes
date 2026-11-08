import type { BoxCard, CardBox, CardKind } from "@/lib/box/model";

/**
 * Stable master-identity key (`member:51` or `snap:76`) for cards with a known catalog ID,
 * falling back to `key:<card.key>` only for unverified/unrecognized drafts.
 */
export function stableCardIdentity(card: Pick<BoxCard, "kind" | "identity" | "key">): string {
  if (card.identity.value !== null && card.identity.value !== "") {
    return `${card.kind}:${card.identity.value}`;
  }
  return `key:${card.key}`;
}

export interface ReconciledCardSelections {
  readonly required: Set<string>;
  readonly excluded: Set<string>;
  readonly leaderKey: string | null;
}

/**
 * Reconcile `required`, `excluded`, and `leaderKey` across Box updates (OCR/video sync, local save import,
 * Box switching, and Theoretical Max practice toggles) by stable `(kind, identity.value)` rather than
 * ephemeral `card.key` UUIDs (`fb4a5d0`).
 */
export function reconcileCardSelections(
  previousCards: readonly BoxCard[],
  nextBox: CardBox | null,
  previous: ReconciledCardSelections,
): ReconciledCardSelections {
  if (!nextBox || nextBox.cards.length === 0) {
    return { required: new Set(), excluded: new Set(), leaderKey: null };
  }

  const prevByKey = new Map<string, BoxCard>(previousCards.map((card) => [card.key, card]));
  const nextByKey = new Map<string, BoxCard>(nextBox.cards.map((card) => [card.key, card]));
  const nextByIdentity = new Map<string, BoxCard>();
  for (const card of nextBox.cards) {
    const id = stableCardIdentity(card);
    if (!nextByIdentity.has(id)) {
      nextByIdentity.set(id, card);
    }
  }

  const resolveNextKey = (oldKey: string, expectedKind?: CardKind): string | null => {
    const prevCard = prevByKey.get(oldKey);
    if (prevCard) {
      if (expectedKind && prevCard.kind !== expectedKind) return null;
      const byIdentity = nextByIdentity.get(stableCardIdentity(prevCard));
      if (byIdentity) return byIdentity.key;
    }
    const direct = nextByKey.get(oldKey);
    if (direct && (!expectedKind || direct.kind === expectedKind)) {
      return direct.key;
    }
    return null;
  };

  const nextRequired = new Set<string>();
  for (const key of previous.required) {
    const mapped = resolveNextKey(key);
    if (mapped) nextRequired.add(mapped);
  }

  const nextExcluded = new Set<string>();
  for (const key of previous.excluded) {
    const mapped = resolveNextKey(key);
    if (mapped && !nextRequired.has(mapped)) nextExcluded.add(mapped);
  }

  const nextLeader = previous.leaderKey ? resolveNextKey(previous.leaderKey, "member") : null;
  if (nextLeader && nextExcluded.has(nextLeader)) {
    nextExcluded.delete(nextLeader);
  }

  return {
    required: nextRequired,
    excluded: nextExcluded,
    leaderKey: nextLeader,
  };
}
