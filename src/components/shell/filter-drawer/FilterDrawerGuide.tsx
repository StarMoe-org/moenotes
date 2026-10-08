import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Grow from "@mui/material/Grow";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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
    <MdMuiProvider>
      <Grow in appear timeout={200}>
        <aside
          aria-label={t(locale, "filter.drawerHintTitle")}
          style={guideLeftStyle}
          className="fixed top-28 z-32 pointer-events-none max-w-[calc(100vw-4.5rem)] sm:max-w-xs select-none"
        >
          <Card
            variant="outlined"
            role="region"
            aria-live="polite"
            sx={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 2.5,
              p: 2,
              borderRadius: 4,
              pointerEvents: "auto",
              bgcolor: "var(--md-sys-color-surface-container)",
              borderColor: "var(--md-sys-color-outline-variant)",
            }}
          >
            {/* Beak pointer arrow */}
            <div
              className="absolute -left-1.5 top-5 h-3 w-3 rotate-45 border-l-[1.5px] border-b-[1.5px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] pointer-events-none"
              aria-hidden="true"
            />

            {/* Header */}
            <div className="flex items-center justify-between gap-2 relative z-10">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-6 w-6 rounded-lg bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] flex items-center justify-center shrink-0">
                  <FilterAltIcon sx={{ fontSize: 14 }} aria-hidden="true" />
                </div>
                <h3 className="text-xs sm:text-sm font-bold font-[var(--mn-font-display)] text-[var(--md-sys-color-on-surface)] truncate">
                  {t(locale, "filter.drawerHintTitle")}
                </h3>
              </div>
              <IconButton size="small" onClick={dismiss} aria-label={t(locale, "actions.close")}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </div>

            {/* Description */}
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed relative z-10">
              {t(locale, "filter.drawerHintBody")}
            </p>

            {/* Dismiss button */}
            <div className="flex items-center justify-end pt-1 relative z-10">
              <Button variant="contained" size="small" onClick={dismiss}>
                {t(locale, "filter.drawerHintDismiss")}
              </Button>
            </div>
          </Card>
        </aside>
      </Grow>
    </MdMuiProvider>
  );
}
