import { useCallback, useState, useEffect } from "react";
import { motion, AnimatePresence, type MotionStyle } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { FILTER_DRAWER_ID } from "./FilterDrawer";

interface FilterTabHandleProps {
  locale: AppLocale;
}

export default function FilterTabHandle({ locale }: FilterTabHandleProps) {
  const { hasFilters, isOpen, isDocked, toggle, filterTitle } = useQuickFilterState();
  const [desktopSidebarOpen] = useSidebarState();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isVisible = Boolean(mounted && hasFilters && (!isOpen || isDocked));
  const label = filterTitle || t(locale, "filter.title");
  const shortcutLabel = t(locale, "filter.openQuickFilter");

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    [toggle]
  );

  // Position calculation
  let leftStyle: MotionStyle = {};
  if (isDocked) {
    if (isOpen) {
      // Riding outer edge of the docked drawer
      leftStyle = {
        left: desktopSidebarOpen
          ? "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 16rem + 0.75rem + 20rem)"
          : "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 20rem)",
      };
    } else {
      // Riding outer edge of sidebar or left edge
      leftStyle = {
        left: desktopSidebarOpen
          ? "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 16rem)"
          : "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem))",
      };
    }
  } else {
    // Mobile closed position: left 0
    leftStyle = { left: 0 };
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          key="filter-tab-handle"
          type="button"
          onClick={handleClick}
          style={leftStyle}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2 }}
          aria-controls={FILTER_DRAWER_ID}
          aria-expanded={isOpen}
          title={shortcutLabel}
          className="fixed top-32 z-31 group flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 min-h-[48px] rounded-r-2xl border border-l-0 border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] hover:shadow-[var(--mn-shadow-stamp-sm)] transition-shadow cursor-pointer select-none touch-manipulation transform-gpu"
        >
          {/* Funnel Icon */}
          <svg
            className={`h-3.5 w-3.5 text-[var(--mn-accent)] group-hover:scale-110 transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>

          {/* Vertical Label */}
          <span
            className="text-[11px] font-bold tracking-wider leading-none whitespace-nowrap [writing-mode:vertical-rl] text-[var(--mn-text-muted)] group-hover:text-[var(--mn-text)] transition-colors py-1"
            aria-label={label}
          >
            {label}
          </span>

          {/* Chevron Icon */}
          <svg
            className={`h-3 w-3 text-[var(--mn-accent)] group-hover:translate-x-0.5 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
