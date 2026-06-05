import { storageKeys } from "@/config/storage";
import { getSettings } from "@/lib/settings/store";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

export interface ScrollState {
  x: number;
  y: number;
  savedAt: number;
  payload?: Record<string, unknown>;
}

export function scrollKey(pathname: string, search = ""): string {
  return `${storageKeys.scrollPrefix}${pathname}${search}`;
}

export function saveScrollState(pathname: string, search = "", payload?: Record<string, unknown>): void {
  if (!getSettings().enableScrollMemory) return;
  const state: ScrollState = { x: window.scrollX, y: window.scrollY, savedAt: Date.now() };
  if (payload) state.payload = payload;
  safeSetSessionStorage(scrollKey(pathname, search), JSON.stringify(state));
}

export function readScrollState(pathname: string, search = ""): ScrollState | null {
  const raw = safeGetSessionStorage(scrollKey(pathname, search));
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as ScrollState;
    if (typeof state.y !== "number" || typeof state.x !== "number") return null;
    return state;
  } catch {
    return null;
  }
}

export function restoreScrollState(pathname: string, search = ""): void {
  if (!getSettings().enableScrollMemory) return;
  if (window.location.hash) return;
  const state = readScrollState(pathname, search);
  if (!state) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ left: state.x, top: state.y, behavior: "instant" });
    });
  });
}
