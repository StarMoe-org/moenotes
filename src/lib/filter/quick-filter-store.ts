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
  const isOpen = pref !== null ? pref : isDocked;

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
  const open = pref !== null ? pref : currentIsDocked;
  const hasFilters = currentFilterContent !== null;
  const isDockedOpen = Boolean(open && currentIsDocked && hasFilters);

  const root = document.documentElement;
  root.dataset.filterDrawer = isDockedOpen ? "open" : "closed";
  root.style.setProperty("--mn-filter-offset", isDockedOpen ? "20.75rem" : "0rem");
}

export function registerFilters(title: string, content: ReactNode) {
  currentFilterTitle = title;
  currentFilterContent = content;
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
  const currentOpen = pref !== null ? pref : currentIsDocked;
  writeSessionPreference(!currentOpen);
}

// Media query tracking for docked screen width (>= 1024px)
if (typeof window !== "undefined") {
  const mql = window.matchMedia("(min-width: 1024px)");
  currentIsDocked = mql.matches;
  updateSnapshot();
  mql.addEventListener("change", (e) => {
    currentIsDocked = e.matches;
    updateSnapshot();
    syncDocumentFilterState();
    emitChange();
  });
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
