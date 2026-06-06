import { useEffect } from "react";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { closeOverlay, openOverlay, toggleOverlay } from "@/lib/overlay/overlay-store";
import { registerShortcutManager } from "@/lib/shortcuts/manager";

interface OverlayHostProps {
  locale: AppLocale;
}

export default function OverlayHost({ locale }: OverlayHostProps) {
  useEffect(() => {
    const toggleCommand = () => toggleOverlay("command");
    const toggleSettings = () => toggleOverlay("settings");
    const toggleSidebar = () => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        window.dispatchEvent(new Event("moenotes:toggle-desktop-sidebar"));
      } else {
        toggleOverlay("mobile-sidebar");
      }
    };
    const openMobileSidebar = () => openOverlay("mobile-sidebar");
    const toggleShortcuts = () => toggleOverlay("shortcuts");
    const closeActive = () => closeOverlay();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOverlay();
    };

    window.addEventListener("moenotes:toggle-command", toggleCommand);
    window.addEventListener("moenotes:toggle-settings", toggleSettings);
    window.addEventListener("moenotes:toggle-sidebar", toggleSidebar);
    window.addEventListener("moenotes:open-mobile-sidebar", openMobileSidebar);
    window.addEventListener("moenotes:toggle-shortcuts", toggleShortcuts);
    window.addEventListener("moenotes:close-overlay", closeActive);
    document.addEventListener("keydown", onKeyDown);

    const unregisterShortcuts = registerShortcutManager({
      onToggleCommand: toggleCommand,
      onToggleSettings: toggleSettings,
      onToggleSidebar: toggleSidebar,
      onShowShortcuts: toggleShortcuts,
      onCloseOverlay: closeActive,
      onNavigate: (path) => {
        closeOverlay();
        window.location.href = localizePath(path, locale);
      },
    });

    return () => {
      unregisterShortcuts();
      window.removeEventListener("moenotes:toggle-command", toggleCommand);
      window.removeEventListener("moenotes:toggle-settings", toggleSettings);
      window.removeEventListener("moenotes:toggle-sidebar", toggleSidebar);
      window.removeEventListener("moenotes:open-mobile-sidebar", openMobileSidebar);
      window.removeEventListener("moenotes:toggle-shortcuts", toggleShortcuts);
      window.removeEventListener("moenotes:close-overlay", closeActive);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [locale]);

  return null;
}
