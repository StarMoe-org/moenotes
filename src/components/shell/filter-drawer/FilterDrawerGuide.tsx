import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

const HINT_CHANGE_EVENT = "moenotes:filter-drawer-hint-change";

function readHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  return safeGetLocalStorage(storageKeys.filterDrawerHintSeen) === "true";
}

function subscribeHint(callback: () => void) {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === storageKeys.filterDrawerHintSeen) callback();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
    window.addEventListener(HINT_CHANGE_EVENT, callback);
  }
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(HINT_CHANGE_EVENT, callback);
    }
  };
}

function writeHintSeen() {
  safeSetLocalStorage(storageKeys.filterDrawerHintSeen, "true");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HINT_CHANGE_EVENT));
  }
}

interface FilterDrawerGuideProps {
  locale: AppLocale;
}

export default function FilterDrawerGuide({ locale }: FilterDrawerGuideProps) {
  const { hasFilters, isOpen, isDocked } = useQuickFilterState();
  const [desktopSidebarOpen] = useSidebarState();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasSeenHint = useSyncExternalStore(subscribeHint, readHintSeen, () => true);

  const dismiss = useCallback(() => {
    writeHintSeen();
  }, []);

  const isVisible = Boolean(mounted && hasFilters && !hasSeenHint);

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, dismiss]);

  if (!mounted || !isVisible) return null;

  // Anchor position right next to the tab handle
  let guideLeftStyle: React.CSSProperties = {};
  if (isDocked) {
    if (isOpen) {
      guideLeftStyle = {
        left: desktopSidebarOpen
          ? "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 16rem + 0.75rem + 20rem + 3.25rem)"
          : "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 20rem + 3.25rem)",
      };
    } else {
      guideLeftStyle = {
        left: desktopSidebarOpen
          ? "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 16rem + 3.25rem)"
          : "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 3.25rem)",
      };
    }
  } else {
    guideLeftStyle = { left: "3.5rem" };
  }

  return (
    <AnimatePresence>
      <aside
        aria-label={t(locale, "filter.drawerHintTitle")}
        style={guideLeftStyle}
        className="fixed top-28 z-50 pointer-events-none max-w-[calc(100vw-4.5rem)] sm:max-w-xs select-none"
      >
        <motion.div
          className="pointer-events-auto relative rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)] p-4 flex flex-col gap-2.5 text-[var(--mn-text)]"
          initial={{ opacity: 0, x: -10, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -10, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          role="region"
          aria-live="polite"
        >
          {/* Beak pointer arrow */}
          <div
            className="absolute -left-1.5 top-5 h-3 w-3 rotate-45 border-l-[1.5px] border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] pointer-events-none"
            aria-hidden="true"
          />

          {/* Header */}
          <div className="flex items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-6 w-6 rounded-lg bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)] flex items-center justify-center shrink-0">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <h3 className="text-xs sm:text-sm font-bold font-[var(--mn-font-display)] text-[var(--mn-text)] truncate">
                {t(locale, "filter.drawerHintTitle")}
              </h3>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="mn-stamp-press p-1 text-[var(--mn-text-muted)] hover:text-[var(--mn-text)] rounded-full transition-colors cursor-pointer shrink-0"
              aria-label={t(locale, "actions.close")}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-[var(--mn-text-muted)] leading-relaxed relative z-10">
            {t(locale, "filter.drawerHintBody")}
          </p>

          {/* Dismiss button */}
          <div className="flex items-center justify-end pt-1 relative z-10">
            <button
              type="button"
              onClick={dismiss}
              className="mn-stamp-press px-3.5 py-1.5 rounded-xl text-xs font-bold text-[var(--mn-paper)] bg-[var(--mn-accent)] hover:bg-[var(--mn-accent-deep)] transition-colors cursor-pointer"
            >
              {t(locale, "filter.drawerHintDismiss")}
            </button>
          </div>
        </motion.div>
      </aside>
    </AnimatePresence>
  );
}
