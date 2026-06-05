import { useCallback, useEffect, useState } from "react";
import { clearListPageState, readListPageState, saveListPageState } from "@/lib/scroll/page-state-memory";
import type { ListPageMemoryState, SaveListPageMemoryState } from "@/types/page-state";

export function useListPageMemory(routeId: string) {
  const [state, setState] = useState<ListPageMemoryState | null>(() => readListPageState(routeId));

  useEffect(() => {
    setState(readListPageState(routeId));
  }, [routeId]);

  const saveState = useCallback((nextState: SaveListPageMemoryState) => {
    const saved = saveListPageState(routeId, nextState);
    setState(saved);
    return saved;
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

  return {
    state,
    saveState,
    clearState,
    restoreFocusTarget,
  };
}
