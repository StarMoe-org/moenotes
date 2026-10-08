import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Slide from "@mui/material/Slide";
import type { SxProps, Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilterState } from "@/lib/filter/quick-filter-store";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { isTopOverlayLayer } from "@/lib/overlay/layer-stack";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

export const FILTER_DRAWER_ID = "filter-drawer";

interface FilterDrawerProps {
  locale: AppLocale;
  pathname: string;
}

/** M3 navigation-drawer surface shared by the docked panel and the modal paper. */
const drawerPaperSx: SxProps<Theme> = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: "28px",
  bgcolor: "var(--md-sys-color-surface-container-low)",
  border: "1px solid var(--md-sys-color-outline-variant)",
};

/** Floating modal geometry: below the header, full-bleed on phones, fixed rail on sm+. */
const temporaryPaperSx: SxProps<Theme> = [
  drawerPaperSx,
  {
    top: "var(--mn-header-bottom, 5rem)",
    left: 12,
    right: 12,
    height: "calc(100dvh - var(--mn-header-bottom, 5rem) - 1rem)",
    "@media (min-width:640px)": {
      left: 16,
      right: "auto",
      width: 320,
    },
  },
];

export default function FilterDrawer({ locale, pathname }: FilterDrawerProps) {
  const { filterContent, filterTitle, hasFilters, isOpen, isDocked, close } = useQuickFilterState();
  const [desktopSidebarOpen] = useSidebarState();
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldShow = Boolean(hasFilters && filterContent && isOpen);
  const showTemporary = shouldShow && !isDocked;
  const showDocked = shouldShow && isDocked;
  useOverlayLayer("filter-drawer", showTemporary);

  // Mount timestamp for the scrim anti-misclick guard below. Body scroll lock,
  // focus trap and focus restore come from the MUI drawer itself.
  useEffect(() => {
    if (showTemporary) {
      mountTimeRef.current = Date.now();
    }
  }, [showTemporary]);

  // Scroll restoration per route. Re-runs on shell switches (docked and modal
  // are separate shells, so crossing the lg breakpoint remounts the body).
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
  }, [isOpen, filterContent, scrollStorageKey, showDocked]);

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

  const handleTemporaryClose = useCallback(
    (event: object, reason: string) => {
      // Scrim taps within 400ms of opening, or drags released over the scrim,
      // are ignored: the opening tap must never instantly close the drawer.
      if (reason === "backdropClick") {
        const mouseEvent = event as unknown as React.MouseEvent<HTMLDivElement>;
        if (Date.now() - mountTimeRef.current < 400) {
          scrimPointerDownRef.current = false;
          return;
        }
        if (scrimPointerDownRef.current && mouseEvent.target === mouseEvent.currentTarget) {
          scrimPointerDownRef.current = false;
          mouseEvent.preventDefault();
          mouseEvent.stopPropagation();
          close();
        }
        scrimPointerDownRef.current = false;
        return;
      }
      // Escape ordering across MUI and legacy overlays; IME filtering and
      // event swallowing already happen inside the MUI modal.
      if (reason === "escapeKeyDown") {
        if (!isTopOverlayLayer("filter-drawer")) return;
        close();
      }
    },
    [close]
  );

  if (!mounted) return null;

  const resolvedTitle = filterTitle || t(locale, "filter.title");

  // Geometry calculation:
  // Desktop layout (docked):
  // When desktopSidebarOpen: sits 0.75rem to the right of the 16rem sidebar.
  // When !desktopSidebarOpen: sits at the sidebar left position.
  const desktopLeftStyle: React.CSSProperties = isDocked
    ? {
        left: desktopSidebarOpen
          ? "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem) + 16rem + 0.75rem)"
          : "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem))",
      }
    : {};

  const drawerInner: ReactNode = (
    <>
      {/* Header */}
      <Box
        className="px-4 sm:px-5 py-3.5 select-none shrink-0"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          borderBottom: "1px solid var(--md-sys-color-outline-variant)",
        }}
      >
        <Box
          component="span"
          id={titleId}
          className="truncate"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 0,
            fontFamily: "var(--mn-font-display)",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--md-sys-color-on-surface)",
          }}
        >
          <FilterAltIcon fontSize="small" sx={{ color: "var(--md-sys-color-primary)", flexShrink: 0 }} />
          {resolvedTitle}
        </Box>
        <IconButton
          size="small"
          onClick={close}
          title={t(locale, "filter.collapse")}
          aria-label={t(locale, "actions.close")}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Scrollable Filter Content */}
      <div
        ref={scrollRef}
        data-filter-drawer-body="true"
        onScroll={handleBodyScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5"
      >
        {filterContent}
      </div>
    </>
  );

  return (
    <MdMuiProvider>
      {/* Docked rail (desktop): plain aside, mounted at lg so open/close slides. */}
      {isDocked && (
        <Slide direction="right" in={showDocked} mountOnEnter unmountOnExit appear>
          <aside
            id={FILTER_DRAWER_ID}
            role="complementary"
            aria-labelledby={titleId}
            style={desktopLeftStyle}
            className="fixed top-24 z-30 h-[calc(100vh-7.5rem)] w-80"
          >
            <Paper elevation={0} sx={drawerPaperSx}>
              {drawerInner}
            </Paper>
          </aside>
        </Slide>
      )}

      {/* Floating modal (below lg): MUI owns scrim, escape, focus and scroll lock. */}
      {!isDocked && (
        <Drawer
          variant="temporary"
          anchor="left"
          open={showTemporary}
          onClose={handleTemporaryClose}
          slotProps={{
            backdrop: { onPointerDown: handleScrimPointerDown, className: "touch-none" },
            paper: { id: FILTER_DRAWER_ID, "aria-labelledby": titleId, sx: temporaryPaperSx },
          }}
        >
          {drawerInner}
        </Drawer>
      )}
    </MdMuiProvider>
  );
}
