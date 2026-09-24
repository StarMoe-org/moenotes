import BrandLogo from "@/components/shared/BrandLogo";
import { useEffect, useMemo, useRef, useState, Fragment, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { localizePath, stripLocaleFromPathname, normalizePathname } from "@/i18n/routing";
import { t } from "@/i18n";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { getNavigationGroups, getNavChildren, isCurrentRoute } from "@/lib/route/registry";
import type { AppRoute, RouteIcon } from "@/types/route";
import { safeGetLocalStorage, safeSetLocalStorage, safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

const groupStorageKey = "moenotes:nav-groups";
const mobileFocusableSelector = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

interface SidebarProps {
  locale: AppLocale;
  pathname: string;
  activePath?: string | undefined;
}

export default function Sidebar({ locale, pathname, activePath }: SidebarProps) {
  const [desktopOpen] = useSidebarState();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const { isOpen: mobileOpen, close: closeMobile } = useOverlay("mobile-sidebar");
  const mobilePanelRef = useRef<HTMLElement>(null);
  const mobileRestoreFocusRef = useRef<HTMLElement | null>(null);
  const groups = useMemo(() => getNavigationGroups(), []);

  // Mark mounted after initial render (for animation)
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      unlockBodyScroll("mobile-sidebar");
      return;
    }
    mobileRestoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll("mobile-sidebar");
    const raf = requestAnimationFrame(() => {
      const firstFocusable = mobilePanelRef.current?.querySelector<HTMLElement>(mobileFocusableSelector);
      (firstFocusable ?? mobilePanelRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      unlockBodyScroll("mobile-sidebar");
      const restoreTarget = mobileRestoreFocusRef.current;
      if (restoreTarget && document.contains(restoreTarget)) {
        requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
      }
    };
  }, [mobileOpen]);

  const handleMobileKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobile();
      return;
    }
    if (event.key === "Tab") trapMobileFocus(event.nativeEvent, mobilePanelRef.current);
  };

  return (
    <>
      <aside
        className="mn-desktop-sidebar fixed top-24 z-30 hidden h-[calc(100vh-7.5rem)] w-64 shrink-0 md:block"
        data-open={desktopOpen}
        data-ready={mounted}
        inert={!desktopOpen}
        aria-hidden={!desktopOpen}
        style={{ left: "calc(max(1.0rem, (100vw - var(--mn-layout-max-width, 120rem)) / 2 + 1.0rem))" }}
      >
        <SidebarFrame>
          <SidebarNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} />
        </SidebarFrame>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[35] md:hidden" role="dialog" aria-modal="true">
            <motion.button
              className="absolute inset-0 h-full w-full mn-overlay-backdrop"
              aria-label={t(locale, "actions.close")}
              onClick={closeMobile}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              ref={mobilePanelRef}
              className="mn-overlay-panel absolute left-4 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]"
              tabIndex={-1}
              aria-label={t(locale, "shell.openSidebar")}
              onKeyDown={handleMobileKeyDown}
              style={{
                top: "var(--mn-header-bottom, 80px)",
                height: "calc(100dvh - var(--mn-header-bottom, 80px) - 16px)"
              }}
              initial={{ x: reducedMotion ? 0 : -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reducedMotion ? 0 : -24, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.16 : 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
              <SidebarNav locale={locale} pathname={pathname} activePath={activePath} groups={groups} onNavigate={closeMobile} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarFrame({ children }: { children: ReactNode }) {
  return <div className="mn-sidebar-frame h-full overflow-hidden rounded-[1.75rem] border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]">{children}</div>;
}

function SidebarNav({ locale, pathname, activePath, groups, onNavigate }: { locale: AppLocale; pathname: string; activePath?: string | undefined; groups: AppRoute[]; onNavigate?: () => void }) {
  const scrollRef = useRef<HTMLElement>(null);
  const activeGroupIds = useMemo(() => groups.filter((group) => isCurrentRoute(activePath || pathname, group.path)).map((group) => group.id), [groups, pathname, activePath]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // 保存滚动位置到 safe-storage — i18n-allow-hardcoded
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          safeSetSessionStorage("moenotes:sidebar-scroll", String(scrollRef.current.scrollTop));
        }
        ticking = false;
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // 恢复滚动位置 — i18n-allow-hardcoded
  useEffect(() => {
    const saved = safeGetSessionStorage("moenotes:sidebar-scroll");
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
    <nav ref={scrollRef} className="mn-orbit-nav h-full overflow-y-auto p-3.5" aria-label="Primary">
      <div className="relative mb-3 overflow-hidden rounded-[1.35rem] border border-[color-mix(in_oklab,var(--mn-border)_18%,transparent)] bg-[var(--mn-cream-deep)] px-4 py-3.5">
        <SidebarDoodle />
        <div className="relative">
          <BrandLogo className="mn-brand-sidebar" />

        </div>
      </div>
      <div className="space-y-2">
        {/* Home link */}
        <a
          href={localizePath("/", locale)}
          aria-current={pathname === "/" ? "page" : undefined}
          onClick={onNavigate}
          className={`group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-[14px] font-black transition-colors ${
            pathname === "/"
              ? "border-[color-mix(in_oklab,var(--mn-accent)_35%,transparent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
              : "border-transparent text-[var(--mn-text)] hover:border-[color-mix(in_oklab,var(--mn-border)_12%,transparent)] hover:bg-[var(--mn-cream-deep)]"
          }`}
        >
          <NavIcon icon="home" active={pathname === "/"} />
          <span>{t(locale, "nav.home")}</span>
        </a>
        <div className="mx-3 border-t border-dashed border-[var(--mn-border)] opacity-20" />
        {groups.map((group, idx) => (
          <Fragment key={group.id}>
            {idx > 0 && <div className="mx-3 border-t border-dashed border-[var(--mn-border)] opacity-20" />}
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
      </div>
    </nav>
  );
}

function trapMobileFocus(event: globalThis.KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(mobileFocusableSelector));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function NavGroup({ group, locale, pathname, activePath, collapsed, onToggle, onNavigate }: { group: AppRoute; locale: AppLocale; pathname: string; activePath?: string | undefined; collapsed: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const children = getNavChildren(group);
  const groupActive = isCurrentRoute(activePath || pathname, group.path);
  const current = stripLocaleFromPathname(activePath || pathname);
  const target = normalizePathname(group.path);
  const isHeaderActive = current === target;
  const hasChildren = children.length > 0;
  return (
    <div className="space-y-1.5">
      <div
        className={`flex items-center justify-between rounded-2xl border py-1 pl-2.5 pr-1 transition-colors ${
          isHeaderActive
            ? "border-[color-mix(in_oklab,var(--mn-accent)_35%,transparent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
            : "border-transparent text-[var(--mn-text)] hover:border-[color-mix(in_oklab,var(--mn-border)_12%,transparent)] hover:bg-[var(--mn-cream-deep)]"
        }`}
      >
        <a
          href={localizePath(group.path, locale)}
          aria-current={isHeaderActive ? "page" : undefined}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 text-[14px] font-black transition-colors"
        >
          <NavIcon icon={group.nav && group.nav.icon ? group.nav.icon : "sparkles"} routeId={group.id} active={groupActive} />
          <span className="truncate">{t(locale, group.labelKey)}</span>
        </a>
        {hasChildren && (
          <button
            type="button"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
              groupActive
                ? "text-[var(--mn-accent-deep)] hover:bg-[var(--mn-accent-soft)]"
                : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
            }`}
            aria-expanded={!collapsed}
            aria-label={t(locale, group.labelKey)}
            onClick={onToggle}
          >
            <svg className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        )}
      </div>
      {hasChildren && !collapsed && (
        <div className="relative ml-[1.15rem] space-y-0.5 border-l border-dashed border-[color-mix(in_oklab,var(--mn-border)_22%,transparent)] pl-3">
          {children.map((item) => {
            const active = isCurrentRoute(activePath || pathname, item.path);
            return (
              <Fragment key={item.id}>
                <a
                  href={localizePath(item.path, locale)}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)] font-semibold"
                      : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
                  }`}
                >
                  <NavIcon icon={item.nav && item.nav.icon ? item.nav.icon : "sparkles"} routeId={item.id} active={active} small />
                  <span className="truncate">{t(locale, item.labelKey)}</span>
                </a>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavIcon({ icon, routeId, active = false, small = false }: { icon: RouteIcon; routeId?: string; active?: boolean; small?: boolean }) {
  const paths: Record<RouteIcon, ReactNode> = {
    home: <><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    music: <><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.3-4 2.1-6 5.5-6s5.2 2 5.5 6M15 5.5a3 3 0 0 1 0 5.8M16 14c2.8.4 4.2 2.3 4.5 5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
    newspaper: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z"/></>,
    wrench: <path d="M14.5 6.5a5 5 0 0 0-6.2 6.2L3 18l3 3 5.3-5.3a5 5 0 0 0 6.2-6.2l-3 3-3-3z"/>,
    sparkles: <><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z"/><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3a6 6 0 0 0 0-12z"/><path d="M7 10h.01M9 6h.01"/></>,
    archive: <><path d="M4 7h16v14H4zM3 3h18v4H3z"/><path d="M9 11h6"/></>,
    "folder-open": <path d="M3 6h7l2 2h9l-2 11H5z"/>,
  };
  const routePaths: Record<string, ReactNode> = {
    cards: <><rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="9" r="2.5"/><path d="M8.5 17c.7-2.3 1.9-3.5 3.5-3.5s2.8 1.2 3.5 3.5"/></>,
    "support-cards": <><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M7 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2"/><path d="m13 7 .9 2.1L16 10l-2.1.9L13 13l-.9-2.1L10 10l2.1-.9z"/></>,
    stamps: <><path d="M8 4h8l1 7 3 3v3H4v-3l3-3z"/><path d="M7 21h10M8 17h8"/></>,
    comics: <><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 11h18M12 3v8M8 11v10"/><path d="m15 15 1.4 1.1 1.8-.4-.6 1.7.9 1.6-1.9-.1-1.2 1.4-.5-1.8-1.7-.7 1.5-1.1z"/></>,
    "main-story": <><path d="M5 4.5A3.5 3.5 0 0 1 8.5 2H12v18H8a3 3 0 0 0-3 3z"/><path d="M12 2h3.5A3.5 3.5 0 0 1 19 5.5V20h-3a4 4 0 0 0-4 3"/><path d="M8 7h2M8 11h2"/></>,
    "friendship-story": <><path d="M12 20S4 15.6 4 9.2C4 5 9.2 3.3 12 7c2.8-3.7 8-2 8 2.2C20 15.6 12 20 12 20Z"/><path d="M8.5 11.5c2 1.5 5 1.5 7 0"/></>,
    "other-story": <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z"/><path d="M9 9h6M9 13h4"/><path d="m17.5 2 .6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z"/></>,
  };
  return <span className={`${small ? "h-6 w-6" : "h-8 w-8"} flex shrink-0 items-center justify-center rounded-xl ${active ? "bg-[var(--mn-paper)] text-[var(--mn-accent-deep)] shadow-[var(--mn-shadow-stamp-sm)]" : "bg-[color-mix(in_oklab,var(--mn-cream-deep)_70%,transparent)] text-[var(--mn-text-muted)]"}`}><svg className={small ? "h-3.5 w-3.5" : "h-4.5 w-4.5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{routeId && routePaths[routeId] ? routePaths[routeId] : paths[icon]}</svg></span>;
}

function SidebarDoodle() {
  return <svg className="absolute -right-2 -top-3 h-24 w-24 text-[var(--mn-accent)] opacity-40" viewBox="0 0 96 96" fill="none" aria-hidden="true"><ellipse cx="48" cy="48" rx="40" ry="16" transform="rotate(-35 48 48)" stroke="currentColor"/><circle cx="48" cy="48" r="28" stroke="currentColor" strokeDasharray="2 6"/><path d="m48 22 5 21 21 5-21 5-5 21-5-21-21-5 21-5z" fill="currentColor"/><circle cx="78" cy="27" r="3" fill="currentColor"/></svg>;
}
