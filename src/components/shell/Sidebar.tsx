import { useEffect, useMemo, useRef, useState, Fragment, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useSettings } from "@/lib/settings/use-settings";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";
import { getNavigationGroups, getNavChildren, isCurrentRoute } from "@/lib/route/registry";
import type { AppRoute } from "@/types/route";
import { safeGetLocalStorage, safeSetLocalStorage, safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";

const groupStorageKey = "moenotes:nav-groups";
const mobileFocusableSelector = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

interface SidebarProps {
  locale: AppLocale;
  pathname: string;
}

export default function Sidebar({ locale, pathname }: SidebarProps) {
  const [desktopOpen, , setDesktopOpen] = useSidebarState();
  const [mounted, setMounted] = useState(false);
  const { isOpen: mobileOpen, close: closeMobile } = useOverlay("mobile-sidebar");
  const { settings } = useSettings();
  const mobilePanelRef = useRef<HTMLElement>(null);
  const mobileRestoreFocusRef = useRef<HTMLElement | null>(null);
  const groups = useMemo(() => getNavigationGroups(), []);

  // Sync from sidebarMode setting to store
  useEffect(() => {
    if (settings.sidebarMode === "expanded") {
      setDesktopOpen(true);
    } else if (settings.sidebarMode === "collapsed") {
      setDesktopOpen(false);
    }
    // "auto" mode: let store manage itself
  }, [settings.sidebarMode, setDesktopOpen]);

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
      <aside className={`fixed left-4 top-24 z-30 hidden h-[calc(100vh-7.5rem)] w-64 shrink-0 md:block ${mounted ? "transition duration-300" : ""} ${desktopOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[18rem] opacity-0"}`}>
        <SidebarFrame>
          <SidebarNav locale={locale} pathname={pathname} groups={groups} />
        </SidebarFrame>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[35] md:hidden" role="dialog" aria-modal="true">
            <motion.button
              className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-[2px]"
              aria-label={t(locale, "actions.close")}
              onClick={closeMobile}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              ref={mobilePanelRef}
              className="absolute left-4 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]"
              tabIndex={-1}
              aria-label={t(locale, "shell.openSidebar")}
              onKeyDown={handleMobileKeyDown}
              style={{
                top: "var(--mn-header-bottom, 80px)",
                height: "calc(100dvh - var(--mn-header-bottom, 80px) - 16px)"
              }}
              initial={{ x: "-105%" }}
              animate={{ x: 0 }}
              exit={{ x: "-105%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
            >
              <SidebarNav locale={locale} pathname={pathname} groups={groups} onNavigate={closeMobile} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarFrame({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)]">{children}</div>;
}

function SidebarNav({ locale, pathname, groups, onNavigate }: { locale: AppLocale; pathname: string; groups: AppRoute[]; onNavigate?: () => void }) {
  const scrollRef = useRef<HTMLElement>(null);
  const activeGroupIds = useMemo(() => groups.filter((group) => isCurrentRoute(pathname, group.path)).map((group) => group.id), [groups, pathname]);
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
    <nav ref={scrollRef} className="h-full overflow-y-auto p-3" aria-label="Primary">
      <div className="space-y-3">
        {/* Home link */}
        <a
          href={localizePath("/", locale)}
          onClick={onNavigate}
          className={`block rounded-full px-4 py-2 text-[14px] font-black transition-colors ${
            pathname === "/"
              ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
              : "text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)]"
          }`}
        >
          {t(locale, "nav.home")}
        </a>
        <div className="border-t border-[var(--mn-border)] opacity-30 my-1" />
        {groups.map((group, idx) => (
          <Fragment key={group.id}>
            {idx > 0 && <div className="border-t border-[var(--mn-border)] opacity-30 my-1" />}
            <NavGroup
              group={group}
              locale={locale}
              pathname={pathname}
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

function NavGroup({ group, locale, pathname, collapsed, onToggle, onNavigate }: { group: AppRoute; locale: AppLocale; pathname: string; collapsed: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const children = getNavChildren(group);
  const groupActive = isCurrentRoute(pathname, group.path);
  const hasChildren = children.length > 0;
  return (
    <div className="space-y-1">
      <div
        className={`flex items-center justify-between rounded-full pl-4 pr-1 py-0.5 transition-colors ${
          groupActive
            ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
            : "text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)]"
        }`}
      >
        <a
          href={localizePath(group.path, locale)}
          onClick={onNavigate}
          className="min-w-0 flex-1 rounded-full py-1.5 text-[14px] font-black transition-colors"
        >
          {t(locale, group.labelKey)}
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
        <div className="space-y-0.5">
          {children.map((item, childIdx) => {
            const active = isCurrentRoute(pathname, item.path);
            return (
              <Fragment key={item.id}>
                {childIdx > 0 && <div className="border-t border-dashed border-[var(--mn-border)] opacity-20 my-0.5 ml-8" />}
                <a
                  href={localizePath(item.path, locale)}
                  onClick={onNavigate}
                  className={`block rounded-full pl-10 pr-4 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)] font-semibold"
                      : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
                  }`}
                >
                  {t(locale, item.labelKey)}
                </a>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
