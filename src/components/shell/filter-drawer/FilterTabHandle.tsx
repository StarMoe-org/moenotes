import { useCallback, useState, useEffect } from "react";
import ButtonBase from "@mui/material/ButtonBase";
import Slide from "@mui/material/Slide";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    },
    [toggle]
  );

  // Position calculation
  let leftStyle: React.CSSProperties = {};
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
    <MdMuiProvider>
      <Slide direction="right" in={isVisible} mountOnEnter unmountOnExit appear>
        <ButtonBase
          type="button"
          onClick={handleClick}
          style={leftStyle}
          aria-controls={FILTER_DRAWER_ID}
          aria-expanded={isOpen}
          title={shortcutLabel}
          sx={{ overflow: "hidden" }}
          className="fixed top-32 z-31 group flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 min-h-[48px] rounded-r-2xl border border-l-0 border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] cursor-pointer select-none touch-manipulation"
        >
          {/* Funnel Icon */}
          <FilterAltIcon
            className={`text-[var(--md-sys-color-primary)] group-hover:scale-110 transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
            sx={{ fontSize: 14 }}
            aria-hidden="true"
          />

          {/* Vertical Label */}
          <span
            className="text-[11px] font-bold tracking-wider leading-none whitespace-nowrap [writing-mode:vertical-rl] text-[var(--md-sys-color-on-surface-variant)] group-hover:text-[var(--md-sys-color-on-surface)] transition-colors py-1"
            aria-label={label}
          >
            {label}
          </span>

          {/* Chevron Icon */}
          <ChevronRightIcon
            className={`text-[var(--md-sys-color-primary)] group-hover:translate-x-0.5 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
            sx={{ fontSize: 12 }}
            aria-hidden="true"
          />
        </ButtonBase>
      </Slide>
    </MdMuiProvider>
  );
}
