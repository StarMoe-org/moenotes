import { useCollectionView } from "@/lib/collection/use-collection-view";

/** How a card list shows its cards: the full list card, or the game's 1:1 square icon. */
export type CardView = "card" | "square";
export const CARD_VIEWS: readonly CardView[] = ["card", "square"];

/**
 * The reader's remembered view of a card list page (`card` while the page hydrates). Kept in local storage under its
 * original key and not mirrored in the URL, as before the generic collection view existed.
 */
export function useCardView(page: string): [CardView, (view: CardView) => void] {
  return useCollectionView(page, CARD_VIEWS, "card", { storage: "local", storageKey: `moenotes:card-view:${page}`, syncUrl: false });
}
