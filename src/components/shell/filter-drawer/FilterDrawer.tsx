import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

export const FILTER_DRAWER_ID = "filter-drawer";

interface FilterDrawerProps {
  locale: AppLocale;
  pathname: string;
}

export default function FilterDrawer({ locale, pathname }: FilterDrawerProps) {
  const { filterContent, filterTitle, hasFilters, isOpen, isDocked, close } = useQuickFilterState();
  const [desktopSidebarOpen] = useSidebarState();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isModal = Boolean(isOpen && hasFilters && !isDocked);
  const shouldShow = Boolean(hasFilters && filterContent && isOpen);

  useEffect(() => {
    if (isModal) {
      mountTimeRef.current = Date.now();
      lockBodyScroll("filter-drawer");
    } else {
      unlockBodyScroll("filter-drawer");
    }
    return () => {
      unlockBodyScroll("filter-drawer");
    };
  }, [isModal]);

  // Escape key closes modal drawer
  useEffect(() => {
    if (!isModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isModal, close]);

  // Focus management in floating modal
  useEffect(() => {
    if (!isModal) return;
    const raf = requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [isModal]);

  // Scroll restoration per route
  const scrollStorageKey = `filter_drawer_scroll:${pathname}`;
  useEffect(() => {
    if (!isOpen || !filterContent) return;
    const saved = safeGetSessionStorage(scrollStorageKey);
    if (saved) {
      const top = parseInt(saved, 10);
      if (!Number.isNaN(top) && top > 0) {
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = top;
          }
        });
      }
    }
  }, [isOpen, filterContent, scrollStorageKey]);

  const handleBodyScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const top = e.currentTarget.scrollTop;
      safeSetSessionStorage(scrollStorageKey, String(top));
    },
    [scrollStorageKey]
  );

  const scrimPointerDownRef = useRef(false);

  const handleScrimPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      scrimPointerDownRef.current = true;
    }
  }, []);

  const handleScrimClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (Date.now() - mountTimeRef.current < 400) {
        scrimPointerDownRef.current = false;
        return;
      }
      if (scrimPointerDownRef.current && e.target === e.currentTarget) {
        scrimPointerDownRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      scrimPointerDownRef.current = false;
    },
    [close]
  );

  if (!mounted) return null;

  const resolvedTitle = filterTitle || t(locale, "filter.title");

  // Geometry calculation:
  // Desktop layout (docked):
  // When desktopSidebarOpen: sits 0.75rem to the right of the 16rem sidebar.
  // When !desktopSidebarOpen: sits at the sidebar left position.
  const desktopLeftStyle = isDocked
    ? {
        left: desktopSidebarOpen
          ? "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 16rem + 0.75rem)"
          : "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem))",
      }
    : {};

  return (
    <>
      {/* Modal Scrim — small screen only */}
      <AnimatePresence>
        {isModal && (
          <motion.div
            key="filter-drawer-scrim"
            className="fixed inset-0 z-40 mn-overlay-backdrop touch-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onPointerDown={handleScrimPointerDown}
            onClick={handleScrimClick}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Drawer Panel */}
      <AnimatePresence>
        {shouldShow && (
          <motion.aside
            key="filter-drawer"
            id={FILTER_DRAWER_ID}
            role={isModal ? "dialog" : "complementary"}
            aria-modal={isModal ? true : undefined}
            aria-labelledby={titleId}
            style={desktopLeftStyle}
            initial={{ x: isModal ? "-100%" : -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: isModal ? "-100%" : -24, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className={`mn-overlay-panel fixed ${
              isModal
                ? "left-3 right-3 sm:left-4 sm:right-auto sm:w-80 top-[var(--mn-header-bottom,5rem)] h-[calc(100dvh-var(--mn-header-bottom,5rem)-1rem)] z-45"
                : "top-24 h-[calc(100vh-7.5rem)] w-80 z-30"
            } flex flex-col overflow-hidden rounded-[1.75rem] border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)] transform-gpu`}
          >
            <div ref={panelRef} tabIndex={-1} className="flex flex-col flex-1 min-h-0 outline-none">
              {/* Header */}
              <div className="mn-overlay-heading flex items-center justify-between border-b-2 border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_10%,transparent)] to-transparent px-4 sm:px-5 py-3.5 select-none shrink-0">
                <span
                  id={titleId}
                  className="flex items-center gap-2 truncate font-[var(--mn-font-display)] text-sm font-bold tracking-tight text-[var(--mn-text)]"
                >
                  <svg className="h-4 w-4 text-[var(--mn-accent)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {resolvedTitle}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                  }}
                  className="mn-stamp-press grid h-7 w-7 place-items-center rounded-full border border-[var(--mn-border)] bg-[var(--mn-surface)] text-[var(--mn-text-muted)] hover:text-[var(--mn-text)] cursor-pointer shrink-0"
                  title={t(locale, "filter.collapse")}
                  aria-label={t(locale, "actions.close")}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scrollable Filter Content */}
              <div
                ref={scrollRef}
                data-filter-drawer-body="true"
                onScroll={handleBodyScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5"
              >
                {filterContent}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
