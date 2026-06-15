import { shortcuts } from "@/config/shortcuts";
import { getRoutePathById } from "@/lib/route/registry";
import { comboMatchesStep, isEditableTarget, parseShortcut } from "@/lib/shortcuts/parser";

export interface ShortcutHandlers {
  onToggleCommand: () => void;
  onToggleSettings: () => void;
  onToggleSidebar: () => void;
  onShowShortcuts: () => void;
  onCloseOverlay: () => void;
  onNavigate: (path: string) => void;
}

const NAVIGATION_TARGET_ROUTE_IDS: Record<string, string> = {
  "go-home": "home",
  "go-database": "database",
  "go-music": "music",
  "go-characters": "characters",
  "go-events": "events",
};

export function registerShortcutManager(handlers: ShortcutHandlers): () => void {
  let sequence: { token: string; expiresAt: number } | null = null;
  const timeoutMs = 800;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target)) return;
    if (event.repeat) return;

    const now = Date.now();
    if (sequence && sequence.expiresAt < now) sequence = null;

    for (const shortcut of shortcuts) {
      for (const combo of shortcut.combos) {
        const parsed = parseShortcut(combo);
        if (parsed.keys.length === 1 && comboMatchesStep(event, parsed.keys[0] ?? "")) {
          event.preventDefault();
          runShortcut(shortcut.id, handlers);
          sequence = null;
          return;
        }
        if (parsed.keys.length === 2) {
          const first = parsed.keys[0];
          const second = parsed.keys[1];
          if (!sequence && first && comboMatchesStep(event, first)) {
            sequence = { token: first, expiresAt: now + timeoutMs };
            return;
          }
          if (sequence?.token === first && second && comboMatchesStep(event, second)) {
            event.preventDefault();
            runShortcut(shortcut.id, handlers);
            sequence = null;
            return;
          }
        }
      }
    }

    if (sequence) sequence = null;
  };

  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}

function runShortcut(id: string, handlers: ShortcutHandlers) {
  if (id === "toggle-command") handlers.onToggleCommand();
  else if (id === "toggle-settings") handlers.onToggleSettings();
  else if (id === "toggle-sidebar") handlers.onToggleSidebar();
  else if (id === "show-shortcuts") handlers.onShowShortcuts();
  else if (id === "close-overlay") handlers.onCloseOverlay();
  else if (NAVIGATION_TARGET_ROUTE_IDS[id]) handlers.onNavigate(getRoutePathById(NAVIGATION_TARGET_ROUTE_IDS[id]));
}
