"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Collapse from "@mui/material/Collapse";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import BrandLogo from "@/components/shared/BrandLogo";
import { Icon } from "@/components/shared/icons";
import RouteGlyph from "@/components/shared/RouteGlyph";
import { withMd3 } from "@/components/md3/Md3Provider";
import SidebarAccount from "@/components/shell/SidebarAccount";
import type { AppLocale } from "@/config/locales";
import { storageKeys } from "@/config/storage";
import { t } from "@/i18n";
import { localizePath, normalizePathname, stripLocaleFromPathname } from "@/i18n/routing";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { getNavChildren, getNavigationGroupId, getNavigationGroups, isCurrentRoute } from "@/lib/route/registry";
import { NAV_GROUP_CHEVRON_ATTRIBUTE, NAV_GROUP_LIST_PREFIX, NAV_GROUPS_STYLE_ID, parseCollapsedGroups, resolveNavGroupEntry, toggleCollapsedGroup, type NavGroupCollapsed } from "@/lib/sidebar/nav-groups";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { safeGetLocalStorage, safeGetSessionStorage, safeRemoveSessionStorage, safeSetLocalStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import type { AppRoute, RouteIcon } from "@/types/route";

interface SidebarProps {
  locale: AppLocale;
  pathname: string;
  activePath?: string | undefined;
}

/**
 * Material 3 navigation drawer, as MoeSekai draws it. From `md` up it is a glass pane floating in its rail beside the
 * content (the top app bar's navigation button folds it away); below `md` it is a modal drawer of thick glass over a
 * scrim. Groups expand in place, the current page carries the seed's tint on the glass, and the account sits at the
 * foot.
 *
 * Folds have one source of truth: the reader's stored state. Entering a group from outside opens it once (see
 * `resolveNavGroupEntry`); the chevron always folds and unfolds afterwards.
 */
function Sidebar({ locale, pathname, activePath }: SidebarProps) {
  const [desktopOpen] = useSidebarState();
  const [ready, setReady] = useState(false);
  const { isOpen: mobileOpen, close: closeMobile } = useOverlay("mobile-sidebar");
  const groups = useMemo(() => getNavigationGroups(), []);
  const current = activePath || pathname;
  const activeGroupId = useMemo(() => getNavigationGroupId(current), [current]);
  const [collapsed, setCollapsed] = useState<NavGroupCollapsed>({});
  const [hydrated, setHydrated] = useState(false);

  // The drawer and the mobile drawer share this state; a group opens only when its page is entered from outside it.
  useEffect(() => {
    const entry = resolveNavGroupEntry(
      parseCollapsedGroups(safeGetLocalStorage(storageKeys.navGroups)),
      activeGroupId,
      safeGetSessionStorage(storageKeys.navActiveGroup),
    );
    setCollapsed(entry.collapsed);
    if (entry.persist) safeSetLocalStorage(storageKeys.navGroups, JSON.stringify(entry.collapsed));
    if (entry.nextPreviousGroupId) safeSetSessionStorage(storageKeys.navActiveGroup, entry.nextPreviousGroupId);
    else safeRemoveSessionStorage(storageKeys.navActiveGroup);
    setHydrated(true);
  }, [activeGroupId]);

  // The head script has already hidden the stored folds in the server markup, so the first paint matches them. Once
  // the folds are on the DOM (the Collapse below re-mounts from them), drop that stylesheet and enable the transitions.
  useEffect(() => {
    if (!hydrated) return;
    document.getElementById(NAV_GROUPS_STYLE_ID)?.remove();
    document.documentElement.removeAttribute("data-nav-groups");
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, [hydrated]);

  const toggleGroup = (id: string) => {
    setCollapsed((state) => {
      const next = toggleCollapsedGroup(state, id);
      safeSetLocalStorage(storageKeys.navGroups, JSON.stringify(next));
      return next;
    });
  };

  return (
    <>
      <aside
        className="mn-desktop-sidebar glass fixed bottom-3 top-[calc(var(--md-app-bar-height,64px)+0.75rem)] z-30 hidden w-[calc(17rem-1.5rem)] overflow-hidden rounded-shape-xl md:block"
        data-open={desktopOpen}
        data-ready={ready}
        inert={!desktopOpen}
        aria-hidden={!desktopOpen}
        style={{ left: "calc(max(0px, (100vw - var(--mn-layout-max-width, 120rem)) / 2) + 0.75rem)" }}
      >
        <div className="flex h-full flex-col">
          <DrawerNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} collapsed={collapsed} onToggle={toggleGroup} animate={ready} initialized={hydrated} />
          <SidebarAccount locale={locale} pathname={pathname} />
        </div>
      </aside>

      <Drawer
        open={mobileOpen}
        onClose={closeMobile}
        anchor="left"
        className="md:hidden"
        slotProps={{ paper: { className: "glass-thick", sx: { width: "min(22.5rem, calc(100vw - 56px))", borderRadius: "0 28px 28px 0" }, "aria-label": t(locale, "shell.navigation") } }}
        ModalProps={{ keepMounted: false }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <a href={localizePath("/", locale)} onClick={closeMobile} className="md3-state rounded-full px-2 py-1 text-on-surface" aria-label={t(locale, "nav.home")}>
            <BrandLogo className="mn-brand-shell" />
          </a>
          <IconButton aria-label={t(locale, "shell.closeSidebar")} onClick={closeMobile}>
            <Icon name="close" />
          </IconButton>
        </div>
        <DrawerNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} collapsed={collapsed} onToggle={toggleGroup} animate={ready} initialized={hydrated} onNavigate={closeMobile} />
        <SidebarAccount locale={locale} pathname={pathname} />
      </Drawer>
    </>
  );
}

function DrawerNav({ locale, pathname, activePath, groups, collapsed, onToggle, animate, initialized, onNavigate }: { locale: AppLocale; pathname: string; activePath?: string | undefined; groups: AppRoute[]; collapsed: NavGroupCollapsed; onToggle: (id: string) => void; animate: boolean; initialized: boolean; onNavigate?: (() => void) | undefined }) {
  const scrollRef = useRef<HTMLElement>(null);
  const current = activePath || pathname;

  // Keep the drawer's scroll position across page loads.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = Number.parseInt(safeGetSessionStorage(storageKeys.sidebarScroll) ?? "", 10);
    if (Number.isFinite(saved)) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = saved; });
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (scrollRef.current) safeSetSessionStorage(storageKeys.sidebarScroll, String(scrollRef.current.scrollTop));
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const home = stripLocaleFromPathname(current) === "/";
  return (
    <nav ref={scrollRef} data-sidebar-nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2" aria-label={t(locale, "shell.navigation")}>
      <NavItem href={localizePath("/", locale)} active={home} onNavigate={onNavigate} icon={<RouteGlyph icon="home" className="h-5 w-5" />}>
        {t(locale, "nav.home")}
      </NavItem>
      {groups.map((group) => (
        <NavGroup
          key={group.id}
          group={group}
          locale={locale}
          current={current}
          collapsed={Boolean(collapsed[group.id])}
          onToggle={() => onToggle(group.id)}
          animate={animate}
          initialized={initialized}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function NavGroup({ group, locale, current, collapsed, onToggle, animate, initialized, onNavigate }: { group: AppRoute; locale: AppLocale; current: string; collapsed: boolean; onToggle: () => void; animate: boolean; initialized: boolean; onNavigate?: (() => void) | undefined }) {
  const children = getNavChildren(group);
  const headerActive = stripLocaleFromPathname(current) === normalizePathname(group.path);
  const listId = `${NAV_GROUP_LIST_PREFIX}${group.id}`;
  // Paths nest (`/music` holds `/music/guess` and song details), so only the longest matching item is current.
  const activeItemId = children.filter((item) => isCurrentRoute(current, item.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.id;
  return (
    <div className="mt-1 border-t border-outline-variant pt-1">
      {/* The group's name opens its hub page; the chevron beside it folds the group. */}
      <div className="relative">
        <a
          href={localizePath(group.path, locale)}
          onClick={onNavigate}
          aria-current={headerActive ? "page" : undefined}
          className={`md3-state flex h-12 items-center rounded-full px-3 text-title-small lg:h-9 ${children.length > 0 ? "pr-12" : ""} ${
            headerActive ? "glass-selected text-on-surface" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="min-w-0 truncate">{t(locale, group.labelKey)}</span>
        </a>
        {children.length > 0 && (
          <IconButton
            size="small"
            className="!absolute right-1 top-1/2 -translate-y-1/2"
            aria-expanded={!collapsed}
            aria-controls={listId}
            aria-label={t(locale, group.labelKey)}
            onClick={onToggle}
            {...{ [NAV_GROUP_CHEVRON_ATTRIBUTE]: group.id }}
          >
            <Icon name="chevronDown" className={`h-5 w-5 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
          </IconButton>
        )}
      </div>
      {children.length > 0 && (
        // The stored folds land in the first client commit; re-mounting the transition at that instant makes it start
        // from `in` (already exited when folded) instead of animating the server's expanded markup while the drawer is
        // being revealed. MUI updates a mounted transition's status from an effect, which raced the reveal and flashed.
        <Collapse key={initialized ? "applied" : "server"} in={!collapsed} timeout={animate ? "auto" : 0}>
          <div id={listId} className="pb-1">
            {children.map((item) => (
              <NavItem
                key={item.id}
                href={localizePath(item.path, locale)}
                active={item.id === activeItemId}
                onNavigate={onNavigate}
                icon={<RouteGlyph icon={(item.nav && item.nav.icon ? item.nav.icon : "sparkles") as RouteIcon} routeId={item.id} className="h-5 w-5" />}
              >
                {t(locale, item.labelKey)}
              </NavItem>
            ))}
          </div>
        </Collapse>
      )}
    </div>
  );
}

/** One drawer destination: a compact pill (48dp, 40dp with a fine pointer); the current page in the seed's glass tint. */
function NavItem({ href, active, onNavigate, icon, children }: { href: string; active: boolean; onNavigate?: (() => void) | undefined; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`md3-state mn-nav-layer flex h-12 items-center gap-3 rounded-full px-3 text-label-large lg:h-10 ${
        active ? "glass-selected text-on-surface" : "text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}

export default withMd3(Sidebar);
