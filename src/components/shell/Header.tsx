import { useEffect, useRef, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import BrandLogo from "@/components/shared/BrandLogo";
import Breadcrumbs from "@/components/shell/Breadcrumbs";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { storageKeys } from "@/config/storage";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { buildBreadcrumbs } from "@/lib/route/breadcrumbs";
import { toggleOverlay } from "@/lib/overlay/overlay-store";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import type { BreadcrumbDetail } from "@/types/route";

interface HeaderProps {
  locale: AppLocale;
  pathname: string;
  breadcrumbDetail?: BreadcrumbDetail | undefined;
}

/** M3 small top app bar: nav icon, wordmark, inline breadcrumbs and actions, with a collapsible breadcrumb row on mobile. */
export default function Header({ locale, pathname, breadcrumbDetail }: HeaderProps) {
  const crumbs = buildBreadcrumbs(pathname, locale, breadcrumbDetail);
  const hasCrumbs = crumbs.length > 1;
  const { isOpen: mobileOpen, toggle: toggleMobile } = useOverlay("mobile-sidebar");
  const [desktopOpen, toggleDesktop] = useSidebarState();
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");
  const [crumbsOpen, setCrumbsOpen] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShortcutLabel(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K");
  }, []);

  useEffect(() => {
    const stored = safeGetLocalStorage(storageKeys.breadcrumbsOpen);
    setCrumbsOpen(stored === null ? true : stored === "true");
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKeys.breadcrumbsOpen && event.newValue !== null) {
        setCrumbsOpen(event.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keep --mn-header-bottom current for the mobile content offset (mobile only; desktop uses fixed padding).
  useEffect(() => {
    const el = headerRef.current;
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(max-width: 767.98px)");
    const update = () => {
      if (!el || !mediaQuery.matches) {
        root.style.removeProperty("--mn-header-bottom");
        return;
      }
      root.style.setProperty("--mn-header-bottom", `${el.offsetHeight + 16}px`);
    };
    update();
    const observer = "ResizeObserver" in window ? new ResizeObserver(update) : undefined;
    if (el && observer) observer.observe(el);
    mediaQuery.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      mediaQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const toggleCrumbs = () => {
    setCrumbsOpen((open) => {
      const next = !open;
      safeSetLocalStorage(storageKeys.breadcrumbsOpen, String(next));
      return next;
    });
  };

  return (
    <MdMuiProvider>
      <AppBar
        ref={headerRef}
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: scrolled ? "var(--md-sys-color-surface-container)" : "var(--md-sys-color-surface)",
          color: "var(--md-sys-color-on-surface)",
          transition: "background-color 200ms",
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, md: 64 }, px: { xs: 1, sm: 2 }, gap: 0.5 }}>
          <IconButton
            onClick={toggleMobile}
            aria-label={t(locale, mobileOpen ? "shell.closeSidebar" : "shell.openSidebar")}
            aria-expanded={mobileOpen}
            color={mobileOpen ? "primary" : "default"}
            sx={{ display: { md: "none" } }}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>
          <IconButton
            onClick={toggleDesktop}
            aria-label={t(locale, desktopOpen ? "shell.closeSidebar" : "shell.openSidebar")}
            aria-expanded={desktopOpen}
            color={desktopOpen ? "primary" : "default"}
            sx={{ display: { xs: "none", md: "inline-flex" } }}
          >
            <MenuIcon />
          </IconButton>

          <Box component="a" href={localizePath("/", locale)} sx={{ display: "flex", alignItems: "center", color: "inherit" }}>
            <BrandLogo className="mn-brand-shell" />
          </Box>

          {hasCrumbs && (
            <IconButton
              size="small"
              onClick={toggleCrumbs}
              aria-label={t(locale, "shell.toggleBreadcrumbs")}
              aria-expanded={crumbsOpen}
              aria-controls="mobile-breadcrumbs"
              sx={{ display: { md: "none" } }}
            >
              <ExpandMoreIcon fontSize="small" sx={{ transform: crumbsOpen ? "rotate(180deg)" : "none", transition: "transform 200ms" }} />
            </IconButton>
          )}

          {hasCrumbs && (
            <Box sx={{ minWidth: 0, flex: 1, display: { xs: "none", md: "block" } }}>
              <Breadcrumbs locale={locale} pathname={pathname} detail={breadcrumbDetail} mode="desktop" />
            </Box>
          )}

          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
            <Tooltip title={`${t(locale, "shell.openCommandPalette")} (${shortcutLabel})`}>
              <IconButton onClick={() => toggleOverlay("command")} aria-label={t(locale, "shell.openCommandPalette")}>
                <SearchIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t(locale, "shell.openSettings")}>
              <IconButton onClick={() => toggleOverlay("settings")} aria-label={t(locale, "shell.openSettings")}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>

        {hasCrumbs && (
          <Collapse in={crumbsOpen} timeout="auto" sx={{ display: { md: "none" } }}>
            <Box id="mobile-breadcrumbs" sx={{ px: 2, pb: 1.5 }}>
              <Divider sx={{ mb: 1, borderStyle: "dashed", borderColor: "var(--md-sys-color-outline-variant)" }} />
              <Breadcrumbs locale={locale} pathname={pathname} detail={breadcrumbDetail} mode="mobile" />
            </Box>
          </Collapse>
        )}
      </AppBar>
    </MdMuiProvider>
  );
}
