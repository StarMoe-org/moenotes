import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { getNavigationGroups, getNavChildren, isCurrentRoute } from "@/lib/route/registry";
import type { AppRoute } from "@/types/route";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import { storageKeys } from "@/config/storage";

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
    if (saved !== null) setDesktopOpen(saved === "true");
  }, []);

  useEffect(() => {
    const handler = () => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        setDesktopOpen((current) => {
          const next = !current;
          safeSetSessionStorage(storageKeys.sidebarOpen, String(next));
          return next;
        });
      }
    };
    window.addEventListener("moenotes:toggle-desktop-sidebar", handler);
    return () => window.removeEventListener("moenotes:toggle-desktop-sidebar", handler);
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
      <aside className={`fixed left-4 top-20 z-30 hidden h-[calc(100vh-6rem)] w-64 shrink-0 transition-transform duration-300 md:block ${desktopOpen ? "translate-x-0" : "-translate-x-[17rem]"}`}>
        <SidebarNav locale={locale} pathname={pathname} groups={groups} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 h-full w-full bg-black/35 backdrop-blur-sm" aria-label={t(locale, "actions.close")} onClick={closeMobile} />
          <aside className="mn-glass absolute left-3 top-3 h-[calc(100dvh-1.5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[2rem]">
            <SidebarNav locale={locale} pathname={pathname} groups={groups} onNavigate={closeMobile} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarNav({ locale, pathname, groups, onNavigate }: { locale: AppLocale; pathname: string; groups: AppRoute[]; onNavigate?: () => void }) {
  return (
    <nav className="h-full overflow-y-auto p-3" aria-label="Primary">
      <a href={localizePath("/", locale)} onClick={onNavigate} className="mb-2 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-[var(--mn-text)] hover:bg-white/35">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--mn-accent)] text-white">M</span>
        Moenotes
      </a>
      <div className="space-y-3">
        {groups.map((group) => (
          <NavGroup key={group.id} group={group} locale={locale} pathname={pathname} {...(onNavigate ? { onNavigate } : {})} />
        ))}
      </div>
    </nav>
  );
}

function NavGroup({ group, locale, pathname, onNavigate }: { group: AppRoute; locale: AppLocale; pathname: string; onNavigate?: () => void }) {
  const children = getNavChildren(group);
  return (
    <section>
      <a href={localizePath(group.path, locale)} onClick={onNavigate} className={`mb-1 flex items-center justify-between rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] ${isCurrentRoute(pathname, group.path) ? "text-[var(--mn-accent)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}>
        {t(locale, group.labelKey)}
      </a>
      <div className="space-y-1">
        {children.map((item) => (
          <a key={item.id} href={localizePath(item.path, locale)} onClick={onNavigate} className={`block rounded-2xl px-3 py-2 text-sm transition ${isCurrentRoute(pathname, item.path) ? "bg-[var(--mn-accent)] text-white shadow-sm" : "text-[var(--mn-text-muted)] hover:bg-white/35 hover:text-[var(--mn-text)]"}`}>
            {t(locale, item.labelKey)}
          </a>
        ))}
      </div>
    </section>
  );
}
