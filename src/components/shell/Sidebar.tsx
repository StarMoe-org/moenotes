import { useEffect, useMemo, useState, type ReactNode } from "react";
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
      <aside className={`fixed left-4 top-32 z-30 hidden h-[calc(100vh-9rem)] w-64 shrink-0 transition-[transform,opacity] duration-300 md:block ${desktopOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[18rem] opacity-0"}`}>
        <SidebarFrame>
          <SidebarNav locale={locale} pathname={pathname} groups={groups} />
        </SidebarFrame>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 h-full w-full bg-black/40 backdrop-blur-[2px]" aria-label={t(locale, "actions.close")} onClick={closeMobile} />
          <aside className="absolute left-3 top-3 h-[calc(100dvh-1.5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]">
            <SidebarNav locale={locale} pathname={pathname} groups={groups} onNavigate={closeMobile} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarFrame({ children }: { children: ReactNode }) {
  return <div className="h-full rounded-md border-[2.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]">{children}</div>;
}

function SidebarNav({ locale, pathname, groups, onNavigate }: { locale: AppLocale; pathname: string; groups: AppRoute[]; onNavigate?: () => void }) {
  const activeGroupIds = useMemo(() => groups.filter((group) => isCurrentRoute(pathname, group.path)).map((group) => group.id), [groups, pathname]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
    <nav className="h-full overflow-y-auto p-3" aria-label="Primary">
      <div className="mb-3 border-b-2 border-[var(--mn-border)] pb-3">
        <div className="rounded bg-[var(--mn-accent)] px-3 py-2 font-[var(--mn-font-display)] text-xs uppercase tracking-[0.22em] text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]">Navigation</div>
      </div>
      <div className="mb-2 px-2 font-[var(--mn-font-display)] text-xs tracking-[0.22em] text-[var(--mn-accent)]">SIDEBAR</div>
      <div className="space-y-3">
        {groups.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            locale={locale}
            pathname={pathname}
            collapsed={Boolean(collapsed[group.id]) && !activeGroupIds.includes(group.id)}
            onToggle={() => toggleGroup(group.id)}
            {...(onNavigate ? { onNavigate } : {})}
          />
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
    <section className="rounded border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-2 shadow-[var(--mn-shadow-stamp-sm)]">
      <div className="mb-2 flex items-center gap-2 border-b-2 border-dashed border-[color-mix(in_oklab,var(--mn-border)_30%,transparent)] pb-2">
        <a href={localizePath(group.path, locale)} onClick={onNavigate} className={`min-w-0 flex-1 rounded px-2 py-1.5 ${groupActive ? "bg-[var(--mn-yellow)] text-[var(--mn-text)]" : "hover:bg-[var(--mn-cream-deep)]"}`}>
          <span className="block font-[var(--mn-font-display)] text-[10px] uppercase tracking-[0.18em] text-[var(--mn-accent)]">SECTION</span>
          <span className="block truncate text-sm font-black text-[var(--mn-text)]">{t(locale, group.labelKey)}</span>
        </a>
        <button
          type="button"
          className="grid h-8 w-8 shrink-0 place-items-center rounded border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:bg-[var(--mn-cream-deep)] hover:shadow-[var(--mn-shadow-stamp)] hover:translate-x-[1px] hover:translate-y-[1px]"
          aria-expanded={!collapsed}
          aria-label={t(locale, group.labelKey)}
          onClick={onToggle}
        >
          <svg className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-0"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </div>
      {!collapsed && (
        <div className="space-y-1">
          {hasChildren ? children.map((item) => {
            const active = isCurrentRoute(pathname, item.path);
            return (
              <a key={item.id} href={localizePath(item.path, locale)} onClick={onNavigate} className={`block rounded px-3 py-2 text-sm font-bold transition ${active ? "bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"}`}>
                {t(locale, item.labelKey)}
              </a>
            );
          }) : (
            <a href={localizePath(group.path, locale)} onClick={onNavigate} className={`block rounded px-3 py-2 text-sm font-bold transition ${groupActive ? "bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-[var(--mn-shadow-stamp-sm)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"}`}>
              {t(locale, group.labelKey)}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
