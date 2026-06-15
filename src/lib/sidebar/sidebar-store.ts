/**
 * Sidebar state store — single source of truth for desktop sidebar open/closed state.
 *
 * This consolidates state management that was previously scattered across:
 * - apply-theme.ts bootstrap script
 * - HeaderActions.tsx setDesktopSidebar()
 * - Sidebar.tsx multiple useEffects
 * - Custom events moenotes:sidebar-state / moenotes:toggle-desktop-sidebar
 */
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import { storageKeys } from "@/config/storage";

const SIDEBAR_STATE_EVENT = "moenotes:sidebar-state";

export type SidebarStateListener = (open: boolean) => void;

let currentOpen: boolean;
const listeners = new Set<SidebarStateListener>();
let initialized = false;

/** Get current sidebar open state */
export function getSidebarOpen(): boolean {
  if (!initialized) {
    const stored = safeGetSessionStorage(storageKeys.sidebarOpen);
    currentOpen = stored === null ? true : stored === "true";
    initialized = true;
  }
  return currentOpen;
}

/** Set sidebar open state and sync to DOM */
export function setSidebarOpen(open: boolean): void {
  if (currentOpen === open && initialized) return;
  currentOpen = open;
  persistSidebarState(open);
  applySidebarToDocument(open);
  emitSidebarStateChanged(open);
}

/** Toggle sidebar open state */
export function toggleSidebar(): boolean {
  const next = !getSidebarOpen();
  setSidebarOpen(next);
  return next;
}

/** Subscribe to sidebar state changes */
export function subscribeSidebarState(listener: SidebarStateListener): () => void {
  listeners.add(listener);
  listener(getSidebarOpen());
  return () => listeners.delete(listener);
}

/** Initialize sidebar state from storage and apply to document */
export function initSidebarState(): void {
  const open = getSidebarOpen();
  applySidebarToDocument(open);
}

function persistSidebarState(open: boolean): void {
  safeSetSessionStorage(storageKeys.sidebarOpen, String(open));
}

export function applySidebarToDocument(open: boolean): void {
  const root = document.documentElement;
  root.dataset.sidebar = open ? "open" : "closed";
  root.style.setProperty("--mn-sidebar-offset", open ? "18rem" : "2rem");
}

function emitSidebarStateChanged(open: boolean): void {
  for (const listener of listeners) listener(open);
  window.dispatchEvent(new CustomEvent<{ open: boolean }>(SIDEBAR_STATE_EVENT, { detail: { open } }));
}

// Auto-initialize on first import in browser
if (typeof window !== "undefined" && !initialized) {
  // Handle toggle event from keyboard shortcuts
  window.addEventListener("moenotes:toggle-desktop-sidebar", () => {
    toggleSidebar();
  });
}
