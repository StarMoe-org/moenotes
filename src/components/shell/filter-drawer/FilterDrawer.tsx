import { useCallback, useEffect, useId, useRef, useState, type UIEvent } from "react";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

export const FILTER_DRAWER_ID = "filter-drawer";

/** Left edge of the content column: past the layout's side gutter and the docked navigation drawer, or with that drawer
 * folded away, inset from the window as the drawer is (src/components/shell/Sidebar.tsx). */
export const FILTER_DOCK_LEFT = "calc(max(0px, (100vw - var(--mn-layout-max-width, 120rem)) / 2) + max(var(--mn-sidebar-offset, 17rem), 0.75rem))";
/** Width of the docked filter sheet; the content shifts by --mn-filter-offset (src/styles/tokens.css). */
export const FILTER_SHEET_WIDTH = "20rem";

interface FilterDrawerProps {
  locale: AppLocale;
  pathname: string;
}

/**
 * The page's filters as a Material 3 side sheet: from 1024px a standard sheet docked between the navigation drawer
 * and the content (the content moves aside), below it a modal sheet over a scrim (MUI Drawer: focus trap, Escape).
 */
export default function FilterDrawer({ locale, pathname }: FilterDrawerProps) {
  const { filterContent, filterTitle, hasFilters, isOpen, isDocked, close } = useQuickFilterState();
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const shouldShow = Boolean(hasFilters && filterContent && isOpen);
  // The docked sheet mounts when the reader opens it and leaves the DOM after its exit transition. The entrance is a
  // CSS animation on [data-open="true"] rather than a transition: an animation starts with the element even if the
  // first frames are dropped while the page is still hydrating, so the entrance is never skipped or played at a
  // different speed (a transition from the freshly mounted closed state could be coalesced away).
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (shouldShow) {
      setPresent(true);
      return;
    }
    // One frame longer than the 300ms exit, so the slide is never cut off.
    const timer = setTimeout(() => setPresent(false), 350);
    return () => clearTimeout(timer);
  }, [shouldShow]);
  const resolvedTitle = filterTitle || t(locale, "filter.title");

  // Scroll restoration per route.
  const scrollStorageKey = `filter_drawer_scroll:${pathname}`;
  useEffect(() => {
    if (!shouldShow) return;
    const top = Number.parseInt(safeGetSessionStorage(scrollStorageKey) ?? "", 10);
    if (Number.isFinite(top) && top > 0) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = top; });
  }, [shouldShow, filterContent, scrollStorageKey]);
  const handleBodyScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    safeSetSessionStorage(scrollStorageKey, String(event.currentTarget.scrollTop));
  }, [scrollStorageKey]);

  if (!mounted) return null;

  const sheet = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 py-2 pl-6 pr-3">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-title-large text-on-surface">{resolvedTitle}</h2>
        <IconButton aria-label={t(locale, "actions.close")} title={t(locale, "filter.collapse")} onClick={close}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div ref={scrollRef} data-filter-drawer-body="true" onScroll={handleBodyScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-2">
        {filterContent}
      </div>
    </div>
  );

  if (!isDocked) {
    return (
      <Drawer
        anchor="left"
        open={shouldShow}
        onClose={close}
        slotProps={{ paper: { id: FILTER_DRAWER_ID, role: "dialog", "aria-labelledby": titleId, className: "glass-thick", sx: { width: "min(22.5rem, calc(100vw - 56px))", borderRadius: "0 28px 28px 0" } } }}
      >
        {sheet}
      </Drawer>
    );
  }

  // Docked pages mount the sheet in the same commit that opens it, so the content's width change and the entrance
  // start together; `present` only keeps it in the DOM through the exit transition.
  if (!hasFilters || (!shouldShow && !present)) return null;

  return (
    <aside
      id={FILTER_DRAWER_ID}
      aria-labelledby={titleId}
      data-open={shouldShow}
      inert={!shouldShow}
      className="mn-filter-sheet mn-shell-offset glass fixed bottom-3 top-[calc(var(--md-app-bar-height,64px)+0.75rem)] z-30 flex flex-col overflow-hidden rounded-shape-xl"
      style={{ left: FILTER_DOCK_LEFT, width: `calc(${FILTER_SHEET_WIDTH} - 0.75rem)` }}
    >
      {sheet}
    </aside>
  );
}
