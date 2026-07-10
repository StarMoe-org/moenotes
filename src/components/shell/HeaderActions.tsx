import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { toggleOverlay } from "@/lib/overlay/overlay-store";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useSidebarState } from "@/lib/sidebar/use-sidebar-state";

interface Props {
  locale: AppLocale;
}

const btnStamp = "mn-stamp-press";

/** Hamburger buttons — rendered into the `hamburger` named slot (before logo). */
export function HamburgerButtons({ locale }: Props) {
  const { isOpen: mobileOpen, toggle: toggleMobile } = useOverlay("mobile-sidebar");
  const [desktopOpen, toggleDesktop] = useSidebarState();

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        className={`mn-focus grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-cream-deep)] md:hidden ${btnStamp} ${
          mobileOpen
            ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
            : "bg-[var(--mn-paper)] text-[var(--mn-text)]"
        }`}
        aria-label={t(locale, mobileOpen ? "shell.closeSidebar" : "shell.openSidebar")}
        aria-expanded={mobileOpen}
        onClick={toggleMobile}
      >
        {mobileOpen ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        )}
      </button>

      {/* Desktop hamburger */}
      <button
        type="button"
        className={`mn-focus hidden h-12 w-12 place-items-center rounded-full border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-cream-deep)] md:grid ${btnStamp} ${
          desktopOpen
            ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
            : "bg-[var(--mn-paper)] text-[var(--mn-text-muted)]"
        }`}
        aria-label={t(locale, desktopOpen ? "shell.closeSidebar" : "shell.openSidebar")}
        aria-expanded={desktopOpen}
        onClick={toggleDesktop}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M4 12h12" />
          <path d="M4 17h16" />
        </svg>
      </button>
    </>
  );
}

/** Right-side action buttons — rendered into the default slot (after breadcrumbs). */
export default function HeaderActions({ locale }: Props) {
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");

  useEffect(() => {
    setShortcutLabel(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl K");
  }, []);

  return (
    <div className="ml-auto flex items-center gap-2">
      <button
        type="button"
        className={`mn-focus flex h-10 items-center justify-center rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)] w-10 sm:w-auto px-0 sm:px-4 gap-0 sm:gap-1.5 ${btnStamp}`}
        aria-label={t(locale, "shell.openCommandPalette")}
        onClick={() => toggleOverlay("command")}
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <span className="hidden sm:inline font-black">{shortcutLabel}</span>
      </button>

      {/* Settings gear */}
      <button
        type="button"
        className={`mn-focus h-10 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 text-sm text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-cream-deep)] ${btnStamp}`}
        aria-label={t(locale, "shell.openSettings")}
        onClick={() => toggleOverlay("settings")}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.6 15a1.8 1.8 0 0 0-1.65-1.1H2a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 3.7 8.6a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 9.4 2.35V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
        </svg>
      </button>
    </div>
  );
}
