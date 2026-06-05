import { getSettings } from "@/lib/settings/store";
import { safeGetSessionStorage, safeRemoveSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import type { ListPageMemoryState, SaveListPageMemoryState } from "@/types/page-state";

function listPageStateKey(routeId: string): string {
  return `moenotes:list-state:${routeId}`;
}

export function saveListPageState(routeId: string, state: SaveListPageMemoryState): ListPageMemoryState | null {
  if (!getSettings().enableScrollMemory) return null;
  const nextState: ListPageMemoryState = {
    ...state,
    updatedAt: Date.now(),
  };
  safeSetSessionStorage(listPageStateKey(routeId), JSON.stringify(nextState));
  return nextState;
}

export function readListPageState(routeId: string): ListPageMemoryState | null {
  if (!getSettings().enableScrollMemory) return null;
  const raw = safeGetSessionStorage(listPageStateKey(routeId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ListPageMemoryState;
    if (typeof parsed.updatedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearListPageState(routeId: string): void {
  safeRemoveSessionStorage(listPageStateKey(routeId));
}
