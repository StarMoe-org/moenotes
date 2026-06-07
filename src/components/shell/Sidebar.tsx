import { useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { getNavigationGroups, getNavChildren, isCurrentRoute } from "@/lib/route/registry";
import type { AppRoute } from "@/types/route";
import { safeGetLocalStorage, safeSetLocalStorage, safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import { storageKeys } from "@/config/storage";

const groupStorageKey = "moenotes:nav-groups";

interface SidebarProps {
  locale: AppLocale;
  pathname: string;
}

export default function Sidebar({ locale, pathname }: SidebarProps) {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const { isOpen: mobileOpen, close: closeMobile } = useOverlay("mobile-sidebar");
  const groups = useMemo(() => getNavigationGroups(), []);

  useEffect(() => {
    const saved = safeGetSessionStorage(storageKeys.sidebarOpen);
    const next = saved === null ? true : saved === "true";
    setDesktopOpen(next);
    document.documentElement.style.setProperty("--mn-sidebar-offset", next ? "18rem" : "2rem");
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--mn-sidebar-offset", desktopOpen ? "18rem" : "2rem");
    document.documentElement.dataset.sidebar = desktopOpen ? "open" : "closed";
  }, [desktopOpen]);

  useEffect(() => {
    const syncDocument = (open: boolean) => {
      safeSetSessionStorage(storageKeys.sidebarOpen, String(open));
      document.documentElement.style.setProperty("--mn-sidebar-offset", open ? "18rem" : "2rem");
      document.documentElement.dataset.sidebar = open ? "open" : "closed";
    };

    const handler = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) return;
      setDesktopOpen((current) => {
        const next = !current;
        syncDocument(next);
        window.dispatchEvent(new CustomEvent("moenotes:sidebar-state", { detail: { open: next } }));
        return next;
      });
    };

    const stateHandler = (event: Event) => {
      if (!window.matchMedia("(min-width: 768px)").matches) return;
      const next = event instanceof CustomEvent && typeof event.detail?.open === "boolean" ? event.detail.open : document.documentElement.dataset.sidebar !== "closed";
      setDesktopOpen(next);
      syncDocument(next);
    };

    window.addEventListener("moenotes:toggle-desktop-sidebar", handler);
    window.addEventListener("moenotes:sidebar-state", stateHandler);
    return () => {
      window.removeEventListener("moenotes:toggle-desktop-sidebar", handler);
      window.removeEventListener("moenotes:sidebar-state", stateHandler);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      unlockBodyScroll("mobile-sidebar");
      return;
    }
    lockBodyScroll("mobile-sidebar");
    return () => unlockBodyScroll("mobile-sidebar");
  }, [mobileOpen]);

  return (
    <>
      <aside className={`fixed left-4 top-24 z-30 hidden h-[calc(100vh-7.5rem)] w-64 shrink-0 transition-[transform,opacity] duration-300 md:block ${desktopOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[18rem] opacity-0"}`}>
        <SidebarFrame>
          <SidebarNav locale={locale} pathname={pathname} groups={groups} />
        </SidebarFrame>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-[2px]" aria-label={t(locale, "actions.close")} onClick={closeMobile} />
          <aside className="absolute left-3 top-3 h-[calc(100dvh-1.5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)]">
            <SidebarNav locale={locale} pathname={pathname} groups={groups} onNavigate={closeMobile} />
          </aside>
        </div>
      )}
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

function NavGroup({ group, locale, pathname, collapsed, onToggle, onNavigate }: { group: AppRoute; locale: AppLocale; pathname: string; collapsed: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const children = getNavChildren(group);
  const groupActive = isCurrentRoute(pathname, group.path);
  const hasChildren = children.length > 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-3 py-1">
        <a
          href={localizePath(group.path, locale)}
          onClick={onNavigate}
          className={`min-w-0 flex-1 rounded-full px-3 py-1.5 text-[14px] font-black text-[var(--mn-text)] transition-colors hover:bg-[var(--mn-cream-deep)] ${
            groupActive ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : ""
          }`}
        >
          {t(locale, group.labelKey)}
        </a>
        {hasChildren && (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--mn-text-muted)] transition-colors hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
            aria-expanded={!collapsed}
            aria-label={t(locale, group.labelKey)}
            onClick={onToggle}
          >
            <svg className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-0.5">
          {hasChildren ? children.map((item, childIdx) => {
            const active = isCurrentRoute(pathname, item.path);
            return (
              <Fragment key={item.id}>
                {childIdx > 0 && <div className="border-t border-dashed border-[var(--mn-border)] opacity-20 my-0.5 ml-8" />}
                <a
                  href={localizePath(item.path, locale)}
                  onClick={onNavigate}
                  className={`block rounded-full pl-8 pr-4 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)] font-semibold"
                      : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
                  }`}
                >
                  {t(locale, item.labelKey)}
                </a>
              </Fragment>
            );
          }) : (
            <a
              href={localizePath(group.path, locale)}
              onClick={onNavigate}
              className={`block rounded-full pl-8 pr-4 py-1.5 text-[13px] font-medium transition-colors ${
                groupActive
                  ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)] font-semibold"
                  : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
              }`}
            >
              {t(locale, group.labelKey)}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
