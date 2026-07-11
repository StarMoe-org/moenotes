import { useCallback, useEffect, useMemo, useState } from "react";
import { clearListPageState, readListPageState, saveListPageState } from "@/lib/scroll/page-state-memory";
import type { ListPageMemoryState, SaveListPageMemoryState } from "@/types/page-state";

export function useListPageMemory(routeId: string) {
  const [state, setState] = useState<ListPageMemoryState | null>(() => readListPageState(routeId));

  useEffect(() => {
    setState(readListPageState(routeId));
  }, [routeId]);

  const saveState = useCallback((nextState: SaveListPageMemoryState) => {
    // Saving is persistence, not a new restore request. Updating `state` here
    // made list pages re-run their scroll restoration while the user was
    // already scrolling.
    return saveListPageState(routeId, nextState);
  }, [routeId]);

  const clearState = useCallback(() => {
    clearListPageState(routeId);
    setState(null);
  }, [routeId]);

  const restoreFocusTarget = useCallback(() => {
    const focusedItemId = readListPageState(routeId)?.focusedItemId;
    if (!focusedItemId || typeof document === "undefined") return null;
    return document.querySelector<HTMLElement>(`[data-list-item-id="${CSS.escape(focusedItemId)}"]`);
  }, [routeId]);

  return useMemo(() => ({
    state,
    saveState,
    clearState,
    restoreFocusTarget,
  }), [state, saveState, clearState, restoreFocusTarget]);
}
