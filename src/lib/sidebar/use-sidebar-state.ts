/**
 * React hook for sidebar state — useSyncExternalStore wrapper around sidebar-store.
 */
import { useSyncExternalStore, useCallback } from "react";
import {
  getSidebarOpen,
  setSidebarOpen,
  toggleSidebar,
  subscribeSidebarState,
} from "./sidebar-store";

/**
 * Hook to access and control desktop sidebar open state.
 * Returns [open, toggle, setOpen] tuple.
 */
export function useSidebarState(): readonly [
  open: boolean,
  toggle: () => void,
  setOpen: (open: boolean) => void,
] {
  const open = useSyncExternalStore<boolean>(
    subscribeSidebarState,
    getSidebarOpen,
    getSidebarOpen, // SSR snapshot
  );

  const handleToggle = useCallback(() => {
    toggleSidebar();
  }, []);

  const handleSetOpen = useCallback((next: boolean) => {
    setSidebarOpen(next);
  }, []);

  return [open, handleToggle, handleSetOpen] as const;
}
