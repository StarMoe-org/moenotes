import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import type { SxProps, Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import BrandLogo from "@/components/shared/BrandLogo";
import RouteGlyph from "@/components/shared/RouteGlyph";
import SidebarAccount from "@/components/shell/SidebarAccount";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { localizePath, stripLocaleFromPathname, normalizePathname } from "@/i18n/routing";
import { t } from "@/i18n";
import { isTopOverlayLayer } from "@/lib/overlay/layer-stack";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { getNavigationGroups, getNavChildren, isCurrentRoute } from "@/lib/route/registry";
import type { AppRoute } from "@/types/route";
import { safeGetLocalStorage, safeSetLocalStorage, safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

const groupStorageKey = "moenotes:nav-groups";
const scrollStorageKey = "moenotes:sidebar-scroll";

/** M3 navigation-drawer item: a full-width pill, tonal when selected. */
const navItemSx: SxProps<Theme> = {
  borderRadius: 999,
  "&.Mui-selected": {
    bgcolor: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
  "&.Mui-selected:hover": {
    bgcolor: "var(--md-sys-color-secondary-container)",
  },
  "&.Mui-selected .MuiListItemIcon-root": {
    color: "var(--md-sys-color-on-secondary-container)",
  },
};

interface SidebarProps {
  locale: AppLocale;
  pathname: string;
  activePath?: string | undefined;
}

export default function Sidebar({ locale, pathname, activePath }: SidebarProps) {
  const [desktopOpen] = useSidebarState();
  const [mounted, setMounted] = useState(false);
  const { isOpen: mobileOpen, close: closeMobile } = useOverlay("mobile-sidebar");
  useOverlayLayer("mobile-sidebar", mobileOpen);
  const groups = useMemo(() => getNavigationGroups(), []);

  // Mark mounted after initial render (for the open/close animation).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleMobileClose = (_event: object, reason: string) => {
    if (reason === "escapeKeyDown" && !isTopOverlayLayer("mobile-sidebar")) return;
    closeMobile();
  };

  return (
    <MdMuiProvider>
      <aside
        className="mn-desktop-sidebar fixed top-24 z-30 hidden h-[calc(100vh-7.5rem)] w-64 shrink-0 md:block"
        data-open={desktopOpen}
        data-ready={mounted}
        inert={!desktopOpen}
        aria-hidden={!desktopOpen}
        style={{ left: "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem))" }}
      >
        <Paper
          elevation={0}
          sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: "28px",
            bgcolor: "var(--md-sys-color-surface-container-low)",
            border: "1px solid var(--md-sys-color-outline-variant)",
          }}
        >
          <SidebarNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} />
          <SidebarAccount locale={locale} pathname={pathname} />
        </Paper>
      </aside>

      <Drawer
        variant="temporary"
        anchor="left"
        open={mobileOpen}
        onClose={handleMobileClose}
        sx={{ display: { xs: "block", md: "none" } }}
        slotProps={{ paper: { sx: { width: "min(20rem, calc(100vw - 2rem))", borderRadius: "0 16px 16px 0", display: "flex", flexDirection: "column" } } }}
      >
        <SidebarNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} onNavigate={closeMobile} />
        <SidebarAccount locale={locale} pathname={pathname} />
      </Drawer>
    </MdMuiProvider>
  );
}

function SidebarNav({ locale, pathname, activePath, groups, onNavigate }: { locale: AppLocale; pathname: string; activePath?: string | undefined; groups: AppRoute[]; onNavigate?: () => void }) {
  const scrollRef = useRef<HTMLElement>(null);
  const activeGroupIds = useMemo(() => groups.filter((group) => isCurrentRoute(activePath || pathname, group.path)).map((group) => group.id), [groups, pathname, activePath]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Persist the scroll position across navigations.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          safeSetSessionStorage(scrollStorageKey, String(scrollRef.current.scrollTop));
        }
        ticking = false;
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Restore the persisted scroll position once mounted.
  useEffect(() => {
    const saved = safeGetSessionStorage(scrollStorageKey);
    if (saved !== null && scrollRef.current) {
      const scrollTop = parseInt(saved, 10);
      if (!isNaN(scrollTop)) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollTop;
            }
          });
        });
      }
    }
  }, []);

  useEffect(() => {
    const raw = safeGetLocalStorage(groupStorageKey);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === "object") setCollapsed(saved);
      } catch {
        setCollapsed({});
      }
    }
  }, []);

  const toggleGroup = (id: string) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: !current[id] };
      safeSetLocalStorage(groupStorageKey, JSON.stringify(next));
      return next;
    });
  };

  return (
    <nav ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Primary">
      <Box sx={{ px: 1.5, pb: 1, pt: 0.5 }}>
        <BrandLogo className="mn-brand-sidebar" />
      </Box>
      <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        <ListItemButton
          component="a"
          href={localizePath("/", locale)}
          aria-current={pathname === "/" ? "page" : undefined}
          selected={pathname === "/"}
          onClick={onNavigate}
          sx={navItemSx}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <RouteGlyph icon="home" className="h-4 w-4" />
          </ListItemIcon>
          <ListItemText primary={t(locale, "nav.home")} slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 800 } } }} />
        </ListItemButton>
        <Divider sx={{ mx: 1.5, my: 0.5, borderColor: "var(--md-sys-color-outline-variant)" }} />
        {groups.map((group, idx) => (
          <Fragment key={group.id}>
            {idx > 0 && <Divider sx={{ mx: 1.5, my: 0.5, borderColor: "var(--md-sys-color-outline-variant)" }} />}
            <NavGroup
              group={group}
              locale={locale}
              pathname={pathname}
              activePath={activePath}
              collapsed={Boolean(collapsed[group.id]) && !activeGroupIds.includes(group.id)}
              onToggle={() => toggleGroup(group.id)}
              {...(onNavigate ? { onNavigate } : {})}
            />
          </Fragment>
        ))}
      </List>
    </nav>
  );
}

function NavGroup({ group, locale, pathname, activePath, collapsed, onToggle, onNavigate }: { group: AppRoute; locale: AppLocale; pathname: string; activePath?: string | undefined; collapsed: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const children = getNavChildren(group);
  const groupActive = isCurrentRoute(activePath || pathname, group.path);
  const current = stripLocaleFromPathname(activePath || pathname);
  const target = normalizePathname(group.path);
  const isHeaderActive = current === target;
  const hasChildren = children.length > 0;
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <ListItemButton
          component="a"
          href={localizePath(group.path, locale)}
          aria-current={isHeaderActive ? "page" : undefined}
          selected={isHeaderActive}
          onClick={onNavigate}
          sx={navItemSx} style={{ flex: 1, minWidth: 0 }}
        >
          <ListItemIcon sx={{ minWidth: 32, color: groupActive ? "var(--md-sys-color-primary)" : undefined }}>
            <RouteGlyph icon={group.nav && group.nav.icon ? group.nav.icon : "sparkles"} routeId={group.id} className="h-4 w-4" />
          </ListItemIcon>
          <ListItemText
            primary={t(locale, group.labelKey)}
            slotProps={{ primary: { noWrap: true, sx: { fontSize: 14, fontWeight: 800 } } }}
          />
        </ListItemButton>
        {hasChildren && (
          <IconButton size="small" onClick={onToggle} aria-expanded={!collapsed} aria-label={t(locale, group.labelKey)} sx={{ mr: 0.5 }}>
            <ExpandMoreIcon fontSize="small" sx={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 150ms" }} />
          </IconButton>
        )}
      </Box>
      {hasChildren && (
        <Collapse in={!collapsed} timeout="auto" unmountOnExit>
          <Box sx={{ ml: "1.15rem", borderLeft: "1px dashed var(--md-sys-color-outline-variant)", pl: 1 }}>
            <List dense disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.25, py: 0.5 }}>
              {children.map((item) => {
                const active = isCurrentRoute(activePath || pathname, item.path);
                return (
                  <ListItemButton
                    key={item.id}
                    dense
                    component="a"
                    href={localizePath(item.path, locale)}
                    aria-current={active ? "page" : undefined}
                    selected={active}
                    onClick={onNavigate}
                    sx={navItemSx}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <RouteGlyph icon={item.nav && item.nav.icon ? item.nav.icon : "sparkles"} routeId={item.id} className="h-3.5 w-3.5" />
                    </ListItemIcon>
                    <ListItemText
                      primary={t(locale, item.labelKey)}
                      slotProps={{ primary: { noWrap: true, sx: { fontSize: 13, fontWeight: active ? 700 : 500 } } }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}
