import { useCallback, useEffect, useState } from "react";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/** How a card list shows its cards: the full list card, or the game's 1:1 square icon. */
export type CardView = "card" | "square";

/** The reader's remembered view of a card list page (`card` while the page hydrates). */
export function useCardView(page: string): [CardView, (view: CardView) => void] {
  const storageKey = `moenotes:card-view:${page}`;
  const [view, setView] = useState<CardView>("card");
  useEffect(() => {
    if (safeGetLocalStorage(storageKey) === "square") setView("square");
  }, [storageKey]);
  const pick = useCallback((next: CardView) => {
    setView(next);
    safeSetLocalStorage(storageKey, next);
  }, [storageKey]);
  return [view, pick];
}
