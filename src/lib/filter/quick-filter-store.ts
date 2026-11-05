import { type ReactNode, useEffect, useMemo, useSyncExternalStore } from "react";
import { storageKeys } from "@/config/storage";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

export const FILTER_DRAWER_STORAGE_KEY = storageKeys.filterDrawerOpen;
export const FILTER_DRAWER_EVENT = "moenotes:filter-drawer-change";
export const FILTER_CONTENT_EVENT = "moenotes:filter-content-change";

type UserPreference = boolean | null;

export interface QuickFilterStoreState {
  filterContent: ReactNode | null;
  filterTitle: string;
  hasFilters: boolean;
  isOpen: boolean;
  isDocked: boolean;
}

let memoryPreference: UserPreference = null;
let hasInitializedMemory = false;
let currentFilterContent: ReactNode | null = null;
let currentFilterTitle = "";
let currentIsDocked = false;
let currentOpensDocked = false;

let cachedSnapshot: QuickFilterStoreState = {
  filterContent: null,
  filterTitle: "",
  hasFilters: false,
  isOpen: false,
  isDocked: false,
};

const listeners = new Set<() => void>();

function readSessionPreference(): UserPreference {
  if (typeof window === "undefined") return null;
  if (!hasInitializedMemory) {
    hasInitializedMemory = true;
    const saved = safeGetSessionStorage(FILTER_DRAWER_STORAGE_KEY);
    memoryPreference = saved === null ? null : saved === "true";
  }
  return memoryPreference;
}

function updateSnapshot(): QuickFilterStoreState {
  const pref = readSessionPreference();
  const isDocked = currentIsDocked;
  const hasFilters = currentFilterContent !== null;
  const isOpen = pref !== null ? pref : currentOpensDocked;

  if (
    cachedSnapshot.filterContent === currentFilterContent &&
    cachedSnapshot.filterTitle === currentFilterTitle &&
    cachedSnapshot.hasFilters === hasFilters &&
    cachedSnapshot.isOpen === isOpen &&
    cachedSnapshot.isDocked === isDocked
  ) {
    return cachedSnapshot;
  }

  cachedSnapshot = {
    filterContent: currentFilterContent,
    filterTitle: currentFilterTitle,
    hasFilters,
    isOpen,
    isDocked,
  };
  return cachedSnapshot;
}

function writeSessionPreference(next: boolean) {
  memoryPreference = next;
  safeSetSessionStorage(FILTER_DRAWER_STORAGE_KEY, String(next));
  updateSnapshot();
  syncDocumentFilterState();
  emitChange();
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FILTER_DRAWER_EVENT));
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const handleStorage = (e: StorageEvent) => {
    if (e.key === FILTER_DRAWER_STORAGE_KEY) {
      memoryPreference = e.newValue === null ? null : e.newValue === "true";
      updateSnapshot();
      syncDocumentFilterState();
      callback();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
    window.addEventListener(FILTER_DRAWER_EVENT, callback);
    window.addEventListener(FILTER_CONTENT_EVENT, callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(FILTER_DRAWER_EVENT, callback);
      window.removeEventListener(FILTER_CONTENT_EVENT, callback);
    }
  };
}

function syncDocumentFilterState() {
  if (typeof document === "undefined") return;
  const pref = readSessionPreference();
  const open = pref !== null ? pref : currentOpensDocked;
  const hasFilters = currentFilterContent !== null;
  const isDockedOpen = Boolean(open && currentIsDocked && hasFilters);

  const root = document.documentElement;
  // The docked filter sheet's width becomes --mn-filter-offset (src/styles/tokens.css).
  root.dataset.filterDrawer = isDockedOpen ? "open" : "closed";
  // The filter button hides while the sheet is open, modal or docked; the head script sets the same before paint
  // (src/lib/filter/bootstrap.ts), so the button is not shown only to disappear when an open sheet comes back.
  root.dataset.filterOpen = open ? "true" : "false";
}

export function registerFilters(title: string, content: ReactNode) {
  // A page can register no sheet (the main story has chapters, not filters). Its title must not linger in the store:
  // the next page's button would show it until that page registers its own.
  currentFilterContent = content ?? null;
  currentFilterTitle = content == null ? "" : title;
  updateSnapshot();
  syncDocumentFilterState();
  emitChange();
}

export function unregisterFilters() {
  currentFilterContent = null;
  currentFilterTitle = "";
  updateSnapshot();
  syncDocumentFilterState();
  emitChange();
}

export function openFilterDrawer() {
  writeSessionPreference(true);
}

export function closeFilterDrawer() {
  writeSessionPreference(false);
}

export function toggleFilterDrawer() {
  const pref = readSessionPreference();
  const currentOpen = pref !== null ? pref : currentOpensDocked;
  writeSessionPreference(!currentOpen);
}

// The sheet docks beside the content from 1024px, but opens by itself only from 1600px: next to the 17rem navigation
// drawer its 20rem would leave a narrower window too little room for the list. Until the reader opens or closes it,
// the sheet follows the width.
if (typeof window !== "undefined") {
  const docks = window.matchMedia("(min-width: 1024px)");
  const opensDocked = window.matchMedia("(min-width: 1600px)");
  const track = () => {
    currentIsDocked = docks.matches;
    currentOpensDocked = opensDocked.matches;
    updateSnapshot();
    syncDocumentFilterState();
    emitChange();
  };
  currentIsDocked = docks.matches;
  currentOpensDocked = opensDocked.matches;
  updateSnapshot();
  docks.addEventListener("change", track);
  opensDocked.addEventListener("change", track);
}

function getSnapshot(): QuickFilterStoreState {
  return cachedSnapshot;
}

const ssrSnapshot: QuickFilterStoreState = {
  filterContent: null,
  filterTitle: "",
  hasFilters: false,
  isOpen: false,
  isDocked: false,
};

export function useQuickFilterState(): QuickFilterStoreState & {
  open: () => void;
  close: () => void;
  toggle: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => ssrSnapshot);

  return useMemo(
    () => ({
      ...state,
      open: openFilterDrawer,
      close: closeFilterDrawer,
      toggle: toggleFilterDrawer,
    }),
    [state]
  );
}

/**
 * Register filter content from an explorer page.
 * Automatically unregisters when unmounted.
 */
export function useQuickFilter(title: string, content: ReactNode, deps: React.DependencyList = []) {
  useEffect(() => {
    registerFilters(title, content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, ...deps]);

  useEffect(() => {
    return () => {
      unregisterFilters();
    };
  }, []);
}
